import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import type { DriftContractsIndex, DriftError, DriftExtractedContract } from '../types.js';
import { driftError } from './errors.js';
import { extractContracts, type ExtractOptions } from './extractor.js';
import { readIndex } from './index-file.js';

export type CheckOptions = ExtractOptions & {
  indexPath?: string;
};

export async function checkContracts(options: CheckOptions): Promise<{
  contracts: DriftExtractedContract[];
  errors: DriftError[];
}> {
  const root = path.resolve(options.root);
  const extracted = await extractContracts(options);
  const errors = [...extracted.errors];
  const index = await readIndex(root, options.indexPath);

  // Run invariant checks only after extraction. Schema/ancrage errors should not
  // prevent other valid contracts in the repo from being checked.
  for (const contract of extracted.contracts) {
    const text = await readFile(path.resolve(root, contract.file), 'utf8');
    errors.push(...checkSsotUsage(contract, text));
  }

  // Without a committed index there is no trustworthy baseline for locked
  // contracts, so V1 skips only locked-change detection.
  if (index) {
    errors.push(...checkLockedChanges(root, extracted.contracts, index));
  }

  return { contracts: extracted.contracts, errors };
}

function checkSsotUsage(contract: DriftExtractedContract, text: string): DriftError[] {
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
  if (anchoredText.includes(ssotPath) || anchoredText.includes(stripTsExtension(ssotPath))) return true;

  // V1 treats imports as sufficient SSOT usage. This is intentionally shallow:
  // the goal is catching obvious local replacements, not proving data flow.
  const sourceFile = ts.createSourceFile(contract.file, text, ts.ScriptTarget.Latest, true);
  return sourceFile.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
    const importedPath = statement.moduleSpecifier.text;
    return importedPath === ssotPath || importedPath === stripTsExtension(ssotPath);
  });
}

function stripTsExtension(modulePath: string): string {
  return modulePath.replace(/\.(tsx|ts)$/, '');
}

function checkLockedChanges(
  root: string,
  contracts: DriftExtractedContract[],
  index: DriftContractsIndex,
): DriftError[] {
  const errors: DriftError[] = [];
  const previousById = new Map(index.contracts.map((contract) => [contract.id, contract]));

  // Locked contracts are compared by canonical content hash, not raw text, so
  // whitespace and YAML comments do not force acceptance files.
  for (const contract of contracts) {
    if (contract.stability !== 'locked') continue;
    const previous = previousById.get(contract.id);
    if (!previous || previous.contentHash === contract.contentHash) continue;
    const acceptance = readAcceptanceSync(root, contract.id);
    if (acceptance.valid) continue;
    errors.push(
      driftError(
        acceptance.exists ? 'DRIFT012_INVALID_ACCEPTANCE_FILE' : 'DRIFT011_LOCKED_CONTRACT_CHANGED',
        contract.file,
        { id: contract.id },
        { line: contract.line, column: contract.column },
      ),
    );
  }

  return errors;
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
