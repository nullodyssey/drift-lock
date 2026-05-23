import type { DriftDiagnostic, DriftDiagnosticSeverity } from '../types.js';
import type { CheckRunContext } from './check-run.js';
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
export async function checkRequiredContracts(run: CheckRunContext): Promise<DriftDiagnostic[]> {
  const patterns = run.options.requireContracts ?? [];
  if (patterns.length === 0) return [];
  const sourceFiles = run.extractFiles ?? (await discoverSourceFiles(run.root, run.options.sourceDir));
  const filesWithContracts = new Set(run.extracted.contracts.map((contract) => contract.file));
  const severity = severityForAdoptionMode(run.options.adoptionMode ?? 'enforce');
  return filesMatchingRequireContractPatterns(sourceFiles, patterns)
    .filter((file) => !filesWithContracts.has(file))
    .map((file) =>
      toDiagnostic(
        driftError('DRIFT015_REQUIRED_CONTRACT_MISSING', file, {
          pattern: firstMatchingRequireContractPattern(file, patterns) ?? patterns[0],
        }),
        severity,
      ),
    );
}

function severityForAdoptionMode(mode: 'audit' | 'warn' | 'enforce'): DriftDiagnosticSeverity {
  if (mode === 'audit') return 'info';
  if (mode === 'warn') return 'warning';
  return 'error';
}
