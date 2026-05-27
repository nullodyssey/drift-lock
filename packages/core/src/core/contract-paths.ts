import path from 'node:path';
import type { DriftSource } from '../types.js';
import { normalizePath, normalizeSourceDirs } from './files.js';
import { moduleSpecifierCandidates } from './module-specifier.js';

/* @drift
version: 1
id: core.contract-paths
scope: file
stability: locked

intent: >
  Resolve contract-owned files, SSOT paths, and helper imports to exact
  repository-relative source files before querying or writing the sharded index.

ssot:
  files: "./files.ts"
  module-specifier: "./module-specifier.ts"

invariants:
  - id: contract-paths-normalizes-source-roots
    enforce: drift/ssot-usage
    ssot: files
  - id: contract-paths-preserves-module-variants
    enforce: drift/ssot-usage
    ssot: module-specifier

llm:
  must_not_change:
    - Source-root-relative aliases must be resolved from configured source roots, not guessed from path suffixes.
    - File lookup candidates must keep exact physical paths and extension variants only.
    - Package imports must not be written as by-file index keys.
*/
export type ModuleFileCandidateOptions = {
  currentFile?: string;
  sourceDir?: DriftSource;
};

export function fileLookupCandidates(file: string): string[] {
  const normalized = normalizeRepoPath(file);
  const candidates = new Set<string>();
  addFileCandidates(candidates, normalized);
  return [...candidates].filter((candidate) => candidate.length > 0);
}

export function moduleFileCandidates(moduleSpecifier: string, options: ModuleFileCandidateOptions = {}): string[] {
  const candidates = new Set<string>();

  for (const modulePath of moduleSpecifierCandidates(moduleSpecifier)) {
    for (const physicalPath of modulePhysicalPathCandidates(modulePath, options)) {
      addFileCandidates(candidates, physicalPath);
    }
  }

  return [...candidates].filter((candidate) => candidate.length > 0);
}

export function helperImportFileCandidates(currentFile: string, source: string, sourceDir?: DriftSource): string[] {
  const candidates = new Set<string>();
  for (const moduleSpecifier of importModuleSpecifiers(source)) {
    for (const candidate of moduleFileCandidates(moduleSpecifier, { currentFile, sourceDir })) candidates.add(candidate);
  }
  return [...candidates].filter((candidate) => candidate.length > 0);
}

export function importModuleSpecifiers(source: string): string[] {
  const modules = new Set<string>();
  const pattern = /\bimport\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (match[1]) modules.add(match[1]);
  }
  return [...modules];
}

function modulePhysicalPathCandidates(modulePath: string, options: ModuleFileCandidateOptions): string[] {
  const slashPath = normalizePath(modulePath);
  const normalized = normalizeRepoPath(modulePath);
  if (!normalized) return [];

  if (slashPath.startsWith('.')) {
    if (!options.currentFile) return [];
    return [normalizeRepoPath(path.posix.join(path.posix.dirname(normalizeRepoPath(options.currentFile)), slashPath))];
  }

  const strippedAlias = stripSourceAlias(normalized);
  if (strippedAlias !== normalized) {
    const sourceRoot = options.currentFile ? containingSourceRoot(options.currentFile, options.sourceDir) : undefined;
    if (!sourceRoot) return [];
    return [normalizeRepoPath(path.posix.join(sourceRoot, strippedAlias))];
  }

  if (isUnderConfiguredSourceRoot(normalized, options.sourceDir)) return [normalized];
  return [];
}

function containingSourceRoot(file: string, sourceDir: DriftSource = 'src'): string | undefined {
  const normalizedFile = normalizeRepoPath(file);
  return normalizeSourceDirs(sourceDir)
    .sort((left, right) => right.length - left.length || left.localeCompare(right))
    .find((sourceRoot) => isPathInsideSourceRoot(normalizedFile, sourceRoot));
}

function isUnderConfiguredSourceRoot(file: string, sourceDir: DriftSource = 'src'): boolean {
  const normalizedFile = normalizeRepoPath(file);
  return normalizeSourceDirs(sourceDir).some((sourceRoot) => isPathInsideSourceRoot(normalizedFile, sourceRoot));
}

function isPathInsideSourceRoot(file: string, sourceRoot: string): boolean {
  return file === sourceRoot || file.startsWith(`${sourceRoot}/`);
}

function addFileCandidates(candidates: Set<string>, value: string): void {
  const normalized = normalizeRepoPath(value);
  if (!normalized) return;
  candidates.add(normalized);
  const extensionless = normalized.replace(/\.(tsx|ts|jsx|js)$/, '');
  candidates.add(extensionless);
  candidates.add(`${extensionless}.ts`);
  candidates.add(`${extensionless}.tsx`);
  candidates.add(`${extensionless}.js`);
  candidates.add(`${extensionless}.jsx`);
}

function stripSourceAlias(value: string): string {
  return value.replace(/^(@\/|~\/|\/)/, '');
}

function normalizeRepoPath(file: string): string {
  return normalizePath(file).replace(/^\.\//, '');
}
