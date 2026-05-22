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
});
