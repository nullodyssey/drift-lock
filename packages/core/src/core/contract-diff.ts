import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  DriftContractChange,
  DriftContractChangeField,
  DriftContractDiff,
  DriftContractsIndex,
  DriftError,
  DriftExtractedContract,
  DriftIndexedContract,
} from '../types.js';
import { extractContracts, type ExtractOptions } from './extractor.js';
import { canonicalize } from './hash.js';
import { readIndex, toIndex } from './index-file.js';
import { isValidContractId } from './validator.js';

export type DiffContractsOptions = ExtractOptions & {
  indexPath?: string;
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
  const extracted = await extractContracts(options);
  const index = await readIndex(root, options.indexPath);
  return {
    contracts: extracted.contracts,
    errors: extracted.errors,
    diff: diffContractSets(toIndex(extracted.contracts).contracts, index?.contracts ?? []),
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

    const fields = changedFields(contract, prior);
    if (fields.length > 0 || contract.contentHash !== prior.contentHash || contract.bodyHash !== prior.bodyHash) {
      changes.push({
        id: contract.id,
        kind: 'changed',
        file: contract.file,
        stability: contract.stability,
        fields,
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

function changedFields(current: DriftIndexedContract, previous: DriftIndexedContract): DriftContractChangeField[] {
  const fields: DriftContractChangeField[] = [];
  for (const field of ['intent', 'stability', 'scope', 'anchor', 'ssot', 'invariants', 'llm', 'file'] as const) {
    if (!sameValue(current[field], previous[field])) fields.push(field);
  }
  if (current.bodyHash !== previous.bodyHash) fields.push('body');
  return fields;
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalize(left ?? null) === canonicalize(right ?? null);
}
