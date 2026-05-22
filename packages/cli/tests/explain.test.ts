import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hardcodedSinkSource, missingSinkSource, validFlowSource } from './helpers/contract-fixtures.js';
import { runCli, tempProject, writeDriftConfigFile } from './helpers/cli-test-utils.js';

describe('drift-lock explain command', () => {
  it('prints actionable text explanations', async () => {
    const root = await tempProject();
    await writeFile(path.join(root, 'src/actions.ts'), missingSinkSource(), 'utf8');

    const result = await runCli(['explain', '--root', root, '--source', 'src']);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('Drift violation:');
    expect(result.stdout).toContain('DRIFT013_SSOT_FLOW_NOT_PROVEN billing.create-checkout-session');
    expect(result.stdout).toContain('Sink: return.amount');
    expect(result.stdout).toContain('Reason: missing-sink');
    expect(result.stdout).toContain('Suggested fix:');
  });

  it('prints stable JSON explanations', async () => {
    const root = await tempProject();
    await writeFile(path.join(root, 'src/actions.ts'), missingSinkSource(), 'utf8');

    const result = await runCli(['explain', '--root', root, '--source', 'src', '--json']);
    const json = JSON.parse(result.stdout) as { explanations: Array<Record<string, unknown>> };

    expect(result.code).toBe(1);
    expect(json.explanations).toHaveLength(1);
    expect(json.explanations[0]).toMatchObject({
      code: 'DRIFT013_SSOT_FLOW_NOT_PROVEN',
      contractId: 'billing.create-checkout-session',
      sink: 'return.amount',
      reason: 'missing-sink',
    });
  });

  it('prints found source expressions in text and JSON explanations', async () => {
    const root = await tempProject();
    await writeFile(path.join(root, 'src/actions.ts'), hardcodedSinkSource(), 'utf8');

    const text = await runCli(['explain', '--root', root, '--source', 'src']);
    const jsonResult = await runCli(['explain', '--root', root, '--source', 'src', '--json']);
    const json = JSON.parse(jsonResult.stdout) as { explanations: Array<Record<string, unknown>> };

    expect(text.code).toBe(1);
    expect(text.stdout).toContain("Found:\nreturn.priceId = 'price_hardcoded'");
    expect(jsonResult.code).toBe(1);
    expect(json.explanations[0]).toMatchObject({
      code: 'DRIFT013_SSOT_FLOW_NOT_PROVEN',
      sink: 'return.priceId',
      reason: 'untrusted-value',
      foundExpression: "'price_hardcoded'",
      foundNodeKind: 'StringLiteral',
      found: "return.priceId = 'price_hardcoded'",
    });
  });

  it('filters explanations by contract id and exits zero when clean', async () => {
    const root = await tempProject();
    await writeFile(path.join(root, 'src/actions.ts'), missingSinkSource('billing.create-checkout-session'), 'utf8');
    await writeFile(path.join(root, 'src/other.ts'), validFlowSource('billing.other-checkout-session'), 'utf8');

    const clean = await runCli(['explain', 'billing.other-checkout-session', '--root', root, '--source', 'src']);
    const failing = await runCli(['explain', 'billing.create-checkout-session', '--root', root, '--source', 'src']);

    expect(clean.code).toBe(0);
    expect(clean.stdout.trim()).toBe('No Drift violations found.');
    expect(failing.code).toBe(1);
    expect(failing.stdout).toContain('billing.create-checkout-session');
    expect(failing.stdout).not.toContain('billing.other-checkout-session');
  });

  it('explains required-contract failures from config', async () => {
    const root = await tempProject();
    await mkdir(path.join(root, 'src/features/billing'), { recursive: true });
    await writeFile(path.join(root, 'src/features/billing/actions.ts'), 'export const checkoutAction = true;\n', 'utf8');
    await writeDriftConfigFile(root, ['src/features/**/actions.ts']);

    const result = await runCli(['explain', '--root', root]);
    const jsonResult = await runCli(['explain', '--json', '--root', root]);
    const json = JSON.parse(jsonResult.stdout) as { explanations: Array<Record<string, unknown>> };

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('DRIFT015_REQUIRED_CONTRACT_MISSING');
    expect(result.stdout).toContain('src/features/billing/actions.ts');
    expect(jsonResult.code).toBe(1);
    expect(json.explanations[0]).toMatchObject({
      code: 'DRIFT015_REQUIRED_CONTRACT_MISSING',
      file: 'src/features/billing/actions.ts',
      found: 'No valid @drift contract was extracted for this file.',
    });
  });
});
