import type { DriftContractsIndex, DriftDiagnostic, DriftError, DriftExtractedContract } from '../types.js';
import { prepareCheckRun, type CheckOptions } from './check-run.js';
import { driftError, toDiagnostic } from './errors.js';
import { runInvariantChecks } from './invariant-checks.js';
import { checkLockedContracts } from './locked-contracts.js';
import { checkRequiredContracts } from './required-contracts.js';

/* @drift
version: 1
id: core.checker
scope: file
stability: locked

intent: >
  Validate a prepared Drift check run against executable invariants, required-file
  coverage, and locked-contract baselines.

ssot:
  check-run: "./check-run.ts"

invariants:
  - id: checks-prepared-run
    enforce: drift/ssot-usage
    ssot: check-run

llm:
  must_not_change:
    - Locked contracts must compare against the committed index before passing.
    - Required contract checks must use the configured source files.
    - Schema extraction errors must not prevent valid contracts from being checked.
*/
export type { CheckOptions } from './check-run.js';

export async function checkContracts(options: CheckOptions): Promise<{
  contracts: DriftExtractedContract[];
  diagnostics: DriftDiagnostic[];
  errors: DriftError[];
}> {
  const run = await prepareCheckRun(options);
  const diagnostics = run.extracted.errors.map((error) => toDiagnostic(error));
  diagnostics.push(...(await checkRequiredContracts(run)));
  if (run.gitScope) {
    const duplicateIndex = run.indexStore
      ? {
          version: 1 as const,
          contracts: await run.indexStore.getContractsByIds(run.extracted.contracts.map((contract) => contract.id)),
        }
      : run.scopedIndex;
    if (duplicateIndex) {
      diagnostics.push(...checkScopedDuplicateIds(run.extracted.contracts, duplicateIndex, run.gitScope.contractFiles).map((error) => toDiagnostic(error)));
    }
  }
  diagnostics.push(...(await runInvariantChecks(run)));
  diagnostics.push(...checkLockedContracts(run));

  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  return { contracts: run.extracted.contracts, diagnostics, errors };
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

export { checkLockedChanges, checkLockedChangesForFile } from './locked-contracts.js';
export { checkSsotUsage } from './rules/ssot-usage/index.js';
