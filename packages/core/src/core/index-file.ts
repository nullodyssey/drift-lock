import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  DriftContractSummaries,
  DriftContractsIndex,
  DriftExtractedContract,
  DriftIndexedContract,
  DriftSource,
} from '../types.js';
import { fileLookupCandidates, helperImportFileCandidates, moduleFileCandidates } from './contract-paths.js';
import { normalizePath } from './files.js';

/* @drift
version: 1
id: core.index-file
scope: file
stability: locked

intent: >
  Read, write, validate, and selectively query the committed Drift contract
  index store used as the baseline for checks, diffs, proof reports, and ESLint.

llm:
  must_not_change:
    - Runtime-only extraction fields must not be written to the committed index.
    - Missing index stores must be treated as absent, not invalid.
    - Generated index stores must remain deterministic, sharded, and Git-readable.
    - Scoped workflows must read contracts by file or id instead of requiring a full index materialization.
*/
export const defaultIndexPath = '.drift/contracts.generated.index';

const execFileAsync = promisify(execFile);
const bucketCount = 256;
const hashPattern = /^sha256:[a-f0-9]{64}$/;
const manifestKeys = new Set(['version', 'schema', 'contractSchemaVersion', 'bucketCount', 'hash', 'paths', 'totals', 'buckets', 'digest']);
const manifestPathKeys = new Set(['byContract', 'byFile']);
const manifestTotalsKeys = new Set(['contracts', 'sourceFiles', 'locked', 'draft']);
const manifestBucketsKeys = new Set(['byContract', 'byFile']);
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

export type DriftIndexLocation =
  | { kind: 'working-tree'; root: string; indexPath?: string }
  | { kind: 'git-ref'; root: string; ref: string; indexPath?: string };

export type DriftIndexStats = {
  contracts: number;
  sourceFiles: number;
  locked: number;
  draft: number;
};

export type DriftFileLookupOptions = {
  includeOwned?: boolean;
  includeImpacted?: boolean;
  includeHelperCandidates?: boolean;
};

export type DriftFileContractLookup = {
  files: string[];
  ownedContractIds: string[];
  impactedContractIds: string[];
  helperCandidateContractIds: string[];
  missingFiles: string[];
};

export type DriftIndexWriteOptions = {
  sourceDir?: DriftSource;
};

export type DriftIndexStore = {
  format: 'sharded-v1';
  exists(): Promise<boolean>;
  getStats(): Promise<DriftIndexStats | undefined>;
  getContractsByIds(ids: string[]): Promise<DriftIndexedContract[]>;
  getContractIdsForFiles(files: string[], options?: DriftFileLookupOptions): Promise<DriftFileContractLookup>;
  streamContracts(): AsyncIterable<DriftIndexedContract>;
  materializeIndex(): Promise<DriftContractsIndex | undefined>;
};

type ShardedManifest = {
  version: 1;
  schema: 'drift-sharded-index';
  contractSchemaVersion: 1;
  bucketCount: 256;
  hash: 'sha256';
  paths: {
    byContract: 'by-contract/{bucket}.ndjson';
    byFile: 'by-file/{bucket}.ndjson';
  };
  totals: DriftIndexStats;
  buckets: {
    byContract: Record<string, string>;
    byFile: Record<string, string>;
  };
  digest: string;
};

type ContractBucketRecord = {
  id: string;
  contract: DriftIndexedContract;
};

type FileBucketRecord = {
  file: string;
  ownedContractIds?: string[];
  impactedContractIds?: string[];
  helperCandidateContractIds?: string[];
};

type BucketKind = 'byContract' | 'byFile';

export function toIndex(contracts: DriftExtractedContract[]): DriftContractsIndex {
  return {
    version: 1,
    // Runtime-only fields make checks possible in-memory, but keeping them out of
    // the committed index preserves a compact, stable baseline.
    contracts: contracts.map(toIndexedContract),
  };
}

export async function writeIndexStore(root: string, output = defaultIndexPath, index: DriftContractsIndex, options: DriftIndexWriteOptions = {}): Promise<void> {
  validateIndexObject(index, output);
  const absoluteOutput = path.resolve(root, output);
  const byContract = bucketContracts(index.contracts);
  const byFile = bucketFiles(buildFileRecords(index.contracts, options.sourceDir));
  const manifest = createManifest(index.contracts, byContract, byFile);

  await rm(absoluteOutput, { recursive: true, force: true });
  await mkdir(path.join(absoluteOutput, 'by-contract'), { recursive: true });
  await mkdir(path.join(absoluteOutput, 'by-file'), { recursive: true });

  for (const [bucket, content] of Object.entries(byContract).sort(([left], [right]) => left.localeCompare(right))) {
    await writeFile(path.join(absoluteOutput, 'by-contract', `${bucket}.ndjson`), content, 'utf8');
  }

  for (const [bucket, content] of Object.entries(byFile).sort(([left], [right]) => left.localeCompare(right))) {
    await writeFile(path.join(absoluteOutput, 'by-file', `${bucket}.ndjson`), content, 'utf8');
  }

  await writeFile(path.join(absoluteOutput, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export function writeIndexStoreSync(root: string, output = defaultIndexPath, index: DriftContractsIndex, options: DriftIndexWriteOptions = {}): void {
  validateIndexObject(index, output);
  const absoluteOutput = path.resolve(root, output);
  const byContract = bucketContracts(index.contracts);
  const byFile = bucketFiles(buildFileRecords(index.contracts, options.sourceDir));
  const manifest = createManifest(index.contracts, byContract, byFile);

  rmSync(absoluteOutput, { recursive: true, force: true });
  mkdirSync(path.join(absoluteOutput, 'by-contract'), { recursive: true });
  mkdirSync(path.join(absoluteOutput, 'by-file'), { recursive: true });

  for (const [bucket, content] of Object.entries(byContract).sort(([left], [right]) => left.localeCompare(right))) {
    writeFileSync(path.join(absoluteOutput, 'by-contract', `${bucket}.ndjson`), content, 'utf8');
  }

  for (const [bucket, content] of Object.entries(byFile).sort(([left], [right]) => left.localeCompare(right))) {
    writeFileSync(path.join(absoluteOutput, 'by-file', `${bucket}.ndjson`), content, 'utf8');
  }

  writeFileSync(path.join(absoluteOutput, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export async function openIndexStore(location: DriftIndexLocation): Promise<DriftIndexStore | undefined> {
  const indexPath = location.indexPath ?? defaultIndexPath;
  if (location.kind === 'working-tree') {
    const root = path.resolve(location.root);
    const absoluteIndexPath = path.resolve(root, indexPath);
    const manifestPath = path.join(absoluteIndexPath, 'manifest.json');
    let manifestText: string;
    try {
      manifestText = await readFile(manifestPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw invalidIndex(indexPath);
    }

    const manifest = validateManifest(parseJson(manifestText, manifestPath), manifestPath);
    return new LocalIndexStore(indexPath, absoluteIndexPath, manifest);
  }

  const root = path.resolve(location.root);
  await verifyGitRef(root, location.ref);
  const relativeIndexPath = gitIndexPath(root, indexPath);
  const manifestRef = `${location.ref}:${relativeIndexPath}/manifest.json`;
  if (!(await gitObjectExists(root, manifestRef))) return undefined;
  const manifestText = await readGitBlob(root, manifestRef);
  const manifest = validateManifest(parseJson(manifestText, manifestRef), manifestRef);
  return new GitIndexStore(root, relativeIndexPath, location.ref, manifest);
}

export function openSyncLocalIndexStore(root: string, indexPath = defaultIndexPath): SyncLocalIndexStore | undefined {
  const absoluteIndexPath = path.resolve(root, indexPath);
  const manifestPath = path.join(absoluteIndexPath, 'manifest.json');
  if (!existsSync(manifestPath)) return undefined;
  const manifest = validateManifest(parseJson(readFileSync(manifestPath, 'utf8'), manifestPath), manifestPath);
  return new SyncLocalIndexStore(indexPath, absoluteIndexPath, manifest);
}

export function readIndexContractsForFileSync(
  root: string,
  indexPath: string,
  file: string,
): { status: 'missing' } | { status: 'loaded'; index: DriftContractsIndex } | { status: 'invalid'; message: string } {
  try {
    const store = openSyncLocalIndexStore(root, indexPath);
    if (!store) return { status: 'missing' };
    const ids = store.getContractIdsForFiles([file], { includeOwned: true }).ownedContractIds;
    return { status: 'loaded', index: { version: 1, contracts: store.getContractsByIds(ids) } };
  } catch {
    return { status: 'invalid', message: `DRIFT_INDEX_INVALID: Invalid Drift contracts index at "${indexPath}".` };
  }
}

export function readIndexHelperContractsForFileSync(
  root: string,
  indexPath: string,
  file: string,
  source: string,
  sourceDir?: DriftSource,
): DriftIndexedContract[] {
  try {
    const store = openSyncLocalIndexStore(root, indexPath);
    if (!store) return [];
    const helperFiles = helperImportFileCandidates(file, source, sourceDir);
    const lookup = store.getContractIdsForFiles(helperFiles, { includeHelperCandidates: true });
    return store.getContractsByIds(lookup.helperCandidateContractIds);
  } catch {
    return [];
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

export function validateIndexedContract(value: unknown, file: string): DriftIndexedContract {
  validateIndexedContractObject(value, file);
  return value as DriftIndexedContract;
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

class LocalIndexStore implements DriftIndexStore {
  format = 'sharded-v1' as const;

  constructor(
    private readonly indexPath: string,
    private readonly absoluteIndexPath: string,
    private readonly manifest: ShardedManifest,
  ) {}

  async exists(): Promise<boolean> {
    return true;
  }

  async getStats(): Promise<DriftIndexStats> {
    return this.manifest.totals;
  }

  async getContractsByIds(ids: string[]): Promise<DriftIndexedContract[]> {
    const wanted = new Set(ids);
    const contracts: DriftIndexedContract[] = [];
    for (const bucket of idsByBucket(ids).keys()) {
      for (const record of parseContractBucket(await this.readBucket('byContract', bucket))) {
        if (!wanted.has(record.id)) continue;
        contracts.push(record.contract);
        wanted.delete(record.id);
      }
    }
    return sortContracts(contracts);
  }

  async getContractIdsForFiles(files: string[], options: DriftFileLookupOptions = {}): Promise<DriftFileContractLookup> {
    const normalizedFiles = normalizeLookupFiles(files);
    const recordsByFile = new Map<string, FileBucketRecord>();
    for (const bucket of bucketsForValues(normalizedFiles)) {
      for (const record of parseFileBucket(await this.readBucket('byFile', bucket))) {
        if (normalizedFiles.has(record.file)) recordsByFile.set(record.file, record);
      }
    }
    return lookupFromRecords(normalizedFiles, recordsByFile, options);
  }

  async *streamContracts(): AsyncIterable<DriftIndexedContract> {
    for (const bucket of Object.keys(this.manifest.buckets.byContract).sort()) {
      for (const record of parseContractBucket(await this.readBucket('byContract', bucket))) {
        yield record.contract;
      }
    }
  }

  async materializeIndex(): Promise<DriftContractsIndex> {
    const contracts: DriftIndexedContract[] = [];
    for await (const contract of this.streamContracts()) contracts.push(contract);
    return { version: 1, contracts: sortContracts(contracts) };
  }

  private async readBucket(kind: BucketKind, bucket: string): Promise<string | undefined> {
    const digest = bucketDigest(this.manifest, kind, bucket);
    if (!digest) return undefined;
    const file = path.join(this.absoluteIndexPath, bucketPath(kind, bucket));
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      throw invalidIndex(path.join(this.indexPath, bucketPath(kind, bucket)));
    }
    assertDigest(content, digest, path.join(this.indexPath, bucketPath(kind, bucket)));
    return content;
  }
}

class GitIndexStore implements DriftIndexStore {
  format = 'sharded-v1' as const;

  constructor(
    private readonly root: string,
    private readonly indexPath: string,
    private readonly ref: string,
    private readonly manifest: ShardedManifest,
  ) {}

  async exists(): Promise<boolean> {
    return true;
  }

  async getStats(): Promise<DriftIndexStats> {
    return this.manifest.totals;
  }

  async getContractsByIds(ids: string[]): Promise<DriftIndexedContract[]> {
    const wanted = new Set(ids);
    const contracts: DriftIndexedContract[] = [];
    for (const bucket of idsByBucket(ids).keys()) {
      for (const record of parseContractBucket(await this.readBucket('byContract', bucket))) {
        if (!wanted.has(record.id)) continue;
        contracts.push(record.contract);
        wanted.delete(record.id);
      }
    }
    return sortContracts(contracts);
  }

  async getContractIdsForFiles(files: string[], options: DriftFileLookupOptions = {}): Promise<DriftFileContractLookup> {
    const normalizedFiles = normalizeLookupFiles(files);
    const recordsByFile = new Map<string, FileBucketRecord>();
    for (const bucket of bucketsForValues(normalizedFiles)) {
      for (const record of parseFileBucket(await this.readBucket('byFile', bucket))) {
        if (normalizedFiles.has(record.file)) recordsByFile.set(record.file, record);
      }
    }
    return lookupFromRecords(normalizedFiles, recordsByFile, options);
  }

  async *streamContracts(): AsyncIterable<DriftIndexedContract> {
    for (const bucket of Object.keys(this.manifest.buckets.byContract).sort()) {
      for (const record of parseContractBucket(await this.readBucket('byContract', bucket))) {
        yield record.contract;
      }
    }
  }

  async materializeIndex(): Promise<DriftContractsIndex> {
    const contracts: DriftIndexedContract[] = [];
    for await (const contract of this.streamContracts()) contracts.push(contract);
    return { version: 1, contracts: sortContracts(contracts) };
  }

  private async readBucket(kind: BucketKind, bucket: string): Promise<string | undefined> {
    const digest = bucketDigest(this.manifest, kind, bucket);
    if (!digest) return undefined;
    const relativePath = normalizeGitPath(path.posix.join(this.indexPath, bucketPath(kind, bucket)));
    const objectRef = `${this.ref}:${relativePath}`;
    const content = await readGitBlob(this.root, objectRef);
    assertDigest(content, digest, objectRef);
    return content;
  }
}

export class SyncLocalIndexStore {
  constructor(
    private readonly indexPath: string,
    private readonly absoluteIndexPath: string,
    private readonly manifest: ShardedManifest,
  ) {}

  getContractsByIds(ids: string[]): DriftIndexedContract[] {
    const wanted = new Set(ids);
    const contracts: DriftIndexedContract[] = [];
    for (const bucket of idsByBucket(ids).keys()) {
      for (const record of parseContractBucket(this.readBucket('byContract', bucket))) {
        if (!wanted.has(record.id)) continue;
        contracts.push(record.contract);
        wanted.delete(record.id);
      }
    }
    return sortContracts(contracts);
  }

  getContractIdsForFiles(files: string[], options: DriftFileLookupOptions = {}): DriftFileContractLookup {
    const normalizedFiles = normalizeLookupFiles(files);
    const recordsByFile = new Map<string, FileBucketRecord>();
    for (const bucket of bucketsForValues(normalizedFiles)) {
      for (const record of parseFileBucket(this.readBucket('byFile', bucket))) {
        if (normalizedFiles.has(record.file)) recordsByFile.set(record.file, record);
      }
    }
    return lookupFromRecords(normalizedFiles, recordsByFile, options);
  }

  private readBucket(kind: BucketKind, bucket: string): string | undefined {
    const digest = bucketDigest(this.manifest, kind, bucket);
    if (!digest) return undefined;
    const relativePath = bucketPath(kind, bucket);
    const content = readFileSync(path.join(this.absoluteIndexPath, relativePath), 'utf8');
    assertDigest(content, digest, path.join(this.indexPath, relativePath));
    return content;
  }
}

function bucketContracts(contracts: DriftIndexedContract[]): Record<string, string> {
  const recordsByBucket = new Map<string, ContractBucketRecord[]>();
  for (const contract of sortContracts(contracts)) {
    const bucket = bucketFor(contract.id);
    const records = recordsByBucket.get(bucket) ?? [];
    records.push({ id: contract.id, contract });
    recordsByBucket.set(bucket, records);
  }
  return stringifyBuckets(recordsByBucket);
}

function bucketFiles(records: FileBucketRecord[]): Record<string, string> {
  const recordsByBucket = new Map<string, FileBucketRecord[]>();
  for (const record of records.sort((left, right) => left.file.localeCompare(right.file))) {
    const bucket = bucketFor(record.file);
    const bucketRecords = recordsByBucket.get(bucket) ?? [];
    bucketRecords.push(record);
    recordsByBucket.set(bucket, bucketRecords);
  }
  return stringifyBuckets(recordsByBucket);
}

function stringifyBuckets<T>(recordsByBucket: Map<string, T[]>): Record<string, string> {
  const buckets: Record<string, string> = {};
  for (const [bucket, records] of [...recordsByBucket.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    buckets[bucket] = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  }
  return buckets;
}

function createManifest(
  contracts: DriftIndexedContract[],
  byContract: Record<string, string>,
  byFile: Record<string, string>,
): ShardedManifest {
  const sourceFiles = new Set(contracts.map((contract) => contract.file));
  const manifestWithoutDigest = {
    version: 1,
    schema: 'drift-sharded-index',
    contractSchemaVersion: 1,
    bucketCount,
    hash: 'sha256',
    paths: {
      byContract: 'by-contract/{bucket}.ndjson',
      byFile: 'by-file/{bucket}.ndjson',
    },
    totals: {
      contracts: contracts.length,
      sourceFiles: sourceFiles.size,
      locked: contracts.filter((contract) => contract.stability === 'locked').length,
      draft: contracts.filter((contract) => contract.stability === 'draft').length,
    },
    buckets: {
      byContract: bucketDigests(byContract),
      byFile: bucketDigests(byFile),
    },
  } satisfies Omit<ShardedManifest, 'digest'>;

  return {
    ...manifestWithoutDigest,
    digest: digestFor(JSON.stringify(manifestWithoutDigest)),
  };
}

function buildFileRecords(contracts: DriftIndexedContract[], sourceDir?: DriftSource): FileBucketRecord[] {
  const byFile = new Map<string, Required<FileBucketRecord>>();

  for (const contract of contracts) {
    addFileRecordId(byFile, contract.file, 'ownedContractIds', contract.id);
    addFileRecordId(byFile, contract.file, 'helperCandidateContractIds', contract.id);

    for (const ssotPath of Object.values(contract.ssot ?? {})) {
      for (const candidate of moduleFileCandidates(ssotPath, { currentFile: contract.file, sourceDir })) {
        addFileRecordId(byFile, candidate, 'impactedContractIds', contract.id);
      }
    }
  }

  return [...byFile.values()].map((record) => ({
    file: record.file,
    ownedContractIds: record.ownedContractIds.length > 0 ? sortUnique(record.ownedContractIds) : undefined,
    impactedContractIds: record.impactedContractIds.length > 0 ? sortUnique(record.impactedContractIds) : undefined,
    helperCandidateContractIds: record.helperCandidateContractIds.length > 0 ? sortUnique(record.helperCandidateContractIds) : undefined,
  }));
}

function addFileRecordId(
  byFile: Map<string, Required<FileBucketRecord>>,
  file: string,
  key: 'ownedContractIds' | 'impactedContractIds' | 'helperCandidateContractIds',
  id: string,
): void {
  for (const candidate of fileLookupCandidates(file)) {
    const record = byFile.get(candidate) ?? {
      file: candidate,
      ownedContractIds: [],
      impactedContractIds: [],
      helperCandidateContractIds: [],
    };
    record[key].push(id);
    byFile.set(candidate, record);
  }
}

function lookupFromRecords(
  files: Set<string>,
  recordsByFile: Map<string, FileBucketRecord>,
  options: DriftFileLookupOptions,
): DriftFileContractLookup {
  const ownedContractIds = new Set<string>();
  const impactedContractIds = new Set<string>();
  const helperCandidateContractIds = new Set<string>();
  const missingFiles = new Set<string>();

  for (const file of files) {
    const record = recordsByFile.get(file);
    if (!record) {
      missingFiles.add(file);
      continue;
    }
    if (options.includeOwned !== false) {
      for (const id of record.ownedContractIds ?? []) ownedContractIds.add(id);
    }
    if (options.includeImpacted) {
      for (const id of record.impactedContractIds ?? []) impactedContractIds.add(id);
    }
    if (options.includeHelperCandidates) {
      for (const id of record.helperCandidateContractIds ?? []) helperCandidateContractIds.add(id);
    }
  }

  return {
    files: [...files].sort(),
    ownedContractIds: [...ownedContractIds].sort(),
    impactedContractIds: [...impactedContractIds].sort(),
    helperCandidateContractIds: [...helperCandidateContractIds].sort(),
    missingFiles: [...missingFiles].sort(),
  };
}

function parseContractBucket(content: string | undefined): ContractBucketRecord[] {
  if (!content) return [];
  return parseNdjson(content, (value, file) => {
    if (!isPlainObject(value) || typeof value.id !== 'string' || !('contract' in value)) throw invalidIndex(file);
    const contract = validateIndexedContract(value.contract, file);
    if (contract.id !== value.id) throw invalidIndex(file);
    return { id: value.id, contract };
  });
}

function parseFileBucket(content: string | undefined): FileBucketRecord[] {
  if (!content) return [];
  return parseNdjson(content, (value, file) => {
    if (!isPlainObject(value) || !isNonEmptyString(value.file)) throw invalidIndex(file);
    if (value.ownedContractIds !== undefined && !isStringArray(value.ownedContractIds)) throw invalidIndex(file);
    if (value.impactedContractIds !== undefined && !isStringArray(value.impactedContractIds)) throw invalidIndex(file);
    if (value.helperCandidateContractIds !== undefined && !isStringArray(value.helperCandidateContractIds)) throw invalidIndex(file);
    return value as FileBucketRecord;
  });
}

function parseNdjson<T>(content: string, validate: (value: unknown, file: string) => T): T[] {
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line, index) => validate(parseJson(line, `bucket line ${index + 1}`), `bucket line ${index + 1}`));
}

function validateManifest(value: unknown, file: string): ShardedManifest {
  if (!isPlainObject(value) || !hasOnlyKeys(value, manifestKeys)) throw invalidIndex(file);
  if (
    value.version !== 1 ||
    value.schema !== 'drift-sharded-index' ||
    value.contractSchemaVersion !== 1 ||
    value.bucketCount !== bucketCount ||
    value.hash !== 'sha256' ||
    !isPlainObject(value.paths) ||
    !hasOnlyKeys(value.paths, manifestPathKeys) ||
    value.paths.byContract !== 'by-contract/{bucket}.ndjson' ||
    value.paths.byFile !== 'by-file/{bucket}.ndjson' ||
    !isPlainObject(value.totals) ||
    !hasOnlyKeys(value.totals, manifestTotalsKeys) ||
    !isNonNegativeNumber(value.totals.contracts) ||
    !isNonNegativeNumber(value.totals.sourceFiles) ||
    !isNonNegativeNumber(value.totals.locked) ||
    !isNonNegativeNumber(value.totals.draft) ||
    !isPlainObject(value.buckets) ||
    !hasOnlyKeys(value.buckets, manifestBucketsKeys) ||
    !isBucketDigestRecord(value.buckets.byContract) ||
    !isBucketDigestRecord(value.buckets.byFile) ||
    !isHash(value.digest)
  ) {
    throw invalidIndex(file);
  }

  return value as ShardedManifest;
}

function validateIndexedContractObject(value: unknown, file: string): void {
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

function bucketPath(kind: BucketKind, bucket: string): string {
  return kind === 'byContract' ? `by-contract/${bucket}.ndjson` : `by-file/${bucket}.ndjson`;
}

function bucketDigest(manifest: ShardedManifest, kind: BucketKind, bucket: string): string | undefined {
  return kind === 'byContract' ? manifest.buckets.byContract[bucket] : manifest.buckets.byFile[bucket];
}

function bucketDigests(buckets: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(buckets).map(([bucket, content]) => [bucket, digestFor(content)]).sort(([left], [right]) => left.localeCompare(right)));
}

function bucketFor(value: string): string {
  return createHash('sha256').update(normalizePath(value)).digest('hex').slice(0, 2);
}

function idsByBucket(ids: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const id of sortUnique(ids)) {
    const bucket = bucketFor(id);
    const bucketIds = grouped.get(bucket) ?? [];
    bucketIds.push(id);
    grouped.set(bucket, bucketIds);
  }
  return grouped;
}

function bucketsForValues(values: Set<string>): string[] {
  return [...new Set([...values].map(bucketFor))].sort();
}

function digestFor(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function assertDigest(content: string, expected: string, file: string): void {
  if (digestFor(content) !== expected) throw invalidIndex(file);
}

function sortContracts(contracts: DriftIndexedContract[]): DriftIndexedContract[] {
  return [...contracts].sort((left, right) => (left.file === right.file ? left.id.localeCompare(right.id) : left.file.localeCompare(right.file)));
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizeLookupFiles(files: string[]): Set<string> {
  const values = new Set<string>();
  for (const file of files) {
    for (const candidate of fileLookupCandidates(file)) values.add(candidate);
  }
  return values;
}

async function verifyGitRef(root: string, ref: string): Promise<void> {
  try {
    await execFileAsync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: root });
  } catch (error) {
    throw new Error(`Unable to verify Git ref "${ref}": ${errorMessage(error)}`);
  }
}

async function gitObjectExists(root: string, objectRef: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['cat-file', '-e', objectRef], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

async function readGitBlob(root: string, objectRef: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['cat-file', 'blob', objectRef], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString('utf8'));
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || `git cat-file exited with code ${code}`));
    });
  });
}

function normalizeGitPath(file: string): string {
  return normalizePath(file).replace(/^\.\//, '');
}

function gitIndexPath(root: string, indexPath: string): string {
  const absoluteIndexPath = path.isAbsolute(indexPath) ? indexPath : path.resolve(root, indexPath);
  const relativeIndexPath = path.relative(root, absoluteIndexPath);
  if (!relativeIndexPath || relativeIndexPath.startsWith('..') || path.isAbsolute(relativeIndexPath)) {
    throw new Error(`Git index path "${indexPath}" must be inside repository root "${root}".`);
  }
  return normalizeGitPath(relativeIndexPath);
}

function parseJson(value: string, file: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw invalidIndex(file);
  }
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

function isBucketDigestRecord(value: unknown): boolean {
  return isPlainObject(value) && Object.entries(value).every(([bucket, digest]) => /^[a-f0-9]{2}$/.test(bucket) && isHash(digest));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => isNonEmptyString(entry));
}

function isNonNegativeNumber(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0;
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

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return String(error);
}
