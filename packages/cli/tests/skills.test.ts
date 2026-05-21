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
    expect(skill).toContain('npx --yes @drift-lock/cli context <file>');
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
    expect(checklist).toContain('pnpm --filter next-v1 exec drift-lock context <file>');
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

async function expectExists(file: string): Promise<void> {
  await expect(stat(file)).resolves.toBeTruthy();
}

async function expectMissing(file: string): Promise<void> {
  await expect(stat(file)).rejects.toThrow();
}

async function buildCore(): Promise<void> {
  await execFileAsync('pnpm', ['--filter', '@drift-lock/core', 'run', 'build'], { cwd: repoRoot });
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
