import path from 'node:path';
import type {
  DriftAdoptionMode,
  DriftContractsIndex,
  DriftExtractedContract,
  DriftIndexedContract,
} from '../types.js';
import { changedContracts } from './contract-selection.js';
import { extractContracts, type ExtractOptions } from './extractor.js';
import type { GitFileScope } from './git-scope.js';
import { resolveGitFileScopeFromStore } from './git-scope.js';
import { buildHelperContractsFromStore } from './helper-summaries.js';
import { openIndexStore, toIndex, type DriftIndexStore } from './index-file.js';
import { SourceCache } from './source-cache.js';

/* @drift
version: 1
id: core.check-run
scope: file
stability: locked

intent: >
  Prepare the immutable execution context for Drift contract checks while
  preserving the boundary between scoped execution and global proof context.

ssot:
  extractor: "./extractor.ts"
  index-file: "./index-file.ts"
  contract-selection: "./contract-selection.ts"
  helper-summaries: "./helper-summaries.ts"
  source-cache: "./source-cache.ts"

invariants:
  - id: run-extracts-contracts
    enforce: drift/ssot-usage
    ssot: extractor
  - id: run-reads-index
    enforce: drift/ssot-usage
    ssot: index-file
  - id: run-resolves-check-scope
    enforce: drift/ssot-usage
    ssot: contract-selection
  - id: run-builds-helper-context
    enforce: drift/ssot-usage
    ssot: helper-summaries
  - id: run-creates-source-cache
    enforce: drift/ssot-usage
    ssot: source-cache

llm:
  must_not_change:
    - scopedIndex selects scoped checks only.
    - helperContracts must use import-candidate lookups, not full store materialization.
    - changedOnly must include changed contracts and SSOT-impacted contracts.
    - Extraction must use Git-scoped files when a Git base is provided.
    - SourceCache must be instantiated per check run, not globally.
*/
export type CheckOptions = ExtractOptions & {
  indexPath?: string;
  changedOnly?: boolean;
  gitBase?: string;
  requireContracts?: string[];
  adoptionMode?: DriftAdoptionMode;
};

type ExtractContractsResult = Awaited<ReturnType<typeof extractContracts>>;

export type CheckRunContext = {
  root: string;
  options: CheckOptions;
  indexStore?: DriftIndexStore;
  index?: DriftContractsIndex;
  scopedIndex?: DriftContractsIndex;
  gitScope?: GitFileScope;
  extractFiles?: string[];
  extracted: ExtractContractsResult;
  contractsToCheck: DriftExtractedContract[];
  helperContracts: DriftIndexedContract[];
  sourceCache: SourceCache;
};

export async function prepareCheckRun(options: CheckOptions): Promise<CheckRunContext> {
  const root = path.resolve(options.root);
  const indexStore = await openIndexStore({ kind: 'working-tree', root, indexPath: options.indexPath });
  const gitScope = options.gitBase ? await resolveGitFileScopeFromStore(root, options.gitBase, options.sourceDir, indexStore) : undefined;
  const index = !options.gitBase ? await indexStore?.materializeIndex() : undefined;
  const scopedIndex = gitScope?.indexedContractIds.length
    ? { version: 1 as const, contracts: (await indexStore?.getContractsByIds(gitScope.indexedContractIds)) ?? [] }
    : index;
  const extractFiles = gitScope?.extractFiles ?? options.files;
  const extracted = await extractContracts({ ...options, files: extractFiles });
  const contractsToCheck = options.changedOnly
    ? changedContracts(extracted.contracts, scopedIndex, gitScope?.impactedContractIds)
    : extracted.contracts;
  const helperContracts = await buildHelperContractsFromStore(
    root,
    indexStore,
    toIndex(extracted.contracts).contracts,
    gitScope ? contractsToCheck.map((contract) => contract.file) : undefined,
  );
  const sourceCache = new SourceCache(root);

  return {
    root,
    options,
    indexStore,
    index,
    scopedIndex,
    gitScope,
    extractFiles,
    extracted,
    contractsToCheck,
    helperContracts,
    sourceCache,
  };
}
