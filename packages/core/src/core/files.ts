import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { DriftSource } from '../types.js';

const ignoredDirs = new Set(['.git', '.next', '.drift', 'dist', 'node_modules']);

export async function discoverSourceFiles(root: string, sourceDir: DriftSource = 'src'): Promise<string[]> {
  const files = new Set<string>();

  for (const source of normalizeSourceDirs(sourceDir)) {
    const start = path.join(root, source);
    const sourceFiles = await walk(start).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });

    for (const file of sourceFiles) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      files.add(path.relative(root, file).split(path.sep).join('/'));
    }
  }

  return [...files].sort();
}

export function normalizeSourceDirs(sourceDir: DriftSource = 'src'): string[] {
  const sources = Array.isArray(sourceDir) ? sourceDir : [sourceDir];
  return [...new Set(sources.map((source) => normalizePath(source.trim()).replace(/^\.\//, '').replace(/\/$/, '')).filter(Boolean))];
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') && ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) files.push(...(await walk(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

export function normalizePath(file: string): string {
  return file.split(path.sep).join('/');
}
