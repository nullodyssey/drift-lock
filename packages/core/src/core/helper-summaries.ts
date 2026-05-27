import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DriftContractsIndex, DriftIndexedContract, DriftSource } from '../types.js';
import { helperImportFileCandidates } from './contract-paths.js';
import type { DriftIndexStore } from './index-file.js';

/* @drift
version: 1
id: core.helper-summaries
scope: file
stability: draft

intent: >
  Build the global helper summary context used by SSOT flow checks while
  preserving current extracted contracts over committed index entries.

llm:
  must_not_change:
    - Helper summaries must use the full index, not the Git-scoped index.
    - Current extracted contracts must override committed index entries.
*/
export function buildHelperContracts(index: DriftContractsIndex | undefined, current: DriftIndexedContract[]): DriftIndexedContract[] {
  const byId = new Map<string, DriftIndexedContract>();
  for (const contract of index?.contracts ?? []) byId.set(contract.id, contract);
  for (const contract of current) byId.set(contract.id, contract);
  return [...byId.values()];
}

export async function buildHelperContractsFromStore(
  root: string,
  store: DriftIndexStore | undefined,
  current: DriftIndexedContract[],
  files?: string[],
  sourceDir?: DriftSource,
): Promise<DriftIndexedContract[]> {
  if (!store) return buildHelperContracts(undefined, current);
  if (!files) return buildHelperContracts(await store.materializeIndex(), current);

  const helperFiles = new Set<string>();
  for (const file of files) {
    let source: string;
    try {
      source = await readFile(path.resolve(root, file), 'utf8');
    } catch {
      continue;
    }
    for (const candidate of helperImportFileCandidates(file, source, sourceDir)) helperFiles.add(candidate);
  }

  const lookup = await store.getContractIdsForFiles([...helperFiles], { includeHelperCandidates: true });
  const helpers = await store.getContractsByIds(lookup.helperCandidateContractIds);
  return buildHelperContracts({ version: 1, contracts: helpers }, current);
}
