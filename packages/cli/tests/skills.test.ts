import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { installProject } from '../src/install.js';
import { installSkills, listBundledSkills } from '../src/skills.js';

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
const cliSource = path.join(packageRoot, 'src/cli.ts');

describe('drift skills installer', () => {
  it('lists bundled Drift skills', async () => {
    await expect(listBundledSkills()).resolves.toEqual([
      'drift-context-manager',
      'drift-impact-analysis',
      'drift-safe-edit',
    ]);
  });

  it('installs OpenAI skills into .agents/skills', async () => {
    const root = await tempProject();

    const installed = await installSkills({ provider: 'openai', root, skills: ['drift-safe-edit'] });

    expect(installed).toHaveLength(1);
    await expectExists(path.join(root, '.agents/skills/drift-safe-edit/SKILL.md'));
    await expectExists(path.join(root, '.agents/skills/drift-safe-edit/agents/openai.yaml'));
    await expectExists(path.join(root, '.agents/skills/drift-safe-edit/references/pre-edit-checklist.md'));

    const skill = await readFile(path.join(root, '.agents/skills/drift-safe-edit/SKILL.md'), 'utf8');
    expect(skill).toContain('npx --yes @drift-lock/cli context --task "<user prompt>"');
    expect(skill).toContain('npx --yes @drift-lock/cli context <file>');
    expect(skill).toContain('npx --yes @drift-lock/cli coverage');
    expect(skill).toContain('npx --yes @drift-lock/cli diff --summary');
    expect(skill).toContain('npx --yes @drift-lock/cli explain <contract-id>');
    expect(skill).not.toContain('{{DRIFT_COMMAND}}');
  });

  it('installs Claude skills without OpenAI metadata', async () => {
    const root = await tempProject();

    await installSkills({
      provider: 'claude',
      root,
      driftCommand: 'pnpm --filter next-v1 exec drift-lock',
      skills: ['drift-context-manager'],
    });

    await expectExists(path.join(root, '.claude/skills/drift-context-manager/SKILL.md'));
    await expectExists(path.join(root, '.claude/skills/drift-context-manager/references/checklist.md'));
    await expectMissing(path.join(root, '.claude/skills/drift-context-manager/agents/openai.yaml'));

    const checklist = await readFile(path.join(root, '.claude/skills/drift-context-manager/references/checklist.md'), 'utf8');
    expect(checklist).toContain('pnpm --filter next-v1 exec drift-lock context --task "<user prompt>"');
    expect(checklist).toContain('pnpm --filter next-v1 exec drift-lock context <file>');
    expect(checklist).toContain('pnpm --filter next-v1 exec drift-lock coverage');
    expect(checklist).toContain('pnpm --filter next-v1 exec drift-lock diff --summary');
    expect(checklist).toContain('pnpm --filter next-v1 exec drift-lock explain <contract-id>');
  });

  it('generates Cursor rules', async () => {
    const root = await tempProject();

    await installSkills({
      provider: 'cursor',
      root,
      driftCommand: 'pnpm --filter next-v1 exec drift-lock',
      skills: ['drift-impact-analysis'],
    });

    const rule = await readFile(path.join(root, '.cursor/rules/drift-impact-analysis.mdc'), 'utf8');
    expect(rule).toContain('alwaysApply: false');
    expect(rule).toContain('Analyze the drift impact');
    expect(rule).toContain('# Drift Impact Analysis');
    expect(rule).toContain('pnpm --filter next-v1 exec drift-lock check');
    expect(rule).toContain('pnpm --filter next-v1 exec drift-lock coverage');
    expect(rule).toContain('pnpm --filter next-v1 exec drift-lock diff --summary');
    expect(rule).toContain('pnpm --filter next-v1 exec drift-lock explain <contract-id>');
    expect(rule).toContain('## Bundled References');
    expect(rule).toContain('### references/output-format.md');
    expect(rule).toContain('### references/risk-matrix.md');
    expect(rule).toContain('CRITICAL -> ask for product/contract confirmation before implementation');
    expect(rule).not.toContain('{{DRIFT_COMMAND}}');
  });

  it('refuses to overwrite without force', async () => {
    const root = await tempProject();
    await installSkills({ provider: 'openai', root, skills: ['drift-safe-edit'] });

    await expect(installSkills({ provider: 'openai', root, skills: ['drift-safe-edit'] })).rejects.toThrow(
      /Use --force/,
    );
  });

  it('overwrites when force is enabled', async () => {
    const root = await tempProject();
    await installSkills({ provider: 'openai', root, skills: ['drift-safe-edit'] });

    await expect(installSkills({ provider: 'openai', root, force: true, skills: ['drift-safe-edit'] })).resolves.toHaveLength(1);
  });
});

describe('drift-lock project installer', () => {
  it('prints a dry-run plan without writing files', async () => {
    const root = await tempProject();
    await writePackage(root);

    const summary = await installProject({
      root,
      source: 'src',
      packageManager: 'pnpm',
      dryRun: true,
      ci: 'github',
    });

    expect(summary.created).toContain('.drift/config.json');
    expect(summary.created).toContain('.drift/contracts.generated.json');
    expect(summary.updated).toContain('package.json');
    expect(summary.created).toContain('eslint.config.js');
    expect(summary.created).toContain('.github/workflows/drift-lock.yml');
    expect(summary.commands).toContain('pnpm add -D @drift-lock/cli @drift-lock/eslint-plugin');
    await expectMissing(path.join(root, '.drift/config.json'));
  });

  it.each([
    ['npm', 'npm install -D @drift-lock/cli @drift-lock/eslint-plugin'],
    ['pnpm', 'pnpm add -D @drift-lock/cli @drift-lock/eslint-plugin'],
    ['bun', 'bun add -d @drift-lock/cli @drift-lock/eslint-plugin'],
    ['yarn', 'yarn add -D @drift-lock/cli @drift-lock/eslint-plugin'],
  ] as const)('plans dependency installation for %s', async (packageManager, command) => {
    const root = await tempProject();
    await writePackage(root);

    const summary = await installProject({
      root,
      packageManager,
      dryRun: true,
      ci: false,
      agent: false,
    });

    expect(summary.commands).toContain(command);
  });

  it('installs agent skills with the detected local DriftLock command', async () => {
    const root = await tempProject();
    await writePackage(root);
    await mkdir(path.join(root, 'src'), { recursive: true });

    await installProject({
      root,
      source: 'src',
      packageManager: 'npm',
      agent: 'openai',
      ci: false,
      installDependencies: false,
    });

    const skill = await readFile(path.join(root, '.agents/skills/drift-safe-edit/SKILL.md'), 'utf8');
    expect(skill).toContain('npm exec drift-lock -- context --task "<user prompt>"');
    expect(skill).toContain('npm exec drift-lock -- check');
  });

  it('runs install dry-run without prompting in non-TTY execution', async () => {
    await buildCore();
    const root = await tempProject();
    await writePackage(root);

    const result = await runCli(['install', '--root', root, '--dry-run']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('DriftLock install dry run.');
    expect(result.stdout).toContain('npm install -D @drift-lock/cli @drift-lock/eslint-plugin');
    expect(result.stdout).not.toContain('Package manager');
  });

  it('installs managed project files idempotently without dependency install when disabled', async () => {
    const root = await tempProject();
    await writePackage(root);
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src/index.ts'), 'export const ok = true;\n', 'utf8');

    const first = await installProject({
      root,
      source: 'src',
      packageManager: 'pnpm',
      ci: 'github',
      installDependencies: false,
    });
    const second = await installProject({
      root,
      source: 'src',
      packageManager: 'pnpm',
      ci: 'github',
      installDependencies: false,
    });

    await expectExists(path.join(root, '.drift/config.json'));
    await expectExists(path.join(root, '.drift/contracts.generated.json'));
    await expectExists(path.join(root, 'eslint.config.js'));
    await expectExists(path.join(root, '.github/workflows/drift-lock.yml'));

    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(packageJson.scripts['drift-lock:check']).toBe('drift-lock check');
    expect(packageJson.scripts['drift-lock:coverage']).toBe('drift-lock coverage');
    expect(first.updated).toContain('package.json');
    expect(second.skipped).toContain('package.json');
  });
});

describe('drift-lock explain command', () => {
  it('prints actionable text explanations', async () => {
    await buildCore();
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
    await buildCore();
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
    await buildCore();
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
    await buildCore();
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
    await buildCore();
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

describe('drift-lock context command', () => {
  it('prints pre-plan task context', async () => {
    await buildCore();
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
    await buildCore();
    const root = await tempProject();
    await writeFile(path.join(root, 'src/actions.ts'), validUsageSource(), 'utf8');

    const result = await runCli(['context', 'src/actions.ts', '--root', root]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Relevant Drift Contracts');
    expect(result.stdout).toContain('billing.create-checkout-session');
  });

  it('requires either a file or a task prompt', async () => {
    await buildCore();
    const root = await tempProject();

    const result = await runCli(['context', '--root', root]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Provide a target file or --task "<prompt>".');
  });

  it('rejects combining a file and a task prompt', async () => {
    await buildCore();
    const root = await tempProject();

    const result = await runCli(['context', 'src/actions.ts', '--task', 'change billing', '--root', root]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Use either a target file or --task, not both.');
  });
});

describe('drift-lock coverage command', () => {
  it('prints coverage summaries and stable JSON', async () => {
    await buildCore();
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
    await buildCore();
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
    await buildCore();
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

describe('drift-lock changed workflow commands', () => {
  it('checks code-only regressions in changed contracts', async () => {
    await buildCore();
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
    await buildCore();
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
    await buildCore();
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
    await buildCore();
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
    await buildCore();
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
    await buildCore();
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
    await buildCore();
    const root = await tempProject();

    const result = await runCli(['check', '--git-base', 'HEAD', '--root', root, '--source', 'src']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Use --git-base together with --changed.');
  });

  it('reports invalid Git bases compactly', async () => {
    await buildCore();
    const root = await tempProject();
    await writeFile(path.join(root, 'src/actions.ts'), validFlowSource('billing.changed'), 'utf8');
    await runCli(['extract', '--root', root, '--source', 'src']);
    await createGitBaseline(root);

    const result = await runCli(['diff', '--summary', '--git-base', 'missing/base', '--root', root, '--source', 'src']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Unable to resolve Git changed files from "missing/base"');
  });

  it('creates acceptance files and supports force', async () => {
    await buildCore();
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
    await buildCore();
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

async function tempProject(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'drift-skills-test-'));
  await mkdir(path.join(root, 'src'), { recursive: true });
  return root;
}

async function writePackage(root: string): Promise<void> {
  await writeFile(
    path.join(root, 'package.json'),
    `${JSON.stringify({ name: 'fixture', version: '0.0.0', type: 'module', scripts: {} }, null, 2)}\n`,
    'utf8',
  );
}

async function writeDriftConfigFile(root: string, requireContracts: string[], source: string | string[] = 'src'): Promise<void> {
  await mkdir(path.join(root, '.drift'), { recursive: true });
  await writeFile(
    path.join(root, '.drift/config.json'),
    `${JSON.stringify({ version: 1, source, index: '.drift/contracts.generated.json', requireContracts }, null, 2)}\n`,
    'utf8',
  );
}

async function expectExists(file: string): Promise<void> {
  await expect(stat(file)).resolves.toBeTruthy();
}

async function expectMissing(file: string): Promise<void> {
  await expect(stat(file)).rejects.toThrow();
}

async function buildCore(): Promise<void> {
  await execFileAsync('pnpm', ['--filter', '@drift-lock/core', 'run', 'build'], { cwd: repoRoot });
}

async function createGitBaseline(root: string): Promise<void> {
  await execFileAsync('git', ['init'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'drift@example.com'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Drift Test'], { cwd: root });
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', 'baseline'], { cwd: root });
}

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFileAsync(process.execPath, ['--import', 'tsx', cliSource, ...args], { cwd: repoRoot });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', code: result.code ?? 1 };
  }
}

function missingSinkSource(id = 'billing.create-checkout-session'): string {
  return validFlowSource(id).replace('amount: price.monthlyAmount,', 'total: price.monthlyAmount,');
}

function hardcodedSinkSource(id = 'billing.create-checkout-session'): string {
  return validFlowSource(id).replace('priceId: price.priceId,', "priceId: 'price_hardcoded',");
}

function validFlowSource(id = 'billing.create-checkout-session'): string {
  return `import { BILLING_PRICES } from '@/features/billing/pricing';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Create a checkout response while proving return values come from pricing.

ssot:
  pricing: "@/features/billing/pricing.ts"

invariants:
  - id: checkout-price-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.priceId
      - return.amount
*/
export function createCheckoutSession(input: { plan: 'pro' }) {
  const price = BILLING_PRICES[input.plan];
  return {
    priceId: price.priceId,
    amount: price.monthlyAmount,
  };
}
`;
}

function validUsageSource(id = 'billing.create-checkout-session'): string {
  return `import { PRO_PRICE_ID } from '@/features/billing/pricing';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Create a Stripe Checkout session for the Pro subscription.

ssot:
  pricing: "@/features/billing/pricing.ts"

invariants:
  - id: uses-pricing-ssot
    enforce: drift/ssot-usage
    ssot: pricing
*/
export function createCheckoutSession() {
  return { price: PRO_PRICE_ID };
}
`;
}

function dualInvariantUsageSource(id = 'billing.create-checkout-session'): string {
  return `import { PRO_PRICE_ID } from '@/features/billing/pricing';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Create a Stripe Checkout session for the Pro subscription.

ssot:
  pricing: "@/features/billing/pricing.ts"
  schema: "@/features/billing/billing.schema.ts"

invariants:
  - id: uses-pricing-ssot
    enforce: drift/ssot-usage
    ssot: pricing
  - id: validates-input
    enforce: drift/ssot-usage
    ssot: schema
*/
export function createCheckoutSession() {
  return { price: PRO_PRICE_ID };
}
`;
}

function reorderInvariantBlocks(source: string): string {
  return source.replace(
    `  - id: uses-pricing-ssot
    enforce: drift/ssot-usage
    ssot: pricing
  - id: validates-input
    enforce: drift/ssot-usage
    ssot: schema`,
    `  - id: validates-input
    enforce: drift/ssot-usage
    ssot: schema
  - id: uses-pricing-ssot
    enforce: drift/ssot-usage
    ssot: pricing`,
  );
}
