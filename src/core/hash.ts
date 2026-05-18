import { createHash } from 'node:crypto';
import type { DriftContract } from '../types.js';

export function contentHash(contract: DriftContract): string {
  const canonical = canonicalize(contract);
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

// Canonicalization defines what "same locked contract" means. It ignores YAML
// formatting noise but preserves array order because invariant order is authorial.
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(trimValue(value)));
}

function trimValue(value: unknown): unknown {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(trimValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, trimValue(child)]));
  }
  return value;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])]),
    );
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
