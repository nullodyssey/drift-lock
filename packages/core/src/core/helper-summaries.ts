import type { DriftContractsIndex, DriftIndexedContract } from '../types.js';

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
