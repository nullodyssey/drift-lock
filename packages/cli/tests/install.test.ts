import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { installProject } from '../src/install.js';
import { expectExists, expectMissing, runCli, tempProject, writePackage } from './helpers/cli-test-utils.js';

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
    expect(summary.created).toContain('.drift/contracts.generated.index');
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

    const skill = await readFile(path.join(root, '.agents/skills/drift-dev/SKILL.md'), 'utf8');
    expect(skill).toContain('npm exec drift-lock -- context --task "<user prompt>"');
    expect(skill).toContain('npm exec drift-lock -- check --changed');
  });

  it('runs install dry-run without prompting in non-TTY execution', async () => {
    const root = await tempProject();
    await writePackage(root);

    const result = await runCli(['install', '--root', root, '--dry-run']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('DriftLock install dry run.');
    expect(result.stdout).toContain('npm install -D @drift-lock/cli @drift-lock/eslint-plugin');
    expect(result.stdout).not.toContain('Package manager');
  });

  it('installs the billing example with explicit input guards', async () => {
    const root = await tempProject();
    await writePackage(root);

    await installProject({
      root,
      source: 'src',
      packageManager: 'pnpm',
      example: 'next-billing',
      ci: false,
      installDependencies: false,
    });

    const exampleSchema = await readFile(path.join(root, 'drift-example/billing/billing.schema.ts'), 'utf8');
    const exampleAction = await readFile(path.join(root, 'drift-example/billing/actions.ts'), 'utf8');
    expect(exampleSchema).toContain('export function isCheckoutInput');
    expect(exampleAction).toContain('if (!isCheckoutInput(input))');
    expect(exampleAction).not.toContain('parseCheckoutInput');
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
    await expectExists(path.join(root, '.drift/contracts.generated.index'));
    await expectExists(path.join(root, 'eslint.config.js'));
    await expectExists(path.join(root, '.github/workflows/drift-lock.yml'));
    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(packageJson.scripts['drift-lock:check']).toBe('drift-lock check');
    expect(packageJson.scripts['drift-lock:coverage']).toBe('drift-lock coverage');
    expect(first.updated).toContain('package.json');
    expect(second.skipped).toContain('package.json');
  });

  it('writes a strict GitHub proof workflow with changed checks and generated index check', async () => {
    const root = await tempProject();
    await writePackage(root);

    await installProject({
      root,
      source: 'src',
      packageManager: 'pnpm',
      ci: 'github',
      proofPolicy: 'strict',
      installDependencies: false,
    });

    const workflow = await readFile(path.join(root, '.github/workflows/drift-lock.yml'), 'utf8');
    expect(workflow).toContain('fetch-depth: 0');
    expect(workflow).toContain('DRIFT_GIT_BASE: ${{ github.event.pull_request.base.sha || github.event.before }}');
    expect(workflow).toContain('pnpm exec drift-lock coverage');
    expect(workflow).toContain('pnpm exec drift-lock diff --summary --git-base "$DRIFT_GIT_BASE"');
    expect(workflow).toContain('pnpm exec drift-lock check --changed --git-base "$DRIFT_GIT_BASE"');
    expect(workflow).toContain('pnpm exec drift-lock proof --git-base "$DRIFT_GIT_BASE" --fail-on-unresolved --fail-on-violations --fail-on-dirty-index');
    expect(workflow).toContain('pnpm exec drift-lock extract --check');
  });
});
