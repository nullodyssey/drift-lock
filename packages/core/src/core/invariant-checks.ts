import type { DriftDiagnostic } from '../types.js';
import type { CheckRunContext } from './check-run.js';
import { toDiagnostic } from './errors.js';
import { checkSsotFlow } from './rules/ssot-flow/index.js';
import { checkSsotUsage } from './rules/ssot-usage/index.js';

/* @drift
version: 1
id: core.invariant-checks
scope: file
stability: locked

intent: >
  Run executable Drift invariant rules for selected contracts after extraction
  while preserving rule-specific diagnostics.

ssot:
  ssot-usage: "./rules/ssot-usage/index.ts"
  ssot-flow: "./rules/ssot-flow/index.ts"
  errors: "./errors.ts"
  source-cache: "./source-cache.ts"

invariants:
  - id: invariants-run-ssot-usage
    enforce: drift/ssot-usage
    ssot: ssot-usage
  - id: invariants-run-ssot-flow
    enforce: drift/ssot-usage
    ssot: ssot-flow
  - id: invariants-use-shared-diagnostics
    enforce: drift/ssot-usage
    ssot: errors
  - id: invariants-read-through-source-cache
    enforce: drift/ssot-usage
    ssot: source-cache

llm:
  must_not_change:
    - Schema extraction errors must not prevent valid selected contracts from being checked.
    - SSOT flow checks must receive helperContracts from the prepared run context.
    - Source text must be read through the run-scoped SourceCache.
*/
export async function runInvariantChecks(run: CheckRunContext): Promise<DriftDiagnostic[]> {
  const diagnostics: DriftDiagnostic[] = [];

  // Run invariant checks only after extraction. Schema/ancrage errors should not
  // prevent other valid contracts in the repo from being checked.
  for (const contract of run.contractsToCheck) {
    const text = await run.sourceCache.readText(contract.file);
    diagnostics.push(...checkSsotUsage(contract, text).map((error) => toDiagnostic(error)));
    diagnostics.push(...checkSsotFlow(contract, text, { helperContracts: run.helperContracts }).map((error) => toDiagnostic(error)));
  }

  return diagnostics;
}
