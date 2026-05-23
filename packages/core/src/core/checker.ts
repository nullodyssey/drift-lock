import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import type { DriftAdoptionMode, DriftContractsIndex, DriftDiagnostic, DriftError, DriftExtractedContract } from '../types.js';
import { changedContracts, resolveCheckScope } from './contract-selection.js';
import { driftError, toDiagnostic } from './errors.js';
import { extractContracts, type ExtractOptions } from './extractor.js';
import { buildHelperContracts } from './helper-summaries.js';
import { readIndex, toIndex } from './index-file.js';
import { checkLockedChanges } from './locked-contracts.js';
import { moduleSpecifierCandidates } from './module-specifier.js';
import { checkRequiredContracts } from './required-contracts.js';
import { checkSsotFlow } from './rules/ssot-flow/index.js';

/* @drift
version: 1
id: core.checker
scope: file
stability: locked

intent: >
  Validate extracted Drift contracts against executable invariants, required-file
  coverage, and locked-contract baselines.

ssot:
  extractor: "./extractor.ts"

invariants:
  - id: checks-extracted-contracts
    enforce: drift/ssot-usage
    ssot: extractor

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
  const { gitScope, scopedIndex, extractFiles } = await resolveCheckScope(
    {
      root,
      sourceDir: options.sourceDir,
      files: options.files,
      gitBase: options.gitBase,
    },
    index,
  );
  const extracted = await extractContracts({ ...options, files: extractFiles });
  const diagnostics = extracted.errors.map((error) => toDiagnostic(error));
  diagnostics.push(
    ...(await checkRequiredContracts({
      root,
      sourceDir: options.sourceDir,
      files: extractFiles,
      contracts: extracted.contracts,
      patterns: options.requireContracts ?? [],
      adoptionMode: options.adoptionMode ?? 'enforce',
    })),
  );
  if (gitScope && index) {
    diagnostics.push(...checkScopedDuplicateIds(extracted.contracts, index, gitScope.contractFiles).map((error) => toDiagnostic(error)));
  }
  const contractsToCheck = options.changedOnly
    ? changedContracts(extracted.contracts, scopedIndex, gitScope?.impactedContractIds)
    : extracted.contracts;
  // Helper summaries need the full index; scopedIndex only decides which contracts run.
  const helperContracts = buildHelperContracts(index, toIndex(extracted.contracts).contracts);

  // Run invariant checks only after extraction. Schema/ancrage errors should not
  // prevent other valid contracts in the repo from being checked.
  for (const contract of contractsToCheck) {
    const text = await readFile(path.resolve(root, contract.file), 'utf8');
    diagnostics.push(...checkSsotUsage(contract, text).map((error) => toDiagnostic(error)));
    diagnostics.push(...checkSsotFlow(contract, text, { helperContracts }).map((error) => toDiagnostic(error)));
  }

  // Without a committed index there is no trustworthy baseline for locked
  // contracts, so V1 skips only locked-change detection.
  if (scopedIndex) {
    diagnostics.push(...checkLockedChanges(root, extracted.contracts, scopedIndex).map((error) => toDiagnostic(error)));
  }

  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  return { contracts: extracted.contracts, diagnostics, errors };
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

export { checkLockedChanges, checkLockedChangesForFile } from './locked-contracts.js';
