import { readFile } from 'node:fs/promises';
import path from 'node:path';

/* @drift
version: 1
id: core.source-cache
scope: file
stability: locked

intent: >
  Cache source text reads within a single Drift check run without sharing stale
  file content across commands or coupling rules to TypeScript AST objects.

llm:
  must_not_change:
    - SourceCache instances must remain scoped to one check run.
    - Concurrent reads for the same file must share the same Promise.
    - readText must resolve files from the configured project root.
*/
export type ReadText = (absoluteFile: string) => Promise<string>;

const defaultReadText: ReadText = (absoluteFile) => readFile(absoluteFile, 'utf8');

export class SourceCache {
  private readonly cache = new Map<string, Promise<string>>();
  private readonly root: string;
  private readonly readTextFile: ReadText;

  constructor(root: string, readText: ReadText = defaultReadText) {
    this.root = path.resolve(root);
    this.readTextFile = readText;
  }

  readText(file: string): Promise<string> {
    const absoluteFile = path.resolve(this.root, file);
    const cached = this.cache.get(absoluteFile);
    if (cached) return cached;

    const loaded = this.readTextFile(absoluteFile);
    this.cache.set(absoluteFile, loaded);
    return loaded;
  }
}
