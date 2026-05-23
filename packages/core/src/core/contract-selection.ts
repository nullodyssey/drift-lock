import type { DriftContractsIndex, DriftExtractedContract, DriftSource } from '../types.js';
import { diffContractSets } from './contract-diff.js';
import { filterIndexByFiles, resolveGitFileScope, type GitFileScope } from './git-scope.js';
import { toIndex } from './index-file.js';

/* @drift
version: 1
id: core.contract-selection
scope: file
stability: locked

intent: >
  Resolve the Drift check execution scope while keeping Git-scoped checks
  separate from the full verified proof context.

ssot:
  contract-diff: "./contract-diff.ts"
  git-scope: "./git-scope.ts"
  index-file: "./index-file.ts"

invariants:
  - id: selection-diffs-current-contracts
    enforce: drift/ssot-usage
    ssot: contract-diff
  - id: selection-resolves-git-scope
    enforce: drift/ssot-usage
    ssot: git-scope
  - id: selection-indexes-current-contracts
    enforce: drift/ssot-usage
    ssot: index-file

llm:
  must_not_change:
    - Git scope selects which contracts run; it must not replace the full proof index.
    - changedOnly must include contracts impacted by SSOT file changes.
    - Missing committed indexes must keep changedOnly conservative.
*/
export type ResolveCheckScopeOptions = {
  root: string;
  sourceDir?: DriftSource;
  files?: string[];
  gitBase?: string;
};

export type ResolvedCheckScope = {
  gitScope?: GitFileScope;
  scopedIndex?: DriftContractsIndex;
  extractFiles?: string[];
};

export async function resolveCheckScope(
  options: ResolveCheckScopeOptions,
  index: DriftContractsIndex | undefined,
): Promise<ResolvedCheckScope> {
  if (!options.gitBase) {
    return {
      scopedIndex: index,
      extractFiles: options.files,
    };
  }

  const gitScope = await resolveGitFileScope(options.root, options.gitBase, options.sourceDir, index);
  return {
    gitScope,
    scopedIndex: index ? filterIndexByFiles(index, gitScope.contractFiles) : undefined,
    extractFiles: gitScope.extractFiles,
  };
}

export function changedContracts(
  contracts: DriftExtractedContract[],
  index: DriftContractsIndex | undefined,
  impactedContractIds: string[] = [],
): DriftExtractedContract[] {
  if (!index) return contracts;
  const changedIds = new Set(diffContractSets(toIndex(contracts).contracts, index.contracts).changes.map((change) => change.id));
  for (const id of impactedContractIds) changedIds.add(id);
  return contracts.filter((contract) => changedIds.has(contract.id));
}
