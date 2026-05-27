import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { DriftContractsIndex, DriftSource } from '../types.js';
import { normalizePath, normalizeSourceDirs } from './files.js';
import { moduleSpecifierCandidates } from './module-specifier.js';
import type { DriftIndexStore } from './index-file.js';

/* @drift
version: 1
id: core.git-scope
scope: file
stability: locked

intent: >
  Resolve Git changed-file scope for Drift checks while expanding impacted
  contracts when declared sources of truth change.

ssot:
  files: "./files.ts"
  module-specifier: "./module-specifier.ts"

invariants:
  - id: git-scope-normalizes-source-files
    enforce: drift/ssot-usage
    ssot: files
  - id: git-scope-expands-ssot-candidates
    enforce: drift/ssot-usage
    ssot: module-specifier

llm:
  must_not_change:
    - Changed source files must define the extraction scope.
    - SSOT file changes must include impacted contract files.
    - Deleted files must scope the index without being extracted.
*/
const execFileAsync = promisify(execFile);

export type GitFileScope = {
  changedFiles: string[];
  contractFiles: string[];
  extractFiles: string[];
  impactedContractIds: string[];
  indexedContractIds: string[];
};

export async function resolveGitFileScope(
  root: string,
  gitBase: string,
  sourceDir: DriftSource = 'src',
  index?: DriftContractsIndex,
): Promise<GitFileScope> {
  const normalizedSourceDirs = normalizeSourceDirs(sourceDir).map(normalizeGitPath);
  const changedFiles = await gitChangedFiles(root, gitBase);
  const contractFiles = new Set(changedFiles.filter(isTypeScriptFile));
  const impactedContractIds = new Set<string>();

  for (const contract of index?.contracts ?? []) {
    if (!contract.ssot) continue;
    if (Object.values(contract.ssot).some((ssotPath) => changedFiles.some((file) => matchesSsotFile(file, ssotPath, normalizedSourceDirs)))) {
      contractFiles.add(contract.file);
      impactedContractIds.add(contract.id);
    }
  }

  const extractFiles = await existingFiles(root, [...contractFiles].filter(isTypeScriptFile));

  return {
    changedFiles,
    contractFiles: [...contractFiles].sort(),
    extractFiles,
    impactedContractIds: [...impactedContractIds].sort(),
    indexedContractIds: index ? filterIndexByFiles(index, [...contractFiles]).contracts.map((contract) => contract.id).sort() : [],
  };
}

export async function resolveGitFileScopeFromStore(
  root: string,
  gitBase: string,
  _sourceDir: DriftSource = 'src',
  store?: DriftIndexStore,
): Promise<GitFileScope> {
  const changedFiles = await gitChangedFiles(root, gitBase);
  const contractFiles = new Set(changedFiles.filter(isTypeScriptFile));
  const impactedContractIds = new Set<string>();
  const indexedContractIds = new Set<string>();

  if (store) {
    const lookup = await store.getContractIdsForFiles(changedFiles, { includeOwned: true, includeImpacted: true });
    for (const id of lookup.ownedContractIds) indexedContractIds.add(id);
    for (const id of lookup.impactedContractIds) {
      indexedContractIds.add(id);
      impactedContractIds.add(id);
    }

    const indexedContracts = await store.getContractsByIds([...indexedContractIds]);
    for (const contract of indexedContracts) contractFiles.add(contract.file);
  }

  const extractFiles = await existingFiles(root, [...contractFiles].filter(isTypeScriptFile));

  return {
    changedFiles,
    contractFiles: [...contractFiles].sort(),
    extractFiles,
    impactedContractIds: [...impactedContractIds].sort(),
    indexedContractIds: [...indexedContractIds].sort(),
  };
}

export function filterIndexByFiles(index: DriftContractsIndex, files: string[]): DriftContractsIndex {
  const scopedFiles = new Set(files);
  return {
    ...index,
    contracts: index.contracts.filter((contract) => scopedFiles.has(contract.file)),
  };
}

export function filterContractsByFiles<T extends { file: string }>(contracts: T[], files: string[]): T[] {
  const scopedFiles = new Set(files);
  return contracts.filter((contract) => scopedFiles.has(contract.file));
}

async function gitChangedFiles(root: string, gitBase: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--name-status', '--find-renames', '--diff-filter=ACMRD', gitBase, '--'], { cwd: root });
    return parseNameStatus(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to resolve Git changed files from "${gitBase}": ${message}`);
  }
}

function parseNameStatus(output: string): string[] {
  const files = new Set<string>();

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const [status, first, second] = line.split('\t');
    if (!status || !first) continue;
    files.add(normalizeGitPath(first));
    if ((status.startsWith('R') || status.startsWith('C')) && second) files.add(normalizeGitPath(second));
  }

  return [...files].sort();
}

async function existingFiles(root: string, files: string[]): Promise<string[]> {
  const existing: string[] = [];
  for (const file of files) {
    try {
      await access(path.resolve(root, file));
      existing.push(file);
    } catch {
      // Deleted files stay in contractFiles for index scoping, but cannot be read.
    }
  }
  return existing.sort();
}

function matchesSsotFile(changedFile: string, ssotPath: string, sourceDirs: string[]): boolean {
  const changed = normalizeGitPath(changedFile);
  const candidates = ssotFileCandidates(ssotPath, sourceDirs);
  return candidates.some((candidate) => changed === candidate || changed.endsWith(`/${candidate}`));
}

function ssotFileCandidates(ssotPath: string, sourceDirs: string[]): string[] {
  const candidates = new Set<string>();

  for (const modulePath of moduleSpecifierCandidates(ssotPath)) {
    const normalized = normalizeGitPath(modulePath);
    addCandidate(candidates, normalized);

    const stripped = stripModulePrefix(normalized);
    addCandidate(candidates, stripped);
    for (const sourceDir of sourceDirs) {
      if (!stripped.startsWith(`${sourceDir}/`)) addCandidate(candidates, normalizePath(path.posix.join(sourceDir, stripped)));
    }
  }

  return [...candidates];
}

function addCandidate(candidates: Set<string>, value: string): void {
  if (value.length > 0) candidates.add(value);
}

function stripModulePrefix(value: string): string {
  return value.replace(/^(@\/|~\/|\.\/|\/)/, '');
}

function normalizeGitPath(file: string): string {
  return normalizePath(file).replace(/^\.\//, '');
}

function isTypeScriptFile(file: string): boolean {
  return file.endsWith('.ts') || file.endsWith('.tsx');
}
