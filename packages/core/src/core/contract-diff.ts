import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  DriftContractChange,
  DriftContractChangeField,
  DriftContractDiff,
  DriftContractsIndex,
  DriftError,
  DriftExtractedContract,
  DriftInvariant,
  DriftInvariantChange,
  DriftInvariantChangeField,
  DriftIndexedContract,
} from '../types.js';
import { extractContracts, type ExtractOptions } from './extractor.js';
import { filterContractsByFiles, filterIndexByFiles, resolveGitFileScope } from './git-scope.js';
import { canonicalize } from './hash.js';
import { readIndex, toIndex } from './index-file.js';
import { isValidContractId } from './validator.js';

/* @drift
version: 1
id: core.contract-diff
scope: file
stability: locked

intent: >
  Compare current Drift contracts with the committed index and format reviewer
  summaries for intentional contract changes.

ssot:
  index-file: "./index-file.ts"

invariants:
  - id: diff-uses-committed-index
    enforce: drift/ssot-usage
    ssot: index-file

llm:
  must_not_change:
    - Diff output must distinguish added, changed, and removed contracts.
    - Locked contract acceptance files must require a valid contract id and reason.
    - Git-scoped diffs must not report unrelated indexed contracts.
*/
export type DiffContractsOptions = ExtractOptions & {
  indexPath?: string;
  gitBase?: string;
};

export type AcceptContractChangeOptions = {
  root: string;
  contractId: string;
  reason: string;
  force?: boolean;
};

export async function diffContracts(options: DiffContractsOptions): Promise<{
  contracts: DriftExtractedContract[];
  errors: DriftError[];
  diff: DriftContractDiff;
}> {
  const root = path.resolve(options.root);
  const index = await readIndex(root, options.indexPath);
  const gitScope = options.gitBase ? await resolveGitFileScope(root, options.gitBase, options.sourceDir, index) : undefined;
  const extracted = await extractContracts({ ...options, files: gitScope?.extractFiles ?? options.files });
  const currentContracts = gitScope ? filterContractsByFiles(extracted.contracts, gitScope.contractFiles) : extracted.contracts;
  const previousContracts = gitScope && index ? filterIndexByFiles(index, gitScope.contractFiles).contracts : index?.contracts ?? [];
  return {
    contracts: currentContracts,
    errors: extracted.errors,
    diff: diffContractSets(toIndex(currentContracts).contracts, previousContracts),
  };
}

export function diffContractSets(current: DriftIndexedContract[], previous: DriftIndexedContract[]): DriftContractDiff {
  const changes: DriftContractChange[] = [];
  const currentById = new Map(current.map((contract) => [contract.id, contract]));
  const previousById = new Map(previous.map((contract) => [contract.id, contract]));

  for (const contract of current) {
    const prior = previousById.get(contract.id);
    if (!prior) {
      changes.push({
        id: contract.id,
        kind: 'added',
        file: contract.file,
        stability: contract.stability,
        fields: [],
        current: contract,
      });
      continue;
    }

    const invariantChanges = diffInvariants(contract.invariants ?? [], prior.invariants ?? []);
    const fields = changedFields(contract, prior, invariantChanges);
    if (fields.length > 0 || contract.contentHash !== prior.contentHash || contract.bodyHash !== prior.bodyHash) {
      changes.push({
        id: contract.id,
        kind: 'changed',
        file: contract.file,
        stability: contract.stability,
        fields,
        invariantChanges: invariantChanges.length > 0 ? invariantChanges : undefined,
        previous: prior,
        current: contract,
      });
    }
  }

  for (const contract of previous) {
    if (currentById.has(contract.id)) continue;
    changes.push({
      id: contract.id,
      kind: 'removed',
      file: contract.file,
      stability: contract.stability,
      fields: [],
      previous: contract,
    });
  }

  return { changes };
}

export function formatContractDiffSummary(diff: DriftContractDiff): string {
  if (diff.changes.length === 0) return 'No Drift contract changes found.';

  const lines = ['Drift contract changes:'];
  for (const change of diff.changes) {
    lines.push(`- ${change.id} (${change.kind})`);
    lines.push(`  file: ${change.file}`);
    if (change.stability) lines.push(`  stability: ${change.stability}`);
    if (change.fields.length > 0) lines.push(`  fields: ${change.fields.join(', ')}`);
    if (change.invariantChanges && change.invariantChanges.length > 0) {
      lines.push('  invariants:');
      for (const invariantChange of change.invariantChanges) {
        lines.push(...formatInvariantChange(invariantChange));
      }
    }
  }
  return lines.join('\n');
}

export async function writeAcceptanceFile(options: AcceptContractChangeOptions): Promise<{ path: string }> {
  const reason = options.reason.trim();
  if (reason.length < 20) throw new Error('Acceptance reason must be at least 20 characters long.');
  if (!isValidContractId(options.contractId)) throw new Error(`Invalid contract id "${options.contractId}".`);

  const relativePath = path.join('.drift', 'accepted-contract-changes', `${options.contractId}.md`);
  const file = path.resolve(options.root, relativePath);
  await mkdir(path.dirname(file), { recursive: true });

  const content = `contract: ${options.contractId}\nreason: ${reason}\n`;
  const flag = options.force ? 'w' : 'wx';
  try {
    await writeFile(file, content, { encoding: 'utf8', flag });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`Acceptance file already exists for "${options.contractId}". Use --force to overwrite it.`);
    }
    throw error;
  }

  return { path: relativePath };
}

function changedFields(
  current: DriftIndexedContract,
  previous: DriftIndexedContract,
  invariantChanges: DriftInvariantChange[],
): DriftContractChangeField[] {
  const fields: DriftContractChangeField[] = [];
  for (const field of ['intent', 'stability', 'scope', 'anchor', 'ssot', 'invariants', 'llm', 'file'] as const) {
    if (field === 'invariants') {
      if (invariantChanges.length > 0) fields.push(field);
    } else if (!sameValue(current[field], previous[field])) {
      fields.push(field);
    }
  }
  if (current.bodyHash !== previous.bodyHash) fields.push('body');
  return fields;
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalize(left ?? null) === canonicalize(right ?? null);
}

function diffInvariants(current: DriftInvariant[], previous: DriftInvariant[]): DriftInvariantChange[] {
  const changes: DriftInvariantChange[] = [];
  const currentById = new Map(current.map((invariant) => [invariant.id, invariant]));
  const previousById = new Map(previous.map((invariant) => [invariant.id, invariant]));

  for (const invariant of current) {
    const prior = previousById.get(invariant.id);
    if (!prior) {
      changes.push({
        id: invariant.id,
        kind: 'added',
        enforce: invariant.enforce,
        fields: [],
        current: invariant,
        sinksAdded: sortedSinks(invariant.sinks),
      });
      continue;
    }

    const fields: DriftInvariantChangeField[] = [];
    if (invariant.enforce !== prior.enforce) fields.push('enforce');
    if ((invariant.ssot ?? '') !== (prior.ssot ?? '')) fields.push('ssot');
    const sinksAdded = difference(sortedSinks(invariant.sinks), sortedSinks(prior.sinks));
    const sinksRemoved = difference(sortedSinks(prior.sinks), sortedSinks(invariant.sinks));
    if (sinksAdded.length > 0 || sinksRemoved.length > 0) fields.push('sinks');
    if (fields.length === 0) continue;

    changes.push({
      id: invariant.id,
      kind: 'changed',
      enforce: invariant.enforce,
      fields,
      previous: prior,
      current: invariant,
      sinksAdded: sinksAdded.length > 0 ? sinksAdded : undefined,
      sinksRemoved: sinksRemoved.length > 0 ? sinksRemoved : undefined,
    });
  }

  for (const invariant of previous) {
    if (currentById.has(invariant.id)) continue;
    changes.push({
      id: invariant.id,
      kind: 'removed',
      enforce: invariant.enforce,
      fields: [],
      previous: invariant,
      sinksRemoved: sortedSinks(invariant.sinks),
    });
  }

  const previousOrder = previous.map((invariant) => invariant.id);
  const currentOrder = current.map((invariant) => invariant.id);
  if (changes.length === 0 && !sameStringArray(previousOrder, currentOrder)) {
    changes.push({
      id: '__order__',
      kind: 'reordered',
      fields: [],
      previousOrder,
      currentOrder,
    });
  }

  return changes;
}

function formatInvariantChange(change: DriftInvariantChange): string[] {
  const lines: string[] = [];
  if (change.kind === 'reordered') {
    lines.push('    ~ invariant order changed');
    lines.push(`      previous: ${(change.previousOrder ?? []).join(', ')}`);
    lines.push(`      current: ${(change.currentOrder ?? []).join(', ')}`);
    return lines;
  }

  const marker = change.kind === 'added' ? '+' : change.kind === 'removed' ? '-' : '~';
  lines.push(`    ${marker} ${change.id}`);

  if (change.kind === 'changed' && change.fields.includes('enforce')) {
    lines.push(`      enforce: ${change.previous?.enforce ?? 'none'} -> ${change.current?.enforce ?? 'none'}`);
  } else if (change.enforce) {
    lines.push(`      enforce: ${change.enforce}`);
  }

  if (change.kind === 'changed' && change.fields.includes('ssot')) {
    lines.push(`      ssot: ${change.previous?.ssot ?? 'none'} -> ${change.current?.ssot ?? 'none'}`);
  } else {
    const ssot = change.current?.ssot ?? change.previous?.ssot;
    if (ssot) lines.push(`      ssot: ${ssot}`);
  }

  if (change.kind === 'added' && change.sinksAdded && change.sinksAdded.length > 0) {
    lines.push('      sinks:');
    for (const sink of change.sinksAdded) lines.push(`        + ${sink}`);
  }

  if (change.kind === 'removed' && change.sinksRemoved && change.sinksRemoved.length > 0) {
    lines.push('      sinks:');
    for (const sink of change.sinksRemoved) lines.push(`        - ${sink}`);
  }

  if (change.kind === 'changed') {
    if (change.sinksAdded && change.sinksAdded.length > 0) {
      lines.push('      sinks added:');
      for (const sink of change.sinksAdded) lines.push(`        + ${sink}`);
    }
    if (change.sinksRemoved && change.sinksRemoved.length > 0) {
      lines.push('      sinks removed:');
      for (const sink of change.sinksRemoved) lines.push(`        - ${sink}`);
    }
  }

  return lines;
}

function sortedSinks(sinks: string[] | undefined): string[] {
  return [...new Set(sinks ?? [])].sort();
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}
