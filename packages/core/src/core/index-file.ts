import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DriftContractSummaries, DriftContractsIndex, DriftExtractedContract, DriftIndexedContract } from '../types.js';

/* @drift
version: 1
id: core.index-file
scope: file
stability: locked

intent: >
  Read, write, and serialize the committed Drift contract index used as the
  baseline for locked contract checks.

llm:
  must_not_change:
    - Runtime-only extraction fields must not be written to the committed index.
    - Missing index files must be treated as absent, not invalid.
    - Generated indexes must remain stable pretty-printed JSON with a trailing newline.
*/
export const defaultIndexPath = '.drift/contracts.generated.json';

const hashPattern = /^sha256:[a-f0-9]{64}$/;
const indexKeys = new Set(['version', 'contracts']);
const contractKeys = new Set([
  'version',
  'id',
  'scope',
  'stability',
  'intent',
  'ssot',
  'invariants',
  'llm',
  'file',
  'anchor',
  'contentHash',
  'bodyHash',
  'summaries',
]);
const anchorKeys = new Set(['type', 'name']);
const invariantKeys = new Set(['id', 'enforce', 'ssot', 'sinks']);
const llmKeys = new Set(['must_not_change']);
const summariesKeys = new Set(['ssotFlow']);
const ssotFlowSummaryKeys = new Set(['ssotPath', 'returns']);

export function toIndex(contracts: DriftExtractedContract[]): DriftContractsIndex {
  return {
    version: 1,
    // Runtime-only fields make checks possible in-memory, but keeping them out of
    // the committed index preserves a small, stable baseline.
    contracts: contracts.map(toIndexedContract),
  };
}

function toIndexedContract(contract: DriftExtractedContract): DriftIndexedContract {
  const { raw: _raw, bodyStart: _bodyStart, bodyEnd: _bodyEnd, line: _line, column: _column, ...indexed } = contract;
  const summaries = summariesForContract(contract);
  return summaries ? { ...indexed, summaries } : indexed;
}

function summariesForContract(contract: DriftExtractedContract): DriftContractSummaries | undefined {
  const ssotFlow = (contract.invariants ?? [])
    .filter((invariant) => invariant.enforce === 'drift/ssot-flow' && invariant.ssot && invariant.sinks?.length)
    .flatMap((invariant) => {
      const ssotPath = contract.ssot?.[invariant.ssot as string];
      if (!ssotPath) return [];
      return [{ ssotPath, returns: [...new Set(invariant.sinks)].sort() }];
    });

  return ssotFlow.length > 0 ? { ssotFlow } : undefined;
}

export async function writeIndex(root: string, output = defaultIndexPath, index: DriftContractsIndex): Promise<void> {
  const absoluteOutput = path.resolve(root, output);
  await mkdir(path.dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

export async function readIndex(root: string, input = defaultIndexPath): Promise<DriftContractsIndex | undefined> {
  const absoluteInput = path.resolve(root, input);
  try {
    const parsed = JSON.parse(await readFile(absoluteInput, 'utf8')) as unknown;
    return validateIndexObject(parsed, input);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    if (error instanceof Error && error.message.startsWith('Invalid Drift contracts index')) throw error;
    throw invalidIndex(input);
  }
}

export function validateIndexObject(value: unknown, file: string): DriftContractsIndex {
  if (!isPlainObject(value) || !hasOnlyKeys(value, indexKeys) || value.version !== 1 || !Array.isArray(value.contracts)) {
    throw invalidIndex(file);
  }

  for (const contract of value.contracts) {
    validateIndexedContract(contract, file);
  }

  return value as DriftContractsIndex;
}

function validateIndexedContract(value: unknown, file: string): void {
  if (!isPlainObject(value) || !hasOnlyKeys(value, contractKeys)) throw invalidIndex(file);

  if (
    value.version !== 1 ||
    !isNonEmptyString(value.id) ||
    !isValidScope(value.scope) ||
    !isValidStability(value.stability) ||
    !isNonEmptyString(value.intent) ||
    !isNonEmptyString(value.file) ||
    !isValidAnchor(value.anchor) ||
    !isHash(value.contentHash)
  ) {
    throw invalidIndex(file);
  }

  if (value.bodyHash !== undefined && !isHash(value.bodyHash)) throw invalidIndex(file);
  if (value.ssot !== undefined && !isStringRecord(value.ssot)) throw invalidIndex(file);
  if (value.invariants !== undefined && !isValidInvariants(value.invariants)) throw invalidIndex(file);
  if (value.llm !== undefined && !isValidLlm(value.llm)) throw invalidIndex(file);
  if (value.summaries !== undefined && !isValidSummaries(value.summaries)) throw invalidIndex(file);
}

function isValidAnchor(value: unknown): boolean {
  if (!isPlainObject(value) || !hasOnlyKeys(value, anchorKeys)) return false;
  if (value.type === 'file') return value.name === undefined;
  if (value.type === 'function' || value.type === 'const') return isNonEmptyString(value.name);
  return false;
}

function isValidInvariants(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((invariant) => {
      if (!isPlainObject(invariant) || !hasOnlyKeys(invariant, invariantKeys)) return false;
      if (!isNonEmptyString(invariant.id) || !isValidInvariantEnforce(invariant.enforce)) return false;
      if (invariant.ssot !== undefined && !isNonEmptyString(invariant.ssot)) return false;
      return invariant.sinks === undefined || isStringArray(invariant.sinks);
    })
  );
}

function isValidLlm(value: unknown): boolean {
  if (!isPlainObject(value) || !hasOnlyKeys(value, llmKeys)) return false;
  return value.must_not_change === undefined || isStringArray(value.must_not_change);
}

function isValidSummaries(value: unknown): boolean {
  if (!isPlainObject(value) || !hasOnlyKeys(value, summariesKeys)) return false;
  return (
    value.ssotFlow === undefined ||
    (Array.isArray(value.ssotFlow) &&
      value.ssotFlow.every((summary) => {
        if (!isPlainObject(summary) || !hasOnlyKeys(summary, ssotFlowSummaryKeys)) return false;
        return isNonEmptyString(summary.ssotPath) && isStringArray(summary.returns);
      }))
  );
}

function isValidScope(value: unknown): boolean {
  return value === 'file' || value === 'declaration';
}

function isValidStability(value: unknown): boolean {
  return value === 'draft' || value === 'locked';
}

function isValidInvariantEnforce(value: unknown): boolean {
  return value === 'drift/ssot-usage' || value === 'drift/ssot-flow';
}

function isHash(value: unknown): boolean {
  return typeof value === 'string' && hashPattern.test(value);
}

function isStringRecord(value: unknown): boolean {
  return isPlainObject(value) && Object.values(value).every((entry) => isNonEmptyString(entry));
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => isNonEmptyString(entry));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: Set<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function invalidIndex(file: string): Error {
  return new Error(`Invalid Drift contracts index at "${file}".`);
}
