import ignore from 'ignore';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { DriftSource } from '../types.js';

/* @drift
version: 1
id: core.files
scope: file
stability: locked

intent: >
  Discover configured TypeScript source files deterministically while respecting
  project ignores and normalized Drift source roots.

llm:
  must_not_change:
    - Discovery must ignore generated, dependency, git, and Drift metadata folders.
    - Source roots must support strings and arrays.
    - Returned file paths must stay sorted and project-relative.
*/
const alwaysIgnoredDirs = new Set(['.git', '.next', '.drift', 'dist', 'node_modules']);
type IgnoreMatcher = ReturnType<typeof ignore>;

export async function discoverSourceFiles(root: string, sourceDir: DriftSource = 'src'): Promise<string[]> {
  const absoluteRoot = path.resolve(root);
  const ignoreMatcher = await readProjectIgnore(absoluteRoot);
  const files = new Set<string>();

  for (const source of normalizeSourceDirs(sourceDir)) {
    const start = path.join(absoluteRoot, source);
    const sourceFiles = await walk(absoluteRoot, start, ignoreMatcher).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });

    for (const file of sourceFiles) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      files.add(normalizePath(path.relative(absoluteRoot, file)));
    }
  }

  return [...files].sort();
}

export function normalizeSourceDirs(sourceDir: DriftSource = 'src'): string[] {
  const sources = Array.isArray(sourceDir) ? sourceDir : [sourceDir];
  return [...new Set(sources.map((source) => normalizePath(source.trim()).replace(/^\.\//, '').replace(/\/$/, '')).filter(Boolean))];
}

async function walk(root: string, dir: string, ignoreMatcher: IgnoreMatcher | undefined): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (alwaysIgnoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const relativePath = normalizePath(path.relative(root, fullPath));

    if (entry.isDirectory()) {
      if (ignoreMatcher?.ignores(relativePath + '/')) continue;
      files.push(...(await walk(root, fullPath, ignoreMatcher)));
    } else if (entry.isFile()) {
      if (ignoreMatcher?.ignores(relativePath)) continue;
      files.push(fullPath);
    }
  }

  return files;
}

async function readProjectIgnore(root: string): Promise<IgnoreMatcher | undefined> {
  const content = await readOptionalFile(path.join(root, '.driftignore')) ?? await readOptionalFile(path.join(root, '.gitignore'));
  if (!content) return undefined;
  return ignore().add(content);
}

async function readOptionalFile(file: string): Promise<string | undefined> {
  return readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
}

export function normalizePath(file: string): string {
  return file.split(path.sep).join('/');
}
