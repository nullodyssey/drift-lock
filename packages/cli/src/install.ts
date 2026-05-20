import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  defaultDriftConfig,
  extractContracts,
  toIndex,
  writeIndex,
  type DriftConfig,
} from '@drift-lock/core';
import { installSkills, type SkillProvider } from './skills.js';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export type CiProvider = 'github';

export type InstallProjectOptions = {
  root: string;
  source?: string;
  packageManager?: PackageManager;
  eslint?: boolean;
  ci?: CiProvider | false;
  agent?: SkillProvider | false;
  example?: string;
  dryRun?: boolean;
  force?: boolean;
  installDependencies?: boolean;
};

export type InstallProjectSummary = {
  dryRun: boolean;
  packageManager: PackageManager;
  created: string[];
  updated: string[];
  skipped: string[];
  commands: string[];
  notes: string[];
};

const packageNames = ['drift-lock', 'eslint-plugin-drift-lock'];

export async function installProject(options: InstallProjectOptions): Promise<InstallProjectSummary> {
  const root = path.resolve(options.root);
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);
  const packageManager = options.packageManager ?? (await detectPackageManager(root));
  const source = options.source ?? (await detectSource(root));
  const config: DriftConfig = { ...defaultDriftConfig, source };
  const summary: InstallProjectSummary = {
    dryRun,
    packageManager,
    created: [],
    updated: [],
    skipped: [],
    commands: [],
    notes: [],
  };

  await ensurePackageJsonExists(root);
  await maybeWriteManagedFile(root, '.drift/config.json', JSON.stringify(config, null, 2), { dryRun, force, summary });

  if (await shouldWrite(root, config.index, force)) {
    if (dryRun) {
      summary.created.push(config.index);
    } else {
      const extracted = await extractContracts({ root, sourceDir: source });
      if (extracted.errors.length > 0) {
        throw new Error(extracted.errors.map((error) => error.message).join('\n'));
      }
      await writeIndex(root, config.index, toIndex(extracted.contracts));
      summary.created.push(config.index);
    }
  } else {
    summary.skipped.push(config.index);
  }

  await patchPackageJson(root, packageManager, { dryRun, force, summary });

  const installCommand = packageInstallCommand(packageManager);
  summary.commands.push(installCommand.join(' '));
  if (!dryRun && options.installDependencies !== false) await runCommand(installCommand[0]!, installCommand.slice(1), root);

  if (options.eslint !== false) {
    await configureEslint(root, { dryRun, force, summary });
  }

  if (options.ci === 'github') {
    await writeGithubWorkflow(root, packageManager, { dryRun, force, summary });
  }

  if (options.agent) {
    if (dryRun) {
      summary.commands.push(`drift-lock skills install --provider ${options.agent}`);
    } else {
      const installed = await installSkills({ provider: options.agent, root, driftCommand: 'npx --yes drift-lock', force });
      for (const skill of installed) summary.created.push(path.relative(root, skill.path).split(path.sep).join('/'));
    }
  }

  if (options.example) {
    if (options.example !== 'next-billing') throw new Error(`Unsupported example "${options.example}". Expected next-billing.`);
    await writeNextBillingExample(root, { dryRun, force, summary });
  }

  return summary;
}

async function ensurePackageJsonExists(root: string): Promise<void> {
  if (!(await exists(path.join(root, 'package.json')))) {
    throw new Error('DriftLock install requires a package.json in the project root.');
  }
}

async function detectPackageManager(root: string): Promise<PackageManager> {
  if (await exists(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if ((await exists(path.join(root, 'bun.lock'))) || (await exists(path.join(root, 'bun.lockb')))) return 'bun';
  if (await exists(path.join(root, 'yarn.lock'))) return 'yarn';
  if (await exists(path.join(root, 'package-lock.json'))) return 'npm';
  return 'npm';
}

async function detectSource(root: string): Promise<string> {
  for (const candidate of ['src', 'app', 'pages']) {
    if (await exists(path.join(root, candidate))) return candidate;
  }
  return 'src';
}

async function patchPackageJson(
  root: string,
  packageManager: PackageManager,
  context: InstallWriteContext,
): Promise<void> {
  const file = path.join(root, 'package.json');
  const json = JSON.parse(await readFile(file, 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const scripts = { ...(json.scripts ?? {}) };
  const wantedScripts = {
    'drift-lock:extract': 'drift-lock extract',
    'drift-lock:check': 'drift-lock check',
    'drift-lock:context': 'drift-lock context',
  };

  let changed = false;
  for (const [name, command] of Object.entries(wantedScripts)) {
    if (scripts[name] === command) continue;
    if (scripts[name] && !context.force) {
      context.summary.skipped.push(`package.json scripts.${name}`);
      continue;
    }
    scripts[name] = command;
    changed = true;
  }

  if (!changed) {
    context.summary.skipped.push('package.json');
    return;
  }

  if (!context.dryRun) {
    await writeFile(file, `${JSON.stringify({ ...json, scripts }, null, 2)}\n`, 'utf8');
  }
  context.summary.updated.push('package.json');

  context.summary.notes.push(contextCommandNote(packageManager));
}

async function configureEslint(root: string, context: InstallWriteContext): Promise<void> {
  const config = await findEslintFlatConfig(root);
  if (!config) {
    if (await hasLegacyEslintConfig(root)) {
      context.summary.notes.push('Existing .eslintrc config was not patched. Add eslint-plugin-drift-lock manually or migrate to ESLint flat config.');
      return;
    }
    await maybeWriteManagedFile(root, 'eslint.config.js', eslintConfigSnippet(), context);
    return;
  }

  const absoluteConfig = path.join(root, config);
  const text = await readFile(absoluteConfig, 'utf8');
  if (text.includes('eslint-plugin-drift-lock') || text.includes('drift-lock')) {
    context.summary.skipped.push(config);
    return;
  }

  const patched = patchFlatEslintConfig(text);
  if (!patched) {
    context.summary.notes.push(`Could not safely patch ${config}. Add this snippet manually:\n${eslintConfigSnippet().trim()}`);
    return;
  }

  if (!context.dryRun) await writeFile(absoluteConfig, patched, 'utf8');
  context.summary.updated.push(config);
}

async function writeGithubWorkflow(root: string, packageManager: PackageManager, context: InstallWriteContext): Promise<void> {
  await maybeWriteManagedFile(root, '.github/workflows/drift-lock.yml', githubWorkflow(packageManager), context);
}

async function writeNextBillingExample(root: string, context: InstallWriteContext): Promise<void> {
  const files = {
    'drift-example/billing/pricing.ts': `export const BILLING_PRICES = {
  pro: {
    priceId: 'price_pro',
    monthlyAmount: 2900,
    currency: 'USD',
  },
} as const;
`,
    'drift-example/billing/billing.schema.ts': `export function parseCheckoutInput(input: unknown): { plan: 'pro'; seats: number } {
  if (!input || typeof input !== 'object') throw new Error('Invalid input');
  return { plan: 'pro', seats: 1 };
}
`,
    'drift-example/billing/actions.ts': `import { parseCheckoutInput } from './billing.schema.js';
import { BILLING_PRICES } from './pricing.js';

/* @drift
version: 1
id: billing.create-checkout-session
scope: declaration
stability: locked

intent: >
  Create a checkout session using the declared billing sources of truth.

ssot:
  pricing: "./pricing.ts"

invariants:
  - id: checkout-price-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.priceId

llm:
  must_not_change:
    - pricing source
*/
export async function createCheckoutSession(input: unknown) {
  const payload = parseCheckoutInput(input);
  const price = BILLING_PRICES[payload.plan];
  return { priceId: price.priceId };
}
`,
  };

  for (const [file, content] of Object.entries(files)) {
    await maybeWriteManagedFile(root, file, content, context);
  }
}

type InstallWriteContext = {
  dryRun: boolean;
  force: boolean;
  summary: InstallProjectSummary;
};

async function maybeWriteManagedFile(
  root: string,
  file: string,
  content: string,
  context: InstallWriteContext,
): Promise<void> {
  if (!(await shouldWrite(root, file, context.force))) {
    context.summary.skipped.push(file);
    return;
  }

  if (!context.dryRun) {
    const absoluteFile = path.join(root, file);
    await mkdir(path.dirname(absoluteFile), { recursive: true });
    await writeFile(absoluteFile, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  }
  context.summary.created.push(file);
}

async function shouldWrite(root: string, file: string, force: boolean): Promise<boolean> {
  return force || !(await exists(path.join(root, file)));
}

function packageInstallCommand(packageManager: PackageManager): string[] {
  if (packageManager === 'pnpm') return ['pnpm', 'add', '-D', ...packageNames];
  if (packageManager === 'yarn') return ['yarn', 'add', '-D', ...packageNames];
  if (packageManager === 'bun') return ['bun', 'add', '-d', ...packageNames];
  return ['npm', 'install', '-D', ...packageNames];
}

function contextCommandNote(packageManager: PackageManager): string {
  if (packageManager === 'npm') return 'Run context with npm as: npm run drift-lock:context -- <file>';
  return `Run context with ${packageManager} as: ${packageManager} drift-lock:context <file>`;
}

function eslintConfigSnippet(): string {
  return `import driftLock from 'eslint-plugin-drift-lock';

export default [
  {
    plugins: { 'drift-lock': driftLock },
    rules: {
      ...driftLock.configs.recommended.rules,
    },
  },
];
`;
}

function patchFlatEslintConfig(text: string): string | undefined {
  if (!/export\s+default\s+\[/.test(text)) return undefined;
  const trimmed = text.trimEnd();
  if (!trimmed.endsWith('];')) return undefined;
  const withoutClose = trimmed.slice(0, -2).trimEnd();
  const separator = withoutClose.endsWith('[') ? '' : ',';
  return `import driftLock from 'eslint-plugin-drift-lock';\n${withoutClose}${separator}
  {
    plugins: { 'drift-lock': driftLock },
    rules: {
      ...driftLock.configs.recommended.rules,
    },
  },
];
`;
}

function githubWorkflow(packageManager: PackageManager): string {
  const setup = packageManager === 'pnpm'
    ? `      - uses: pnpm/action-setup@v4
        with:
          version: 10
`
    : '';
  const cache = packageManager === 'bun' ? '' : `          cache: ${packageManager}\n`;
  const install = packageManager === 'pnpm'
    ? 'pnpm install --frozen-lockfile'
    : packageManager === 'npm'
      ? 'npm ci'
      : packageManager === 'yarn'
        ? 'yarn install --immutable'
        : 'bun install --frozen-lockfile';
  const check = packageManager === 'npm' ? 'npm run drift-lock:check' : `${packageManager} drift-lock:check`;
  const lint = packageManager === 'npm' ? 'npx eslint .' : `${packageManager} exec eslint .`;

  return `name: DriftLock

on:
  pull_request:
  push:
    branches: [main]

jobs:
  drift-lock:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
${cache}${setup}      - run: ${install}
      - run: ${check}
      - run: ${lint}
`;
}

async function findEslintFlatConfig(root: string): Promise<string | undefined> {
  for (const file of ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts']) {
    if (await exists(path.join(root, file))) return file;
  }
  return undefined;
}

async function hasLegacyEslintConfig(root: string): Promise<boolean> {
  for (const file of ['.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs']) {
    if (await exists(path.join(root, file))) return true;
  }
  return false;
}

async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}.`));
    });
  });
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
