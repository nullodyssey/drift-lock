import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import type { DriftAdoptionMode, DriftContractsIndex, DriftDiagnostic, DriftDiagnosticSeverity, DriftError, DriftExtractedContract, DriftSource } from '../types.js';
import { diffContractSets } from './contract-diff.js';
import { filesMatchingRequireContractPatterns, firstMatchingRequireContractPattern } from './coverage.js';
import { driftError, toDiagnostic } from './errors.js';
import { extractContracts, type ExtractOptions } from './extractor.js';
import { discoverSourceFiles } from './files.js';
import { filterIndexByFiles, resolveGitFileScope } from './git-scope.js';
import { readIndex, toIndex } from './index-file.js';
import { moduleSpecifierCandidates } from './module-specifier.js';
import { checkSsotFlow } from './ssot-flow.js';

/* @drift
version: 1
id: core.checker
scope: file
stability: locked

intent: >
  Validate extracted Drift contracts against executable invariants, required-file
  coverage, and locked-contract baselines.

llm:
  must_not_change:
    - Locked contracts must compare against the committed index before passing.
    - Required contract checks must use the configured source files.
    - Schema extraction errors must not prevent valid contracts from being checked.
*/
export type CheckOptions = ExtractOptions & {
  indexPath?: string;
  changedOnly?: boolean;
  gitBase?: string;
  requireContracts?: string[];
  adoptionMode?: DriftAdoptionMode;
};

export async function checkContracts(options: CheckOptions): Promise<{
  contracts: DriftExtractedContract[];
  diagnostics: DriftDiagnostic[];
  errors: DriftError[];
}> {
  const root = path.resolve(options.root);
  const index = await readIndex(root, options.indexPath);
  const gitScope = options.gitBase ? await resolveGitFileScope(root, options.gitBase, options.sourceDir, index) : undefined;
  const scopedIndex = gitScope && index ? filterIndexByFiles(index, gitScope.contractFiles) : index;
  const extractFiles = gitScope?.extractFiles ?? options.files;
  const extracted = await extractContracts({ ...options, files: extractFiles });
  const diagnostics = extracted.errors.map((error) => toDiagnostic(error));
  diagnostics.push(
    ...(await checkRequiredContracts(
      root,
      options.sourceDir,
      extractFiles,
      extracted.contracts,
      options.requireContracts ?? [],
      options.adoptionMode ?? 'enforce',
    )),
  );
  if (gitScope && index) {
    diagnostics.push(...checkScopedDuplicateIds(extracted.contracts, index, gitScope.contractFiles).map((error) => toDiagnostic(error)));
  }
  const contractsToCheck = options.changedOnly
    ? changedContracts(extracted.contracts, scopedIndex, gitScope?.impactedContractIds)
    : extracted.contracts;

  // Run invariant checks only after extraction. Schema/ancrage errors should not
  // prevent other valid contracts in the repo from being checked.
  for (const contract of contractsToCheck) {
    const text = await readFile(path.resolve(root, contract.file), 'utf8');
    diagnostics.push(...checkSsotUsage(contract, text).map((error) => toDiagnostic(error)));
    diagnostics.push(...checkSsotFlow(contract, text).map((error) => toDiagnostic(error)));
  }

  // Without a committed index there is no trustworthy baseline for locked
  // contracts, so V1 skips only locked-change detection.
  if (scopedIndex) {
    diagnostics.push(...checkLockedChanges(root, extracted.contracts, scopedIndex).map((error) => toDiagnostic(error)));
  }

  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  return { contracts: extracted.contracts, diagnostics, errors };
}

async function checkRequiredContracts(
  root: string,
  sourceDir: DriftSource | undefined,
  files: string[] | undefined,
  contracts: DriftExtractedContract[],
  patterns: string[],
  adoptionMode: DriftAdoptionMode,
): Promise<DriftDiagnostic[]> {
  if (patterns.length === 0) return [];
  const sourceFiles = files ?? (await discoverSourceFiles(root, sourceDir));
  const filesWithContracts = new Set(contracts.map((contract) => contract.file));
  const severity = severityForAdoptionMode(adoptionMode);
  return filesMatchingRequireContractPatterns(sourceFiles, patterns)
    .filter((file) => !filesWithContracts.has(file))
    .map((file) =>
      toDiagnostic(
        driftError('DRIFT015_REQUIRED_CONTRACT_MISSING', file, {
          pattern: firstMatchingRequireContractPattern(file, patterns) ?? patterns[0],
        }),
        severity,
      ),
    );
}

function severityForAdoptionMode(mode: DriftAdoptionMode): DriftDiagnosticSeverity {
  if (mode === 'audit') return 'info';
  if (mode === 'warn') return 'warning';
  return 'error';
}

function checkScopedDuplicateIds(
  contracts: DriftExtractedContract[],
  index: DriftContractsIndex,
  scopedFiles: string[],
): DriftError[] {
  const errors: DriftError[] = [];
  const scopedFileSet = new Set(scopedFiles);
  const indexedById = new Map(index.contracts.map((contract) => [contract.id, contract]));

  for (const contract of contracts) {
    const indexed = indexedById.get(contract.id);
    if (!indexed) continue;
    if (indexed.file === contract.file) continue;
    if (scopedFileSet.has(indexed.file)) continue;
    errors.push(
      driftError(
        'DRIFT005_DUPLICATE_CONTRACT_ID',
        contract.file,
        { id: contract.id },
        { line: contract.line, column: contract.column },
      ),
    );
  }

  return errors;
}

function changedContracts(
  contracts: DriftExtractedContract[],
  index: DriftContractsIndex | undefined,
  impactedContractIds: string[] = [],
): DriftExtractedContract[] {
  if (!index) return contracts;
  const changedIds = new Set(diffContractSets(toIndex(contracts).contracts, index.contracts).changes.map((change) => change.id));
  for (const id of impactedContractIds) changedIds.add(id);
  return contracts.filter((contract) => changedIds.has(contract.id));
}

export function checkSsotUsage(contract: DriftExtractedContract, text: string): DriftError[] {
  const errors: DriftError[] = [];
  const invariants = contract.invariants ?? [];
  const ssot = contract.ssot ?? {};

  for (const invariant of invariants) {
    if (invariant.enforce !== 'drift/ssot-usage' || !invariant.ssot) continue;
    const ssotPath = ssot[invariant.ssot];
    if (!ssotPath) continue;
    if (!usesSsot(text, contract, ssotPath)) {
      errors.push(
        driftError(
          'DRIFT010_SSOT_NOT_USED',
          contract.file,
          { id: contract.id, ssotKey: invariant.ssot, ssotPath },
          { line: contract.line, column: contract.column },
        ),
      );
    }
  }

  return errors;
}

function usesSsot(text: string, contract: DriftExtractedContract, ssotPath: string): boolean {
  const anchoredText = text.slice(contract.bodyStart, contract.bodyEnd);
  const ssotCandidates = moduleSpecifierCandidates(ssotPath);
  if (ssotCandidates.some((candidate) => anchoredText.includes(candidate))) return true;

  // V1 treats imports as sufficient SSOT usage. This is intentionally shallow:
  // the goal is catching obvious local replacements, not proving data flow.
  const sourceFile = ts.createSourceFile(contract.file, text, ts.ScriptTarget.Latest, true);
  return sourceFile.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
    const importedPath = statement.moduleSpecifier.text;
    return ssotCandidates.includes(importedPath);
  });
}

export function checkLockedChanges(
  root: string,
  contracts: DriftExtractedContract[],
  index: DriftContractsIndex,
): DriftError[] {
  const errors: DriftError[] = [];
  const currentById = new Map(contracts.map((contract) => [contract.id, contract]));

  // Locked contracts are compared by canonical content hash, not raw text, so
  // whitespace and YAML comments do not force acceptance files.
  for (const previous of index.contracts) {
    if (previous.stability !== 'locked') continue;
    const current = currentById.get(previous.id);
    if (current && current.contentHash === previous.contentHash) continue;
    const acceptance = readAcceptanceSync(root, previous.id);
    if (acceptance.valid) continue;
    const currentLocation = current ? { file: current.file, line: current.line, column: current.column } : undefined;
    errors.push(
      driftError(
        acceptance.exists ? 'DRIFT012_INVALID_ACCEPTANCE_FILE' : 'DRIFT011_LOCKED_CONTRACT_CHANGED',
        currentLocation?.file ?? previous.file,
        { id: previous.id },
        { line: currentLocation?.line, column: currentLocation?.column },
      ),
    );
  }

  return errors;
}

export function checkLockedChangesForFile(
  root: string,
  file: string,
  contracts: DriftExtractedContract[],
  index: DriftContractsIndex,
): DriftError[] {
  return checkLockedChanges(
    root,
    contracts,
    {
      ...index,
      contracts: index.contracts.filter((contract) => contract.file === file),
    },
  );
}

function readAcceptanceSync(root: string, id: string): { exists: boolean; valid: boolean } {
  const file = path.join(root, '.drift', 'accepted-contract-changes', `${id}.md`);
  try {
    // Use TypeScript's sys API here to keep this helper synchronous without
    // pulling sync fs calls through the rest of the checker API.
    const fs = ts.sys;
    const content = fs.readFile(file);
    if (content === undefined) return { exists: false, valid: false };
    if (!content) return { exists: true, valid: false };
    const contract = content.match(/^contract:\s*(.+)$/m)?.[1]?.trim();
    const reason = content.match(/^reason:\s*(.+)$/m)?.[1]?.trim();
    return { exists: true, valid: contract === id && typeof reason === 'string' && reason.length >= 20 };
  } catch {
    return { exists: false, valid: false };
  }
}
