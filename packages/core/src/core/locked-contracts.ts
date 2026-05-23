import path from 'node:path';
import ts from 'typescript';
import type { DriftContractsIndex, DriftError, DriftExtractedContract } from '../types.js';
import { driftError } from './errors.js';

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
