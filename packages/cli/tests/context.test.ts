import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validUsageSource } from './helpers/contract-fixtures.js';
import { runCli, tempProject } from './helpers/cli-test-utils.js';

describe('drift-lock context command', () => {
  it('renders the contracts anchored on the requested file', async () => {
    const root = await tempProject();
    await writeFile(path.join(root, 'src/actions.ts'), validUsageSource(), 'utf8');

    const result = await runCli(['context', 'src/actions.ts', '--root', root]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Relevant Drift Contracts');
    expect(result.stdout).toContain('billing.create-checkout-session');
  });

  it('requires a target file', async () => {
    const root = await tempProject();

    const result = await runCli(['context', '--root', root]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("missing required argument 'file'");
  });

  // Task context was removed: predicting the relevant contracts from a prompt is
  // structurally inexact (measured 10% precision / 89% recall, never the exact set),
  // so context is file-scoped only — it is exact by construction.
  it('no longer accepts a task prompt', async () => {
    const root = await tempProject();

    const result = await runCli(['context', '--task', 'add yearly billing pricing plan', '--root', root]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("unknown option '--task'");
  });
});
