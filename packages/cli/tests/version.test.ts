import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageRoot, runCli } from './helpers/cli-test-utils.js';

describe('drift-lock version', () => {
  it('prints the package version', async () => {
    const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as { version: string };
    const result = await runCli(['--version']);

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(packageJson.version);
  });
});
