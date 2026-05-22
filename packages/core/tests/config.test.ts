import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDriftConfig, writeDriftConfig } from '@drift-lock/core';
import { createProject } from './helpers/core-test-utils.js';

describe('drift config', () => {
  it('reads DriftLock config with defaults and explicit values', async () => {
    const root = await createProject({});

    await expect(readDriftConfig(root)).resolves.toEqual({
      version: 1,
      source: 'src',
      index: '.drift/contracts.generated.json',
      requireContracts: [],
      adoption: { mode: 'enforce' },
    });

    await writeDriftConfig(root, {
      version: 1,
      source: 'src',
      index: '.drift/contracts.generated.json',
      requireContracts: [],
    });

    await expect(readDriftConfig(root)).resolves.toEqual({
      version: 1,
      source: 'src',
      index: '.drift/contracts.generated.json',
      requireContracts: [],
      adoption: { mode: 'enforce' },
    });

    await writeDriftConfig(root, {
      version: 1,
      source: 'app',
      index: '.drift/custom.generated.json',
      requireContracts: ['app/**/*.ts'],
      adoption: { mode: 'warn' },
    });

    await expect(readDriftConfig(root)).resolves.toEqual({
      version: 1,
      source: 'app',
      index: '.drift/custom.generated.json',
      requireContracts: ['app/**/*.ts'],
      adoption: { mode: 'warn' },
    });

    await writeDriftConfig(root, {
      version: 1,
      source: ['packages/core/src', 'packages/cli/src'],
      index: '.drift/contracts.generated.json',
      requireContracts: ['packages/core/src/**/*.ts'],
      adoption: { mode: 'audit' },
    });

    await expect(readDriftConfig(root)).resolves.toEqual({
      version: 1,
      source: ['packages/core/src', 'packages/cli/src'],
      index: '.drift/contracts.generated.json',
      requireContracts: ['packages/core/src/**/*.ts'],
      adoption: { mode: 'audit' },
    });
  });

  it('rejects invalid config values', async () => {
    const root = await createProject({});
    await mkdir(path.join(root, '.drift'), { recursive: true });
    await writeFile(
      path.join(root, '.drift/config.json'),
      JSON.stringify({ version: 1, source: 'src', index: '.drift/contracts.generated.json', requireContracts: ['src/**/*.ts', ''] }),
      'utf8',
    );

    await expect(readDriftConfig(root)).rejects.toThrow(/Invalid DriftLock config/);

    await writeFile(
      path.join(root, '.drift/config.json'),
      JSON.stringify({ version: 1, source: [], index: '.drift/contracts.generated.json', requireContracts: [] }),
      'utf8',
    );

    await expect(readDriftConfig(root)).rejects.toThrow(/Invalid DriftLock config/);

    await writeFile(
      path.join(root, '.drift/config.json'),
      JSON.stringify({ version: 1, source: 'src', index: '.drift/contracts.generated.json', requireContracts: [], adoption: { mode: 'relaxed' } }),
      'utf8',
    );

    await expect(readDriftConfig(root)).rejects.toThrow(/Invalid DriftLock config/);
  });
});
