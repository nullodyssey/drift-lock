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

  it('fails after printing the report when unresolved policy is enabled', async () => {
    const root = await createProofProject();
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed').replace('Create a checkout response while proving return values come from pricing.', 'Create a checkout response for Team while proving return values come from pricing.'),
      'utf8',
    );
    await runCli(['extract', '--root', root, '--source', 'src']);

    const result = await runCli(['proof', '--git-base', 'HEAD', '--fail-on-unresolved', '--root', root, '--source', 'src']);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('## DriftLock Proof Report');
    expect(result.stdout).toContain('- billing.changed: unresolved');
    expect(result.stderr).toContain('Unresolved DriftLock contract changes: 1');
  });

  it('fails after printing the report when current violations policy is enabled', async () => {
    const root = await createProofProject();
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed').replace('priceId: price.priceId,', "priceId: 'price_hardcoded',"),
      'utf8',
    );

    const result = await runCli(['proof', '--git-base', 'HEAD', '--fail-on-violations', '--root', root, '--source', 'src']);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('Current violations: 1');
    expect(result.stderr).toContain('Current DriftLock violations: 1');
  });

  it('fails after printing the report when intent preservation is below the minimum', async () => {
    const root = await createProofProject();
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed').replace('priceId: price.priceId,', "priceId: 'price_hardcoded',"),
      'utf8',
    );

    const result = await runCli(['proof', '--git-base', 'HEAD', '--min-preservation-rate', '0.5', '--root', root, '--source', 'src']);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('Intent preservation: 0%');
    expect(result.stderr).toContain('Intent preservation rate 0 is below minimum 0.5');
  });

  it('fails after printing the report when generated index policy is enabled', async () => {
    const root = await createProofProject();
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed').replace('amount: price.monthlyAmount,', 'amount: price.monthlyAmount * 2,'),
      'utf8',
    );

    const result = await runCli(['proof', '--git-base', 'HEAD', '--fail-on-dirty-index', '--root', root, '--source', 'src']);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('Generated index: dirty');
    expect(result.stderr).toContain('Generated DriftLock index is dirty: .drift/contracts.generated.index/');
  });

  it('rejects invalid minimum preservation ratios before running the report', async () => {
    const root = await tempProject();

    const result = await runCli(['proof', '--git-base', 'HEAD', '--min-preservation-rate', '1.5', '--root', root, '--source', 'src']);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Unsupported min preservation rate "1.5". Expected a number between 0 and 1.');
  });

  it('checks generated indexes without writing them', async () => {
    const root = await tempProject();
    await writeFile(path.join(root, 'src/actions.ts'), validFlowSource('billing.changed'), 'utf8');
    await runCli(['extract', '--root', root, '--source', 'src']);

    const current = await runCli(['extract', '--check', '--root', root, '--source', 'src']);
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed').replace('amount: price.monthlyAmount,', 'amount: price.monthlyAmount * 2,'),
      'utf8',
    );
    const dirty = await runCli(['extract', '--check', '--root', root, '--source', 'src']);

    expect(current.code).toBe(0);
    expect(current.stdout).toContain('Generated DriftLock index is current at .drift/contracts.generated.index.');
    expect(dirty.code).toBe(1);
    expect(dirty.stdout).toContain('Generated DriftLock index is dirty at .drift/contracts.generated.index:');
    expect(dirty.stdout).toContain('- .drift/contracts.generated.index/manifest.json');
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
