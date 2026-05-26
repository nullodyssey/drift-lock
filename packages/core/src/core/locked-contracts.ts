import path from 'node:path';
import ts from 'typescript';
import type { DriftContractsIndex, DriftDiagnostic, DriftError, DriftExtractedContract } from '../types.js';
import { parseAcceptanceFile, type AcceptanceParseIssue } from './acceptance-file.js';
import type { CheckRunContext } from './check-run.js';
import { driftError, toDiagnostic } from './errors.js';

/* @drift
version: 1
id: core.locked-contracts
scope: file
stability: locked

intent: >
  Enforce locked contract baselines and acceptance files for intentional
  product-level contract changes.

llm:
  must_not_change:
    - Locked contracts must compare canonical content hashes.
    - Valid acceptance files must name the changed contract and include a clear reason.
    - Missing current contracts must still report locked removals.
*/

export type ContractAcceptanceStatus = {
  status: 'missing' | 'valid' | 'invalid';
  path: string;
  issue?: AcceptanceParseIssue | 'wrong-contract';
};

export function checkLockedContracts(run: CheckRunContext): DriftDiagnostic[] {
  if (!run.scopedIndex) return [];
  return checkLockedChanges(run.root, run.extracted.contracts, run.scopedIndex).map((error) => toDiagnostic(error));
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
    const acceptance = getAcceptanceStatus(root, previous.id);
    if (acceptance.status === 'valid') continue;
    const currentLocation = current ? { file: current.file, line: current.line, column: current.column } : undefined;
    errors.push(
      driftError(
        acceptance.status === 'invalid' ? 'DRIFT012_INVALID_ACCEPTANCE_FILE' : 'DRIFT011_LOCKED_CONTRACT_CHANGED',
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

export function getAcceptanceStatus(root: string, id: string): ContractAcceptanceStatus {
  const relativePath = path.join('.drift', 'accepted-contract-changes', `${id}.md`);
  const file = path.join(root, relativePath);
  try {
    // Use TypeScript's sys API here to keep this helper synchronous without
    // pulling sync fs calls through the rest of the checker API.
    const fs = ts.sys;
    const content = fs.readFile(file);
    if (content === undefined) return { status: 'missing', path: relativePath };
    const parsed = parseAcceptanceFile(content);
    if (!parsed.valid) return { status: 'invalid', path: relativePath, issue: parsed.issue };
    if (parsed.contractId !== id) return { status: 'invalid', path: relativePath, issue: 'wrong-contract' };
    return { status: 'valid', path: relativePath };
  } catch {
    return { status: 'missing', path: relativePath };
  }
}
