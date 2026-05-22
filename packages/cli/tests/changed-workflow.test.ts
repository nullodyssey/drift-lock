import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  dualInvariantUsageSource,
  reorderInvariantBlocks,
  validFlowSource,
  validUsageSource,
} from './helpers/contract-fixtures.js';
import { createGitBaseline, execFileAsync, runCli, tempProject } from './helpers/cli-test-utils.js';

vi.setConfig({ testTimeout: 20_000 });

describe('drift-lock changed workflow commands', () => {
  it('checks code-only regressions in changed contracts', async () => {
    const root = await tempProject();
    await writeFile(
      path.join(root, 'src/unchanged.ts'),
      validUsageSource('billing.unchanged').replace("import { PRO_PRICE_ID } from '@/features/billing/pricing';\n", ''),
      'utf8',
    );
    await writeFile(path.join(root, 'src/changed.ts'), validFlowSource('billing.changed'), 'utf8');
    await runCli(['extract', '--root', root, '--source', 'src']);
    await writeFile(
      path.join(root, 'src/changed.ts'),
      validFlowSource('billing.changed').replace('priceId: price.priceId,', "priceId: 'price_hardcoded',"),
      'utf8',
    );

    const changed = await runCli(['check', '--changed', '--root', root, '--source', 'src']);
    const full = await runCli(['check', '--root', root, '--source', 'src']);

    expect(changed.code).toBe(1);
    expect(changed.stderr).toContain('DRIFT013');
    expect(changed.stderr).not.toContain('billing.unchanged');
    expect(full.code).toBe(1);
    expect(full.stderr).toContain('DRIFT010');
  });

  it('prints diff summaries and JSON', async () => {
    const root = await tempProject();
    await writeFile(path.join(root, 'src/actions.ts'), validFlowSource('billing.changed'), 'utf8');
    await runCli(['extract', '--root', root, '--source', 'src']);
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed').replace('amount: price.monthlyAmount,', 'amount: price.monthlyAmount * 2,'),
      'utf8',
    );
    await writeFile(path.join(root, 'src/added.ts'), validUsageSource('billing.added'), 'utf8');

    const summary = await runCli(['diff', '--summary', '--root', root, '--source', 'src']);
    const jsonResult = await runCli(['diff', '--summary', '--json', '--root', root, '--source', 'src']);
    const json = JSON.parse(jsonResult.stdout) as { changes: Array<Record<string, unknown>> };

    expect(summary.code).toBe(0);
    expect(summary.stdout).toContain('billing.changed (changed)');
    expect(summary.stdout).toContain('fields: body');
    expect(summary.stdout).toContain('billing.added (added)');
    expect(jsonResult.code).toBe(0);
    expect(json.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'billing.changed', kind: 'changed', fields: ['body'] }),
      expect.objectContaining({ id: 'billing.added', kind: 'added' }),
    ]));
  });

  it('prints rich invariant changes in summaries and JSON', async () => {
    const root = await tempProject();
    await writeFile(path.join(root, 'src/actions.ts'), validFlowSource('billing.changed'), 'utf8');
    await runCli(['extract', '--root', root, '--source', 'src']);
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed').replace(`      - return.priceId
      - return.amount`, `      - return.priceId
      - return.currency`),
      'utf8',
    );

    const summary = await runCli(['diff', '--summary', '--root', root, '--source', 'src']);
    const jsonResult = await runCli(['diff', '--summary', '--json', '--root', root, '--source', 'src']);
    const json = JSON.parse(jsonResult.stdout) as { changes: Array<Record<string, unknown>> };

    expect(summary.code).toBe(0);
    expect(summary.stdout).toContain('  invariants:');
    expect(summary.stdout).toContain('    ~ checkout-price-from-pricing');
    expect(summary.stdout).toContain('      sinks added:');
    expect(summary.stdout).toContain('        + return.currency');
    expect(summary.stdout).toContain('      sinks removed:');
    expect(summary.stdout).toContain('        - return.amount');
    expect(jsonResult.code).toBe(0);
    expect(json.changes[0]).toMatchObject({
      id: 'billing.changed',
      invariantChanges: [
        {
          id: 'checkout-price-from-pricing',
          kind: 'changed',
          fields: ['sinks'],
          sinksAdded: ['return.currency'],
          sinksRemoved: ['return.amount'],
        },
      ],
    });
  });

  it('prints invariant reorder changes in summaries and JSON', async () => {
    const root = await tempProject();
    const baselineSource = dualInvariantUsageSource('billing.changed');
    const reorderedSource = reorderInvariantBlocks(baselineSource);
    expect(reorderedSource).not.toBe(baselineSource);

    await writeFile(path.join(root, 'src/actions.ts'), baselineSource, 'utf8');
    await runCli(['extract', '--root', root, '--source', 'src']);
    await writeFile(path.join(root, 'src/actions.ts'), reorderedSource, 'utf8');

    const summary = await runCli(['diff', '--summary', '--root', root, '--source', 'src']);
    const jsonResult = await runCli(['diff', '--summary', '--json', '--root', root, '--source', 'src']);
    const json = JSON.parse(jsonResult.stdout) as { changes: Array<Record<string, unknown>> };

    expect(summary.code).toBe(0);
    expect(summary.stdout).toContain('    ~ invariant order changed');
    expect(summary.stdout).toContain('      previous: uses-pricing-ssot, validates-input');
    expect(summary.stdout).toContain('      current: validates-input, uses-pricing-ssot');
    expect(jsonResult.code).toBe(0);
    expect(json.changes[0]).toMatchObject({
      invariantChanges: [
        {
          id: '__order__',
          kind: 'reordered',
          previousOrder: ['uses-pricing-ssot', 'validates-input'],
          currentOrder: ['validates-input', 'uses-pricing-ssot'],
        },
      ],
    });
  });

  it('limits changed checks and diffs to a Git base', async () => {
    const root = await tempProject();
    await writeFile(
      path.join(root, 'src/unchanged.ts'),
      validUsageSource('billing.unchanged').replace("import { PRO_PRICE_ID } from '@/features/billing/pricing';\n", ''),
      'utf8',
    );
    await writeFile(path.join(root, 'src/changed.ts'), validFlowSource('billing.changed'), 'utf8');
    await runCli(['extract', '--root', root, '--source', 'src']);
    await createGitBaseline(root);
    await writeFile(
      path.join(root, 'src/changed.ts'),
      validFlowSource('billing.changed').replace('priceId: price.priceId,', "priceId: 'price_hardcoded',"),
      'utf8',
    );

    const changed = await runCli(['check', '--changed', '--git-base', 'HEAD', '--root', root, '--source', 'src']);
    const summary = await runCli(['diff', '--summary', '--git-base', 'HEAD', '--root', root, '--source', 'src']);

    expect(changed.code).toBe(1);
    expect(changed.stderr).toContain('DRIFT013');
    expect(changed.stderr).not.toContain('billing.unchanged');
    expect(summary.code).toBe(0);
    expect(summary.stdout).toContain('billing.changed (changed)');
    expect(summary.stdout).not.toContain('billing.unchanged');
  });

  it('reports duplicate contract ids introduced outside the Git scope', async () => {
    const root = await tempProject();
    await writeFile(path.join(root, 'src/existing.ts'), validUsageSource('billing.duplicate'), 'utf8');
    await runCli(['extract', '--root', root, '--source', 'src']);
    await createGitBaseline(root);
    await writeFile(path.join(root, 'src/new.ts'), validUsageSource('billing.duplicate'), 'utf8');
    await execFileAsync('git', ['add', 'src/new.ts'], { cwd: root });

    const result = await runCli(['check', '--changed', '--git-base', 'HEAD', '--root', root, '--source', 'src']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('DRIFT005');
    expect(result.stderr).toContain('Duplicate @drift contract id "billing.duplicate"');
  });

  it('requires --changed when check uses a Git base', async () => {
    const root = await tempProject();

    const result = await runCli(['check', '--git-base', 'HEAD', '--root', root, '--source', 'src']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Use --git-base together with --changed.');
  });

  it('reports invalid Git bases compactly', async () => {
    const root = await tempProject();
    await writeFile(path.join(root, 'src/actions.ts'), validFlowSource('billing.changed'), 'utf8');
    await runCli(['extract', '--root', root, '--source', 'src']);
    await createGitBaseline(root);

    const result = await runCli(['diff', '--summary', '--git-base', 'missing/base', '--root', root, '--source', 'src']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Unable to resolve Git changed files from "missing/base"');
  });
});
