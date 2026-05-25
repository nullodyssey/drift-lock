import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { SourceCache } from '../src/core/source-cache.js';

describe('drift source cache', () => {
  it('reads the same file only once', async () => {
    const reads: string[] = [];
    const cache = new SourceCache('/repo', async (absoluteFile) => {
      reads.push(absoluteFile);
      return 'source text';
    });

    await expect(cache.readText('src/actions.ts')).resolves.toBe('source text');
    await expect(cache.readText('src/actions.ts')).resolves.toBe('source text');

    expect(reads).toEqual([path.resolve('/repo', 'src/actions.ts')]);
  });

  it('shares the same promise for concurrent reads', async () => {
    let reads = 0;
    let resolveText!: (text: string) => void;
    const pending = new Promise<string>((resolve) => {
      resolveText = resolve;
    });
    const cache = new SourceCache('/repo', () => {
      reads += 1;
      return pending;
    });

    const first = cache.readText('src/actions.ts');
    const second = cache.readText('src/actions.ts');
    resolveText('source text');

    expect(second).toBe(first);
    await expect(first).resolves.toBe('source text');
    expect(reads).toBe(1);
  });

  it('resolves files from the configured root', async () => {
    const root = path.resolve('/workspace/project');
    const seen: string[] = [];
    const cache = new SourceCache(root, async (absoluteFile) => {
      seen.push(absoluteFile);
      return 'source text';
    });

    await cache.readText('src/actions.ts');

    expect(seen).toEqual([path.resolve(root, 'src/actions.ts')]);
  });

  it('propagates read errors', async () => {
    const error = new Error('missing file');
    const cache = new SourceCache('/repo', async () => {
      throw error;
    });

    await expect(cache.readText('src/missing.ts')).rejects.toBe(error);
  });

  it('parses the same file only once', async () => {
    let reads = 0;
    let parses = 0;
    const cache = new SourceCache(
      '/repo',
      async () => {
        reads += 1;
        return 'export const value = 1;';
      },
      (file, text) => {
        parses += 1;
        return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      },
    );

    const first = await cache.readParsed('src/actions.ts');
    const second = await cache.readParsed('src/actions.ts');

    expect(second).toBe(first);
    expect(first).toMatchObject({ file: 'src/actions.ts', text: 'export const value = 1;' });
    expect(first.sourceFile.fileName).toBe('src/actions.ts');
    expect(reads).toBe(1);
    expect(parses).toBe(1);
  });

  it('shares the same promise for concurrent parsed reads', async () => {
    let parses = 0;
    let resolveText!: (text: string) => void;
    const pending = new Promise<string>((resolve) => {
      resolveText = resolve;
    });
    const cache = new SourceCache(
      '/repo',
      () => pending,
      (file, text) => {
        parses += 1;
        return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      },
    );

    const first = cache.readParsed('src/actions.ts');
    const second = cache.readParsed('src/actions.ts');
    resolveText('export const value = 1;');

    expect(second).toBe(first);
    await expect(first).resolves.toMatchObject({ file: 'src/actions.ts' });
    expect(parses).toBe(1);
  });

  it('shares text reads between readText and readParsed', async () => {
    let reads = 0;
    const cache = new SourceCache('/repo', async () => {
      reads += 1;
      return 'export const value = 1;';
    });

    await expect(cache.readText('src/actions.ts')).resolves.toBe('export const value = 1;');
    await expect(cache.readParsed('src/actions.ts')).resolves.toMatchObject({
      file: 'src/actions.ts',
      text: 'export const value = 1;',
    });

    expect(reads).toBe(1);
  });

  it('parses tsx files with jsx syntax support', async () => {
    const cache = new SourceCache('/repo', async () => 'export const View = () => <div />;');
    const parsed = await cache.readParsed('src/view.tsx');

    expect(containsKind(parsed.sourceFile, ts.SyntaxKind.JsxSelfClosingElement)).toBe(true);
  });
});

function containsKind(node: ts.Node, kind: ts.SyntaxKind): boolean {
  if (node.kind === kind) return true;
  return ts.forEachChild(node, (child) => (containsKind(child, kind) ? true : undefined)) === true;
}
