import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { validFlowSource } from './helpers/contract-fixtures.js';
import { createGitBaseline, runCli, tempProject } from './helpers/cli-test-utils.js';

vi.setConfig({ testTimeout: 20_000 });

describe('drift-lock proof command', () => {
  it('prints Markdown proof reports by default and JSON when requested', async () => {
    const root = await createProofProject();
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed').replace('amount: price.monthlyAmount,', 'amount: price.monthlyAmount * 2,'),
      'utf8',
    );

    const markdown = await runCli(['proof', '--git-base', 'HEAD', '--root', root, '--source', 'src']);
    const jsonResult = await runCli(['proof', '--git-base', 'HEAD', '--format', 'json', '--root', root, '--source', 'src']);
    const json = JSON.parse(jsonResult.stdout) as { summary: Record<string, unknown>; outcomes: Array<Record<string, unknown>> };

    expect(markdown.code).toBe(0);
    expect(markdown.stdout).toContain('## DriftLock Proof Report');
    expect(markdown.stdout).toContain('Protected contracts touched: 1');
    expect(markdown.stdout).toContain('- billing.changed: preserved');
    expect(jsonResult.code).toBe(0);
    expect(json.summary.protectedContractsTouched).toBe(1);
    expect(json.outcomes[0]).toMatchObject({ contractId: 'billing.changed', resolution: 'preserved' });
  });

  it('keeps exit code 0 when unresolved drift is present in the report', async () => {
    const root = await createProofProject();
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed').replace('priceId: price.priceId,', "priceId: 'price_hardcoded',"),
      'utf8',
    );

    const result = await runCli(['proof', '--git-base', 'HEAD', '--root', root, '--source', 'src']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Current violations: 1');
    expect(result.stdout).toContain('- billing.changed: unresolved');
    expect(result.stdout).toContain('Unresolved drift remains in final PR state.');
  });

  it('rejects unsupported proof formats before running the report', async () => {
    const root = await tempProject();

    const result = await runCli(['proof', '--git-base', 'HEAD', '--format', 'xml', '--root', root, '--source', 'src']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Unsupported proof format "xml". Use "md" or "json".');
  });

  it('reports invalid Git bases compactly', async () => {
    const root = await createProofProject();

    const result = await runCli(['proof', '--git-base', 'missing/base', '--root', root, '--source', 'src']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Unable to resolve Git changed files from "missing/base"');
  });
});

async function createProofProject(): Promise<string> {
  const root = await tempProject();
  await writeFile(path.join(root, 'src/actions.ts'), validFlowSource('billing.changed'), 'utf8');
  await runCli(['extract', '--root', root, '--source', 'src']);
  await createGitBaseline(root);
  return root;
}
