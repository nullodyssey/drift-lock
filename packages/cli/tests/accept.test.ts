import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { expectMissing, runCli, tempProject } from './helpers/cli-test-utils.js';

vi.setConfig({ testTimeout: 20_000 });

describe('drift-lock accept command', () => {
  it('creates acceptance files and supports force', async () => {
    const root = await tempProject();

    const created = await runCli([
      'accept',
      'billing.create-checkout-session',
      '--reason',
      'Product change accepted by billing owner.',
      '--root',
      root,
    ]);
    const rejected = await runCli([
      'accept',
      'billing.create-checkout-session',
      '--reason',
      'Product change accepted by billing owner.',
      '--root',
      root,
    ]);
    const forced = await runCli([
      'accept',
      'billing.create-checkout-session',
      '--reason',
      'Updated product change accepted by owner.',
      '--root',
      root,
      '--force',
    ]);

    const content = await readFile(path.join(root, '.drift/accepted-contract-changes/billing.create-checkout-session.md'), 'utf8');
    expect(created.code).toBe(0);
    expect(created.stdout).toContain('Accepted billing.create-checkout-session');
    expect(rejected.code).toBe(1);
    expect(rejected.stderr).toContain('already exists');
    expect(forced.code).toBe(0);
    expect(content).toContain('reason: Updated product change accepted by owner.');
  });

  it('rejects unsafe acceptance contract ids', async () => {
    const root = await tempProject();

    const rejected = await runCli([
      'accept',
      '../../../tmp/foo',
      '--reason',
      'Product change accepted by billing owner.',
      '--root',
      root,
    ]);

    expect(rejected.code).toBe(1);
    expect(rejected.stderr).toContain('Invalid contract id "../../../tmp/foo"');
    await expectMissing(path.join(root, '.drift/accepted-contract-changes'));
    await expectMissing(path.join(root, 'tmp/foo.md'));
  });
});
