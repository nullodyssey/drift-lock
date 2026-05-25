import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

/* @drift
version: 1
id: core.source-cache
scope: file
stability: locked

intent: >
  Cache source text reads and parsed TypeScript source files within a single
  Drift check run without sharing stale file content across commands.

llm:
  must_not_change:
    - SourceCache instances must remain scoped to one check run.
    - Concurrent reads for the same file must share the same Promise.
    - readText must resolve files from the configured project root.
    - readParsed must reuse the cached source text and parsed SourceFile per file.
*/
export type ReadText = (absoluteFile: string) => Promise<string>;
export type ParseSource = (file: string, text: string) => ts.SourceFile;

export type ParsedSource = {
  file: string;
  text: string;
  sourceFile: ts.SourceFile;
};

export type SourceInput = string | ParsedSource;

const defaultReadText: ReadText = (absoluteFile) => readFile(absoluteFile, 'utf8');
const defaultParseSource: ParseSource = parseSourceText;

export class SourceCache {
  private readonly textCache = new Map<string, Promise<string>>();
  private readonly parsedCache = new Map<string, Promise<ParsedSource>>();
  private readonly root: string;
  private readonly readTextFile: ReadText;
  private readonly parseSource: ParseSource;

  constructor(root: string, readText: ReadText = defaultReadText, parseSource: ParseSource = defaultParseSource) {
    this.root = path.resolve(root);
    this.readTextFile = readText;
    this.parseSource = parseSource;
  }

  readText(file: string): Promise<string> {
    const absoluteFile = path.resolve(this.root, file);
    const cached = this.textCache.get(absoluteFile);
    if (cached) return cached;

    const loaded = this.readTextFile(absoluteFile);
    this.textCache.set(absoluteFile, loaded);
    return loaded;
  }

  readParsed(file: string): Promise<ParsedSource> {
    const absoluteFile = path.resolve(this.root, file);
    const cached = this.parsedCache.get(absoluteFile);
    if (cached) return cached;

    const loaded = this.readText(file).then((text) => ({
      file,
      text,
      sourceFile: this.parseSource(file, text),
    }));
    this.parsedCache.set(absoluteFile, loaded);
    return loaded;
  }
}

export function parseSourceInput(file: string, source: SourceInput): ParsedSource {
  if (typeof source !== 'string') return source;
  return {
    file,
    text: source,
    sourceFile: parseSourceText(file, source),
  };
}

export function parseSourceText(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
}

function scriptKind(file: string): ts.ScriptKind {
  return file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}
