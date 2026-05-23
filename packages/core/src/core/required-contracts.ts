import type {
  DriftAdoptionMode,
  DriftDiagnostic,
  DriftDiagnosticSeverity,
  DriftExtractedContract,
  DriftSource,
} from '../types.js';
import { filesMatchingRequireContractPatterns, firstMatchingRequireContractPattern } from './coverage.js';
import { driftError, toDiagnostic } from './errors.js';
import { discoverSourceFiles } from './files.js';

/* @drift
version: 1
id: core.required-contracts
scope: file
stability: draft

intent: >
  Report required-contract coverage gaps with adoption-mode severity while
  keeping checker orchestration free of coverage policy details.

ssot:
  coverage: "./coverage.ts"
  errors: "./errors.ts"
  files: "./files.ts"

invariants:
  - id: required-contracts-use-coverage-matchers
    enforce: drift/ssot-usage
    ssot: coverage
  - id: required-contracts-use-shared-diagnostics
    enforce: drift/ssot-usage
    ssot: errors
  - id: required-contracts-discovers-source-files
    enforce: drift/ssot-usage
    ssot: files

llm:
  must_not_change:
    - Required-contract gaps must honor audit, warn, and enforce severities.
    - Extracted files must be preferred over rediscovering the whole source tree.
*/
export type CheckRequiredContractsOptions = {
  root: string;
  sourceDir: DriftSource | undefined;
  files: string[] | undefined;
  contracts: DriftExtractedContract[];
  patterns: string[];
  adoptionMode: DriftAdoptionMode;
};

export async function checkRequiredContracts(options: CheckRequiredContractsOptions): Promise<DriftDiagnostic[]> {
  if (options.patterns.length === 0) return [];
  const sourceFiles = options.files ?? (await discoverSourceFiles(options.root, options.sourceDir));
  const filesWithContracts = new Set(options.contracts.map((contract) => contract.file));
  const severity = severityForAdoptionMode(options.adoptionMode);
  return filesMatchingRequireContractPatterns(sourceFiles, options.patterns)
    .filter((file) => !filesWithContracts.has(file))
    .map((file) =>
      toDiagnostic(
        driftError('DRIFT015_REQUIRED_CONTRACT_MISSING', file, {
          pattern: firstMatchingRequireContractPattern(file, options.patterns) ?? options.patterns[0],
        }),
        severity,
      ),
    );
}

function severityForAdoptionMode(mode: DriftAdoptionMode): DriftDiagnosticSeverity {
  if (mode === 'audit') return 'info';
  if (mode === 'warn') return 'warning';
  return 'error';
}
