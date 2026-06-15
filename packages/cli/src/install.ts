import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  defaultDriftConfig,
  extractContracts,
  readDriftConfig,
  toIndex,
  writeIndexStore,
  type DriftAdoptionMode,
  type DriftConfig,
  type DriftSource,
} from '@drift-lock/core';
import { installSkills, type SkillProvider } from './skills.js';

/* @drift
version: 1
id: cli.install-project
scope: file
stability: locked

intent: >
  Install DriftLock into a target project by creating managed config, scripts,
  dependency instructions, optional ESLint config, CI, skills, and examples.

llm:
  must_not_change:
    - Dry runs must report planned changes without writing project files.
    - Managed files must not overwrite existing files unless force is enabled.
    - Installer-generated configs must use source paths provided by the user or an existing config.
    - Single explicit sources must stay strings; multiple explicit sources must stay arrays.
*/
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export type CiProvider = 'github';
export type ProofPolicy = 'report' | 'strict';

export type InstallProjectOptions = {
  root: string;
  source?: DriftSource;
  requireContracts?: string[];
  adoption?: DriftAdoptionMode;
  packageManager?: PackageManager;
  eslint?: boolean;
  ci?: CiProvider | false;
  agent?: SkillProvider | false;
  example?: string;
  dryRun?: boolean;
  force?: boolean;
  installDependencies?: boolean;
  proofPolicy?: ProofPolicy;
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

const packageNames = ['@drift-lock/cli', '@drift-lock/eslint-plugin'];

export async function installProject(options: InstallProjectOptions): Promise<InstallProjectSummary> {
  const root = path.resolve(options.root);
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);
  await ensurePackageJsonExists(root);
  const packageManager = options.packageManager ?? (await detectPackageManager(root));
  const existingConfig = await readExistingConfig(root);
  const config = resolveInstallConfig(options, existingConfig);
  const summary: InstallProjectSummary = {
    dryRun,
    packageManager,
    created: [],
    updated: [],
    skipped: [],
    commands: [],
    notes: [],
  };

  await maybeWriteManagedFile(root, '.drift/config.json', JSON.stringify(config, null, 2), { dryRun, force, summary });

  if (await shouldWrite(root, config.index, force)) {
    if (dryRun) {
      summary.created.push(config.index);
    } else {
      const extracted = await extractContracts({ root, sourceDir: config.source });
      if (extracted.errors.length > 0) {
        throw new Error(extracted.errors.map((error) => error.message).join('\n'));
      }
      await writeIndexStore(root, config.index, toIndex(extracted.contracts), { sourceDir: config.source });
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
    await writeGithubWorkflow(root, packageManager, options.proofPolicy ?? 'report', { dryRun, force, summary });
  }

  if (options.agent) {
    if (dryRun) {
      summary.commands.push(`drift-lock skills install --provider ${options.agent}`);
    } else {
      const installed = await installSkills({ provider: options.agent, root, driftCommand: driftCommand(packageManager), force });
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

export async function detectPackageManager(root: string): Promise<PackageManager> {
  if (await exists(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if ((await exists(path.join(root, 'bun.lock'))) || (await exists(path.join(root, 'bun.lockb')))) return 'bun';
  if (await exists(path.join(root, 'yarn.lock'))) return 'yarn';
  if (await exists(path.join(root, 'package-lock.json'))) return 'npm';
  return 'npm';
}

async function readExistingConfig(root: string): Promise<DriftConfig | undefined> {
  if (!(await exists(path.join(root, '.drift/config.json')))) return undefined;
  return readDriftConfig(root);
}

function resolveInstallConfig(options: InstallProjectOptions, existingConfig: DriftConfig | undefined): DriftConfig {
  const source = normalizeInstallSource(options.source ?? existingConfig?.source);
  if (!source) {
    throw new Error('DriftLock install requires at least one source directory. Pass --source <dir>; repeat --source for monorepos.');
  }

  return {
    ...defaultDriftConfig,
    index: existingConfig?.index ?? defaultDriftConfig.index,
    source,
    requireContracts: options.requireContracts !== undefined
      ? normalizeRequireContracts(options.requireContracts)
      : existingConfig?.requireContracts ?? defaultDriftConfig.requireContracts,
    adoption: {
      mode: options.adoption ?? existingConfig?.adoption.mode ?? defaultDriftConfig.adoption.mode,
    },
  };
}

function normalizeInstallSource(source: DriftSource | undefined): DriftSource | undefined {
  if (source === undefined) return undefined;
  const values = normalizeSourceList(Array.isArray(source) ? source : [source]);
  return values.length === 1 ? values[0] : values;
}

function normalizeSourceList(values: string[]): string[] {
  const normalized = new Set<string>();
  for (const rawValue of values) {
    const value = normalizePathInput(rawValue);
    if (value) normalized.add(value);
  }
  if (normalized.size === 0) {
    throw new Error('DriftLock install requires at least one non-empty --source value.');
  }
  return [...normalized];
}

function normalizePathInput(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
}

function normalizeRequireContracts(values: string[]): string[] {
  const normalized = new Set(values.map((value) => value.trim()).filter(Boolean));
  if (values.length > 0 && normalized.size === 0) {
    throw new Error('DriftLock install requires non-empty --require values.');
  }
  return [...normalized];
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
    'drift-lock:coverage': 'drift-lock coverage',
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
      context.summary.notes.push('Existing .eslintrc config was not patched. Add @drift-lock/eslint-plugin manually or migrate to ESLint flat config.');
      return;
    }
    await maybeWriteManagedFile(root, 'eslint.config.js', eslintConfigSnippet(), context);
    return;
  }

  const absoluteConfig = path.join(root, config);
  const text = await readFile(absoluteConfig, 'utf8');
  if (text.includes('@drift-lock/eslint-plugin') || text.includes('drift-lock')) {
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

async function writeGithubWorkflow(root: string, packageManager: PackageManager, proofPolicy: ProofPolicy, context: InstallWriteContext): Promise<void> {
  await maybeWriteManagedFile(root, '.github/workflows/drift-lock.yml', githubWorkflow(packageManager, proofPolicy), context);
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
    'drift-example/billing/billing.schema.ts': [
      'export type CheckoutInput = {',
      "  plan: 'pro';",
      '  seats: number;',
      '};',
      '',
      'export function isCheckoutInput(input: unknown): input is CheckoutInput {',
      "  if (typeof input !== 'object' || input === null) return false;",
      '  const candidate = input as Record<string, unknown>;',
      '  return (',
      "    candidate.plan === 'pro' &&",
      "    typeof candidate.seats === 'number' &&",
      '    candidate.seats >= 1',
      '  );',
      '}',
      '',
    ].join('\n'),
    'drift-example/billing/actions.ts': `import { isCheckoutInput } from './billing.schema.js';
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
  if (!isCheckoutInput(input)) {
    throw new Error('Invalid checkout input');
  }

  const payload = input;
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

function driftCommand(packageManager: PackageManager): string {
  if (packageManager === 'npm') return 'npm exec drift-lock --';
  if (packageManager === 'pnpm') return 'pnpm exec drift-lock';
  if (packageManager === 'bun') return 'bunx drift-lock';
  return 'yarn drift-lock';
}

function contextCommandNote(packageManager: PackageManager): string {
  if (packageManager === 'npm') return 'Run context with npm as: npm run drift-lock:context -- <file>';
  return `Run context with ${packageManager} as: ${packageManager} drift-lock:context <file>`;
}

function eslintConfigSnippet(): string {
  return `import driftLock from '@drift-lock/eslint-plugin';

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
  return `import driftLock from '@drift-lock/eslint-plugin';\n${withoutClose}${separator}
  {
    plugins: { 'drift-lock': driftLock },
    rules: {
      ...driftLock.configs.recommended.rules,
    },
  },
];
`;
}

function githubWorkflow(packageManager: PackageManager, proofPolicy: ProofPolicy): string {
  const setup = packageManager === 'pnpm'
    ? `      - uses: pnpm/action-setup@v4
        with:
          version: 10
          run_install: false
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
  const drift = driftCommand(packageManager);
  const proofFlags = proofPolicy === 'strict' ? ' --fail-on-unresolved --fail-on-violations --fail-on-dirty-index' : '';

  return `name: DriftLock

on:
  pull_request:
  push:
    branches: [main]

jobs:
  drift-lock:
    runs-on: ubuntu-latest
    env:
      DRIFT_GIT_BASE: \${{ github.event.pull_request.base.sha || github.event.before }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
${cache}${setup}      - run: ${install}
      - run: ${drift} coverage
      - run: ${drift} diff --summary --git-base "$DRIFT_GIT_BASE"
      - run: ${drift} check --changed --git-base "$DRIFT_GIT_BASE"
      - run: ${drift} proof --git-base "$DRIFT_GIT_BASE"${proofFlags}
      - run: ${drift} extract --check
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
