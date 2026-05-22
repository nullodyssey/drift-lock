import type { DriftContract, DriftError, DriftInvariant } from '../types.js';
import { driftError } from './errors.js';

/* @drift
version: 1
id: core.validator
scope: file
stability: locked

intent: >
  Validate and normalize Drift contract schema objects before extraction,
  hashing, checking, or indexing can trust them.

ssot:
  errors: "./errors.ts"

invariants:
  - id: validation-reports-shared-errors
    enforce: drift/ssot-usage
    ssot: errors

llm:
  must_not_change:
    - Unknown fields must be rejected so ignored data cannot look enforceable.
    - Supported invariant schemas must stay strict.
    - Normalization must happen before contract hashing.
*/
const rootFields = new Set(['version', 'id', 'scope', 'stability', 'intent', 'ssot', 'invariants', 'llm']);
const requiredRootFields = ['version', 'id', 'scope', 'stability', 'intent'];
const invariantFields = new Set(['id', 'enforce', 'ssot', 'sinks']);
const llmFields = new Set(['must_not_change']);

const contractIdPattern = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/;
const ssotKeyPattern = /^[a-z][a-z0-9-]*$/;
const invariantIdPattern = /^[a-z][a-z0-9-]*$/;

export function isValidContractId(id: string): boolean {
  return contractIdPattern.test(id) && id.length <= 120;
}

export function validateContractObject(
  parsed: unknown,
  file: string,
  position: { line: number; column: number },
): { contract?: DriftContract; errors: DriftError[] } {
  const errors: DriftError[] = [];

  // Reject non-objects before field validation so YAML scalars/arrays cannot
  // masquerade as partially valid contracts.
  if (!isObject(parsed)) {
    return { errors: [driftError('DRIFT001_INVALID_YAML', file, {}, position)] };
  }

  // Strict unknown-field rejection is part of the anti-drift design: fields that
  // tooling ignores should not look enforceable to humans or agents.
  for (const key of Object.keys(parsed)) {
    if (!rootFields.has(key)) {
      errors.push(driftError('DRIFT002_UNKNOWN_FIELD', file, { field: key }, position));
    }
  }

  for (const field of requiredRootFields) {
    if (!(field in parsed)) {
      errors.push(driftError('DRIFT003_MISSING_REQUIRED_FIELD', file, { field }, position));
    }
  }

  const id = parsed.id;
  if ('id' in parsed && (!isString(id) || !isValidContractId(id))) {
    errors.push(driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: 'id' }, position));
  }

  if ('version' in parsed && parsed.version !== 1) {
    errors.push(driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: 'version' }, position));
  }

  if ('scope' in parsed && parsed.scope !== 'file' && parsed.scope !== 'declaration') {
    if (isString(parsed.scope)) {
      errors.push(driftError('DRIFT007_UNSUPPORTED_SCOPE', file, { scope: parsed.scope }, position));
    } else {
      errors.push(driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: 'scope' }, position));
    }
  }

  if ('stability' in parsed && parsed.stability !== 'draft' && parsed.stability !== 'locked') {
    errors.push(driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: 'stability' }, position));
  }

  if ('intent' in parsed) {
    const intent = parsed.intent;
    if (!isString(intent) || intent.trim().length < 20 || intent.trim().length > 600) {
      errors.push(driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: 'intent' }, position));
    }
  }

  const ssotErrors = validateSsot(parsed.ssot, file, position);
  errors.push(...ssotErrors);

  const invariantErrors = validateInvariants(parsed.invariants, parsed.ssot, parsed.scope, file, position);
  errors.push(...invariantErrors);

  const llmErrors = validateLlm(parsed.llm, file, position);
  errors.push(...llmErrors);

  if (errors.length > 0) return { errors };

  return {
    contract: normalizeContract(parsed as DriftContract),
    errors: [],
  };
}

function validateSsot(value: unknown, file: string, position: { line: number; column: number }): DriftError[] {
  if (value === undefined) return [];
  const errors: DriftError[] = [];
  if (!isObject(value)) {
    return [driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: 'ssot' }, position)];
  }

  for (const [key, path] of Object.entries(value)) {
    if (!ssotKeyPattern.test(key) || key.length > 60) {
      errors.push(driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: `ssot.${key}` }, position));
    }
    if (
      !isString(path) ||
      path.trim().length === 0 ||
      path.trim().length > 240 ||
      path.includes(' ') ||
      /^https?:\/\//.test(path)
    ) {
      errors.push(driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: `ssot.${key}` }, position));
    }
  }

  return errors;
}

function validateInvariants(
  value: unknown,
  ssot: unknown,
  scope: unknown,
  file: string,
  position: { line: number; column: number },
): DriftError[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) {
    return [driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: 'invariants' }, position)];
  }

  const errors: DriftError[] = [];
  const ids = new Set<string>();
  const ssotKeys = isObject(ssot) ? new Set(Object.keys(ssot)) : new Set<string>();

  // Validate every invariant independently so the user gets a complete list of
  // malformed rules instead of fixing them one run at a time.
  for (const [index, invariant] of value.entries()) {
    const fieldPrefix = `invariants.${index}`;
    if (!isObject(invariant)) {
      errors.push(driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: fieldPrefix }, position));
      continue;
    }
    for (const key of Object.keys(invariant)) {
      if (!invariantFields.has(key)) {
        errors.push(driftError('DRIFT002_UNKNOWN_FIELD', file, { field: `${fieldPrefix}.${key}` }, position));
      }
    }
    if (!('id' in invariant)) {
      errors.push(driftError('DRIFT003_MISSING_REQUIRED_FIELD', file, { field: `${fieldPrefix}.id` }, position));
    } else if (!isString(invariant.id) || !invariantIdPattern.test(invariant.id) || invariant.id.length > 80) {
      errors.push(driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: `${fieldPrefix}.id` }, position));
    } else if (ids.has(invariant.id)) {
      errors.push(driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: `${fieldPrefix}.id` }, position));
    } else {
      ids.add(invariant.id);
    }

    if (!('enforce' in invariant)) {
      errors.push(driftError('DRIFT003_MISSING_REQUIRED_FIELD', file, { field: `${fieldPrefix}.enforce` }, position));
    } else if (invariant.enforce !== 'drift/ssot-usage' && invariant.enforce !== 'drift/ssot-flow') {
      errors.push(driftError('DRIFT008_UNSUPPORTED_INVARIANT', file, { enforce: invariant.enforce }, position));
    }

    if (invariant.enforce === 'drift/ssot-usage' || invariant.enforce === 'drift/ssot-flow') {
      if (!isString(invariant.ssot) || invariant.ssot.trim().length === 0) {
        errors.push(driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: `${fieldPrefix}.ssot` }, position));
      } else if (!ssotKeys.has(invariant.ssot)) {
        errors.push(
          driftError(
            'DRIFT009_UNKNOWN_SSOT_REFERENCE',
            file,
            { invariantId: isString(invariant.id) ? invariant.id : `${index}`, ssotKey: invariant.ssot },
            position,
          ),
        );
      }
    }

    if (invariant.enforce === 'drift/ssot-flow') {
      if (scope === 'file') {
        errors.push(driftError('DRIFT008_UNSUPPORTED_INVARIANT', file, { enforce: invariant.enforce }, position));
        continue;
      }
      if (!Array.isArray(invariant.sinks) || invariant.sinks.length === 0 || invariant.sinks.length > 20) {
        errors.push(driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: `${fieldPrefix}.sinks` }, position));
      } else {
        const seen = new Set<string>();
        for (const sink of invariant.sinks) {
          if (!isString(sink) || !/^return\.[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(sink.trim()) || seen.has(sink.trim())) {
            errors.push(driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: `${fieldPrefix}.sinks` }, position));
            break;
          }
          seen.add(sink.trim());
        }
      }
    } else if ('sinks' in invariant) {
      errors.push(driftError('DRIFT002_UNKNOWN_FIELD', file, { field: `${fieldPrefix}.sinks` }, position));
    }
  }

  return errors;
}

function validateLlm(value: unknown, file: string, position: { line: number; column: number }): DriftError[] {
  if (value === undefined) return [];
  if (!isObject(value)) {
    return [driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: 'llm' }, position)];
  }

  const errors: DriftError[] = [];
  for (const key of Object.keys(value)) {
    if (!llmFields.has(key)) {
      errors.push(driftError('DRIFT002_UNKNOWN_FIELD', file, { field: `llm.${key}` }, position));
    }
  }

  if ('must_not_change' in value) {
    const items = value.must_not_change;
    if (!Array.isArray(items) || items.length > 20) {
      errors.push(driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: 'llm.must_not_change' }, position));
    } else {
      const seen = new Set<string>();
      for (const item of items) {
        if (!isString(item) || item.trim().length === 0 || item.trim().length > 120 || seen.has(item)) {
          errors.push(driftError('DRIFT004_INVALID_FIELD_VALUE', file, { field: 'llm.must_not_change' }, position));
          break;
        }
        seen.add(item);
      }
    }
  }

  return errors;
}

function normalizeContract(contract: DriftContract): DriftContract {
  // Normalize after validation and before hashing so harmless outer whitespace
  // does not count as a locked contract change.
  const normalized: DriftContract = {
    version: 1,
    id: contract.id.trim(),
    scope: contract.scope,
    stability: contract.stability,
    intent: contract.intent.trim(),
  };

  if (contract.ssot) {
    normalized.ssot = Object.fromEntries(Object.entries(contract.ssot).map(([key, value]) => [key, value.trim()]));
  }
  if (contract.invariants) {
    normalized.invariants = contract.invariants.map((invariant: DriftInvariant) => ({
      id: invariant.id.trim(),
      enforce: invariant.enforce,
      ssot: invariant.ssot?.trim(),
      sinks: invariant.sinks?.map((sink) => sink.trim()),
    }));
  }
  if (contract.llm) {
    normalized.llm = {};
    if (contract.llm.must_not_change) {
      normalized.llm.must_not_change = contract.llm.must_not_change.map((item) => item.trim());
    }
  }

  return normalized;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}
