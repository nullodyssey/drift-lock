import type { DriftDiagnostic, DriftDiagnosticSeverity, DriftErrorCode, DriftError } from '../types.js';

/* @drift
version: 1
id: core.errors
scope: file
stability: locked

intent: >
  Format stable Drift diagnostics so CLI, ESLint, CI, and agents receive
  consistent error codes, locations, and severity prefixes.

ssot:
  types: "../types.ts"

invariants:
  - id: formats-shared-diagnostic-types
    enforce: drift/ssot-usage
    ssot: types

llm:
  must_not_change:
    - DRIFTxxx codes must remain stable and human-readable.
    - Diagnostic severity formatting must preserve info, warning, and error levels.
    - Error locations must include file and line when available.
*/
const messages: Record<DriftErrorCode, (details: Record<string, unknown>) => string> = {
  DRIFT001_INVALID_YAML: () => 'DRIFT001: Invalid @drift YAML.',
  DRIFT002_UNKNOWN_FIELD: ({ field }) =>
    `DRIFT002: Unknown @drift field "${String(field)}". This field is not supported in schema version 1.`,
  DRIFT003_MISSING_REQUIRED_FIELD: ({ field }) =>
    `DRIFT003: Missing required @drift field "${String(field)}".`,
  DRIFT004_INVALID_FIELD_VALUE: ({ field }) =>
    `DRIFT004: Invalid value for @drift field "${String(field)}".`,
  DRIFT005_DUPLICATE_CONTRACT_ID: ({ id }) => `DRIFT005: Duplicate @drift contract id "${String(id)}".`,
  DRIFT006_UNANCHORED_CONTRACT: ({ id }) =>
    `DRIFT006: @drift declaration contract "${String(id)}" is not anchored to a supported declaration.`,
  DRIFT007_UNSUPPORTED_SCOPE: ({ scope }) =>
    `DRIFT007: Unsupported @drift scope "${String(scope)}". Supported scopes are "file" and "declaration".`,
  DRIFT008_UNSUPPORTED_INVARIANT: ({ enforce }) =>
    `DRIFT008: Unsupported @drift invariant "${String(enforce)}".`,
  DRIFT009_UNKNOWN_SSOT_REFERENCE: ({ invariantId, ssotKey }) =>
    `DRIFT009: Invariant "${String(invariantId)}" references unknown ssot key "${String(ssotKey)}".`,
  DRIFT010_SSOT_NOT_USED: ({ id, ssotKey, ssotPath }) =>
    `DRIFT010: Contract "${String(id)}" requires ssot "${String(ssotKey)}" but the anchored code does not reference "${String(ssotPath)}".`,
  DRIFT011_LOCKED_CONTRACT_CHANGED: ({ id }) =>
    `DRIFT011: Locked @drift contract "${String(id)}" changed without explicit acceptance.`,
  DRIFT012_INVALID_ACCEPTANCE_FILE: ({ id }) =>
    `DRIFT012: Invalid acceptance file for locked @drift contract "${String(id)}".`,
  DRIFT013_SSOT_FLOW_NOT_PROVEN: ({ id, sink, ssotKey }) =>
    `DRIFT013: Contract "${String(id)}" requires sink "${String(sink)}" to derive from ssot "${String(ssotKey)}".`,
  DRIFT014_UNSUPPORTED_FLOW_PATTERN: ({ id, sink }) =>
    `DRIFT014: Contract "${String(id)}" uses an unsupported ssot-flow pattern${sink ? ` for sink "${String(sink)}"` : ''}.`,
  DRIFT015_REQUIRED_CONTRACT_MISSING: ({ pattern }) =>
    `DRIFT015: File requires an @drift contract because it matches "${String(pattern)}".`,
};

export function driftError(
  code: DriftErrorCode,
  file: string,
  details: Record<string, unknown> = {},
  position: { line?: number; column?: number } = {},
): DriftError {
  return {
    code,
    message: messages[code](details),
    file,
    contractId: typeof details.id === 'string' ? details.id : undefined,
    line: position.line,
    column: position.column,
    details,
  };
}

export function toDiagnostic(error: DriftError, severity: DriftDiagnosticSeverity = 'error'): DriftDiagnostic {
  return { ...error, severity };
}

export function formatErrors(errors: DriftError[]): string {
  return errors.map(formatErrorLine).join('\n');
}

export function formatDiagnostics(diagnostics: DriftDiagnostic[]): string {
  return diagnostics
    .map((diagnostic) => `${diagnosticPrefix(diagnostic.severity)} ${formatErrorLine(diagnostic)}`)
    .join('\n');
}

function formatErrorLine(error: DriftError): string {
  const location = error.line ? `${error.file}:${error.line}:${error.column ?? 1}` : error.file;
  return `${location} ${error.message}`;
}

function diagnosticPrefix(severity: DriftDiagnosticSeverity): string {
  if (severity === 'info') return 'INFO';
  if (severity === 'warning') return 'WARN';
  return 'ERROR';
}
