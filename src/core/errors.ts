import type { DriftErrorCode, DriftError } from '../types.js';

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

export function formatErrors(errors: DriftError[]): string {
  return errors
    .map((error) => {
      const location = error.line ? `${error.file}:${error.line}:${error.column ?? 1}` : error.file;
      return `${location} ${error.message}`;
    })
    .join('\n');
}
