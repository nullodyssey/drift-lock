import { readdir } from 'node:fs/promises';
import path from 'node:path';

const ignoredDirs = new Set(['.git', '.next', '.drift', 'dist', 'node_modules']);

export async function discoverSourceFiles(root: string, sourceDir = 'src'): Promise<string[]> {
  const start = path.join(root, sourceDir);
  const files = await walk(start).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });

  return files
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
    .map((file) => path.relative(root, file).split(path.sep).join('/'))
    .sort();
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
