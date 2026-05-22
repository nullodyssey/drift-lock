import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validUsageSource } from './helpers/contract-fixtures.js';
import { runCli, tempProject, writeDriftConfigFile } from './helpers/cli-test-utils.js';

describe('drift-lock coverage command', () => {
  it('prints coverage summaries and stable JSON', async () => {
    const root = await tempProject();
    await writeFile(path.join(root, 'src/actions.ts'), validUsageSource('billing.actions'), 'utf8');
    await mkdir(path.join(root, 'src/services'), { recursive: true });
    await writeFile(path.join(root, 'src/services/payment.ts'), 'export function pay() { return true; }\n', 'utf8');
    await writeDriftConfigFile(root, ['src/actions.ts', 'src/services/**/*.ts']);

    const summary = await runCli(['coverage', '--root', root]);
    const jsonResult = await runCli(['coverage', '--json', '--root', root]);
    const json = JSON.parse(jsonResult.stdout) as { coverage: Record<string, any> };

    expect(summary.code).toBe(0);
    expect(summary.stdout).toContain('Drift Coverage');
    expect(summary.stdout).toContain('- total: 1');
    expect(summary.stdout).toContain('- required files uncovered: 1');
    expect(summary.stdout).toContain('Required files without contracts:');
    expect(summary.stdout).toContain('- src/services/payment.ts');
    expect(jsonResult.code).toBe(0);
    expect(json.coverage.files.requiredUncoveredFiles).toEqual(['src/services/payment.ts']);
  });

  it('fails check when a required file has no contract', async () => {
    const root = await tempProject();
    await mkdir(path.join(root, 'src/features/billing'), { recursive: true });
    await writeFile(path.join(root, 'src/features/billing/actions.ts'), 'export const checkoutAction = true;\n', 'utf8');
    await writeDriftConfigFile(root, ['src/features/**/actions.ts']);

    const result = await runCli(['check', '--root', root]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('DRIFT015');
    expect(result.stderr).toContain('src/features/billing/actions.ts');
  });

  it('reads multiple source directories from config', async () => {
    const root = await tempProject();
    await mkdir(path.join(root, 'packages/core/src'), { recursive: true });
    await mkdir(path.join(root, 'packages/cli/src'), { recursive: true });
    await writeFile(path.join(root, 'packages/core/src/actions.ts'), validUsageSource('core.actions'), 'utf8');
    await writeFile(path.join(root, 'packages/cli/src/cli.ts'), validUsageSource('cli.actions').replaceAll('billing', 'cli'), 'utf8');
    await writeDriftConfigFile(root, [], ['packages/core/src', 'packages/cli/src']);

    const result = await runCli(['coverage', '--json', '--root', root]);
    const json = JSON.parse(result.stdout) as { coverage: Record<string, any> };

    expect(result.code).toBe(0);
    expect(json.coverage.contracts.total).toBe(2);
    expect(json.coverage.files.source).toBe(2);
  });
});
