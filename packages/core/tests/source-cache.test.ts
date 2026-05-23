import path from 'node:path';
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
});
