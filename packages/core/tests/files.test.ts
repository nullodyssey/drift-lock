import { describe, expect, it } from 'vitest';
import { discoverSourceFiles } from '@drift-lock/core';
import { createProject } from './helpers/core-test-utils.js';

describe('drift source file discovery', () => {
  it('discovers source files from multiple source directories', async () => {
    const root = await createProject({
      'packages/core/src/index.ts': 'export const core = true;\n',
      'packages/core/tests/core.test.ts': 'export const test = true;\n',
      'packages/cli/src/cli.ts': 'export const cli = true;\n',
    });

    await expect(discoverSourceFiles(root, ['packages/core/src', 'packages/cli/src', 'packages/core/src'])).resolves.toEqual([
      'packages/cli/src/cli.ts',
      'packages/core/src/index.ts',
    ]);
  });

  it('uses .gitignore patterns when no .driftignore exists', async () => {
    const root = await createProject({
      '.gitignore': 'src/generated/**\n',
      'src/index.ts': 'export const index = true;\n',
      'src/generated/client.ts': 'export const generated = true;\n',
      'src/generated/readme.md': '# generated\n',
    });

    await expect(discoverSourceFiles(root)).resolves.toEqual(['src/index.ts']);
  });

  it('uses .driftignore instead of .gitignore when both exist', async () => {
    const root = await createProject({
      '.gitignore': 'src/ignored-by-git.ts\n',
      '.driftignore': 'src/ignored-by-drift.ts\n',
      'src/ignored-by-git.ts': 'export const git = true;\n',
      'src/ignored-by-drift.ts': 'export const drift = true;\n',
      'src/kept.ts': 'export const kept = true;\n',
    });

    await expect(discoverSourceFiles(root)).resolves.toEqual(['src/ignored-by-git.ts', 'src/kept.ts']);
  });

  it('always ignores internal build and state directories', async () => {
    const root = await createProject({
      'visible.ts': 'export const visible = true;\n',
      'dist/index.ts': 'export const dist = true;\n',
      'node_modules/pkg/index.ts': 'export const dependency = true;\n',
      '.drift/index.ts': 'export const drift = true;\n',
      '.git/hooks/pre-commit.ts': 'export const git = true;\n',
      '.next/server/app.ts': 'export const next = true;\n',
    });

    await expect(discoverSourceFiles(root, '.')).resolves.toEqual(['visible.ts']);
  });

  it('applies ignore files across multiple source directories', async () => {
    const root = await createProject({
      '.gitignore': 'packages/cli/src/generated/**\n',
      'packages/core/src/generated/client.ts': 'export const coreGenerated = true;\n',
      'packages/core/src/index.ts': 'export const core = true;\n',
      'packages/cli/src/generated/client.ts': 'export const cliGenerated = true;\n',
      'packages/cli/src/index.ts': 'export const cli = true;\n',
    });

    await expect(discoverSourceFiles(root, ['packages/core/src', 'packages/cli/src'])).resolves.toEqual([
      'packages/cli/src/index.ts',
      'packages/core/src/generated/client.ts',
      'packages/core/src/index.ts',
    ]);
  });
});
