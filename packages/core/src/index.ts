/* @drift
version: 1
id: core.public-api
scope: file
stability: locked

intent: >
  Re-export the stable internal DriftLock engine facade used by the official CLI
  and ESLint plugin from a single package entrypoint.

llm:
  must_not_change:
    - The package root is supported for official DriftLock packages, not as a broad external SDK.
    - Existing CLI and ESLint plugin engine imports must remain reachable through the package root.
    - New root exports must be justified by a current official package consumer.
    - Low-level helpers must not be exported only for convenience.
*/
export { checkContracts, checkLockedChangesForFile, checkSsotUsage, type CheckOptions } from './core/checker.js';
export { checkSsotFlow, type CheckSsotFlowOptions } from './core/ssot-flow.js';
export { defaultDriftConfig, readDriftConfig, type DriftConfig } from './core/config.js';
export { renderContext, renderTaskContext } from './core/context.js';
export { diffContracts, formatContractDiffSummary, writeAcceptanceFile } from './core/contract-diff.js';
export { getCoverage, formatCoverageSummary, type DriftCoverage } from './core/coverage.js';
export { formatErrors, formatDiagnostics } from './core/errors.js';
export { explainContracts, formatExplanations } from './core/explain.js';
export { extractContracts, extractContractsFromSource } from './core/extractor.js';
export {
  openIndexStore,
  readIndexContractsForFileSync,
  readIndexHelperContractsForFileSync,
  toIndex,
  writeIndexStore,
  writeIndexStoreSync,
  type DriftFileContractLookup,
  type DriftFileLookupOptions,
  type DriftIndexLocation,
  type DriftIndexStats,
  type DriftIndexStore,
  type DriftIndexWriteOptions,
} from './core/index-file.js';
export { getProofReport, formatProofReportJson, formatProofReportMarkdown, type ProofReportOptions } from './core/proof.js';
export type {
  DriftAdoptionMode,
  DriftContract,
  DriftContractDiff,
  DriftContractsIndex,
  DriftDiagnostic,
  DriftError,
  DriftExplanation,
  DriftExtractedContract,
  DriftIndexedContract,
  DriftInvariant,
  DriftProofContractOutcome,
  DriftProofReport,
  DriftProofResolution,
  DriftProofSummary,
  DriftResult,
  DriftSource,
} from './types.js';
