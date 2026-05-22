import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validFlowSource, validUsageSource } from './helpers/contract-fixtures.js';
import { runCli, tempProject } from './helpers/cli-test-utils.js';

describe('drift-lock context command', () => {
  it('prints pre-plan task context', async () => {
    const root = await tempProject();
    await writeFile(path.join(root, 'src/actions.ts'), validFlowSource('billing.create-checkout-session'), 'utf8');

    const result = await runCli(['context', '--task', 'add yearly billing pricing plan', '--root', root, '--source', 'src']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Drift Context For Task');
    expect(result.stdout).toContain('Task:\nadd yearly billing pricing plan');
    expect(result.stdout).toContain('- billing.create-checkout-session');
    expect(result.stdout).toContain('checkout-price-from-pricing: drift/ssot-flow ssot=pricing sinks=return.priceId, return.amount');
    expect(result.stdout).toContain('Planning Notes:');
  });

  it('keeps file context compatible', async () => {
    const root = await tempProject();
    await writeFile(path.join(root, 'src/actions.ts'), validUsageSource(), 'utf8');

    const result = await runCli(['context', 'src/actions.ts', '--root', root]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Relevant Drift Contracts');
    expect(result.stdout).toContain('billing.create-checkout-session');
  });

  it('requires either a file or a task prompt', async () => {
    const root = await tempProject();

    const result = await runCli(['context', '--root', root]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Provide a target file or --task "<prompt>".');
  });

  it('rejects combining a file and a task prompt', async () => {
    const root = await tempProject();

    const result = await runCli(['context', 'src/actions.ts', '--task', 'change billing', '--root', root]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Use either a target file or --task, not both.');
  });
});
