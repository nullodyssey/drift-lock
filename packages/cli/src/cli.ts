#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import {
  checkContracts,
  diffContracts,
  explainContracts,
  formatContractDiffSummary,
  formatCoverageSummary,
  formatExplanations,
  extractContracts,
  formatErrors,
  getCoverage,
  readDriftConfig,
  renderContext,
  renderTaskContext,
  toIndex,
  writeAcceptanceFile,
  writeIndex,
} from '@drift-lock/core';
import { installProject, type CiProvider, type InstallProjectSummary, type PackageManager } from './install.js';
import { installSkills, listBundledSkills, type SkillProvider } from './skills.js';

const program = new Command();

program.name('drift-lock').description('Contract anti LLM-drift CLI').version('0.1.0');

program
  .command('install')
  .description('Install DriftLock into the current project')
  .option('--root <dir>', 'project root', process.cwd())
  .option('--source <dir>', 'source directory to scan')
  .option('--package-manager <pm>', 'package manager: npm, pnpm, yarn, or bun')
  .option('--eslint', 'configure ESLint if possible', true)
  .option('--no-eslint', 'do not configure ESLint')
  .option('--ci <provider>', 'add CI provider: github')
  .option('--no-ci', 'do not add CI')
  .option('--agent <provider>', 'install agent skills: openai, claude, or cursor')
  .option('--no-agent', 'do not install agent skills')
  .option('--example <name>', 'add an example project')
  .option('--dry-run', 'print changes without writing files or installing packages', false)
  .option('--force', 'overwrite DriftLock managed files and scripts', false)
  .action(async (options: InstallCommandOptions) => {
    const summary = await installProject({
      root: path.resolve(options.root),
      source: options.source,
      packageManager: options.packageManager ? parsePackageManager(options.packageManager) : undefined,
      eslint: options.eslint,
      ci: parseCiOption(options.ci),
      agent: parseAgentOption(options.agent),
      example: options.example,
      dryRun: options.dryRun,
      force: options.force,
    });
    printInstallSummary(summary);
  });

// Extract is intentionally the only command that writes repo state: the index is
// the committed baseline used later to detect locked contract changes in CI.
program
  .command('extract')
  .description('Extract @drift contracts into .drift/contracts.generated.json')
  .option('--root <dir>', 'project root', process.cwd())
  .option('--source <dir>', 'source directory to scan')
  .option('--out <file>', 'output index path')
  .action(async (options: { root: string; source?: string; out?: string }) => {
    const root = path.resolve(options.root);
    const config = await readDriftConfig(root);
    const source = options.source ?? config.source;
    const out = options.out ?? config.index;
    const result = await extractContracts({ root, sourceDir: source });
    if (result.errors.length > 0) fail(result.errors);
    await writeIndex(root, out, toIndex(result.contracts));
    console.log(`Extracted ${result.contracts.length} @drift contract(s) to ${out}.`);
  });

program
  .command('context')
  .description('Render @drift context for a file or task')
  .argument('[file]', 'target file')
  .option('--root <dir>', 'project root', process.cwd())
  .option('--source <dir>', 'source directory to scan')
  .option('--task <prompt>', 'user task prompt to prepare context for')
  .action(async (file: string | undefined, options: { root: string; source?: string; task?: string }) => {
    if (!file && !options.task) {
      throw new Error('Provide a target file or --task "<prompt>".');
    }
    if (file && options.task) {
      throw new Error('Use either a target file or --task, not both.');
    }

    const root = path.resolve(options.root);
    if (options.task) {
      const config = await readDriftConfig(root);
      const result = await renderTaskContext({ root, sourceDir: options.source ?? config.source, task: options.task });
      if (result.errors.length > 0) fail(result.errors);
      console.log(result.output);
      return;
    }

    const targetFile = file;
    if (!targetFile) throw new Error('Provide a target file or --task "<prompt>".');
    const result = await renderContext(root, targetFile);
    if (result.errors.length > 0) fail(result.errors);
    console.log(result.output);
  });

program
  .command('check')
  .description('Validate @drift contracts and V1 invariants')
  .option('--root <dir>', 'project root', process.cwd())
  .option('--source <dir>', 'source directory to scan')
  .option('--index <file>', 'index path')
  .option('--changed', 'only validate contracts changed since the Drift index', false)
  .option('--git-base <ref>', 'limit changed checks to files changed since a Git ref')
  .action(async (options: { root: string; source?: string; index?: string; changed: boolean; gitBase?: string }) => {
    if (options.gitBase && !options.changed) {
      throw new Error('Use --git-base together with --changed.');
    }
    const root = path.resolve(options.root);
    const config = await readDriftConfig(root);
    const result = await checkContracts({
      root,
      sourceDir: options.source ?? config.source,
      indexPath: options.index ?? config.index,
      changedOnly: options.changed,
      gitBase: options.gitBase,
      requireContracts: config.requireContracts,
    });
    if (result.errors.length > 0) fail(result.errors);
    const filters = [options.changed ? 'changed-only filtering' : undefined, options.gitBase ? `Git base ${options.gitBase}` : undefined].filter(Boolean);
    console.log(`Checked ${result.contracts.length} @drift contract(s)${filters.length > 0 ? ` with ${filters.join(' and ')}` : ''}.`);
  });

program
  .command('coverage')
  .description('Report Drift contract coverage and uncovered required files')
  .option('--root <dir>', 'project root', process.cwd())
  .option('--source <dir>', 'source directory to scan')
  .option('--json', 'print machine-readable JSON', false)
  .action(async (options: { root: string; source?: string; json: boolean }) => {
    const root = path.resolve(options.root);
    const config = await readDriftConfig(root);
    const result = await getCoverage({
      root,
      sourceDir: options.source ?? config.source,
      requireContracts: config.requireContracts,
    });
    if (result.errors.length > 0) fail(result.errors);

    if (options.json) {
      console.log(JSON.stringify({ coverage: result.coverage }, null, 2));
      return;
    }

    console.log(formatCoverageSummary(result.coverage));
  });

program
  .command('explain')
  .description('Explain Drift violations with actionable diagnostics')
  .argument('[contractId]', 'contract id to explain')
  .option('--root <dir>', 'project root', process.cwd())
  .option('--source <dir>', 'source directory to scan')
  .option('--index <file>', 'index path')
  .option('--json', 'print machine-readable JSON', false)
  .action(async (contractId: string | undefined, options: { root: string; source?: string; index?: string; json: boolean }) => {
    const root = path.resolve(options.root);
    const config = await readDriftConfig(root);
    const result = await explainContracts({
      root,
      sourceDir: options.source ?? config.source,
      indexPath: options.index ?? config.index,
      contractId,
    });

    if (options.json) {
      console.log(JSON.stringify({ explanations: result.explanations }, null, 2));
    } else {
      console.log(formatExplanations(result.explanations));
    }

    if (result.explanations.length > 0) process.exit(1);
  });

program
  .command('diff')
  .description('Summarize Drift contract changes against the Drift index')
  .option('--root <dir>', 'project root', process.cwd())
  .option('--source <dir>', 'source directory to scan')
  .option('--index <file>', 'index path')
  .option('--summary', 'print a reviewer-oriented summary', true)
  .option('--json', 'print machine-readable JSON', false)
  .option('--git-base <ref>', 'limit the diff to files changed since a Git ref')
  .action(async (options: { root: string; source?: string; index?: string; summary: boolean; json: boolean; gitBase?: string }) => {
    const root = path.resolve(options.root);
    const config = await readDriftConfig(root);
    const result = await diffContracts({
      root,
      sourceDir: options.source ?? config.source,
      indexPath: options.index ?? config.index,
      gitBase: options.gitBase,
    });
    if (result.errors.length > 0) fail(result.errors);

    if (options.json) {
      console.log(JSON.stringify(result.diff, null, 2));
    } else {
      console.log(formatContractDiffSummary(result.diff));
    }
  });

program
  .command('accept')
  .description('Create an acceptance file for an intentional locked contract change')
  .argument('<contractId>', 'contract id to accept')
  .requiredOption('--reason <reason>', 'reason for accepting the contract change, at least 20 characters')
  .option('--root <dir>', 'project root', process.cwd())
  .option('--force', 'overwrite an existing acceptance file', false)
  .action(async (contractId: string, options: { root: string; reason: string; force: boolean }) => {
    const result = await writeAcceptanceFile({
      root: path.resolve(options.root),
      contractId,
      reason: options.reason,
      force: options.force,
    });
    console.log(`Accepted ${contractId} -> ${result.path}`);
  });

const skills = program.command('skills').description('Manage DriftLock agent skills');

skills
  .command('list')
  .description('List bundled DriftLock skills')
  .action(async () => {
    const bundled = await listBundledSkills();
    for (const skill of bundled) console.log(skill);
  });

skills
  .command('install')
  .description('Install bundled DriftLock skills into the current project')
  .argument('[skills...]', 'skill names to install; defaults to all bundled skills')
  .option('--provider <provider>', 'target provider: openai, claude, or cursor', 'openai')
  .option('--root <dir>', 'project root', process.cwd())
  .option('--drift-command <command>', 'DriftLock command prefix embedded in installed skills', 'npx --yes @drift-lock/cli')
  .option('--force', 'overwrite existing installed skills', false)
  .action(async (selected: string[], options: { provider: string; root: string; driftCommand: string; force: boolean }) => {
    const provider = parseProvider(options.provider);
    const installed = await installSkills({
      provider,
      root: path.resolve(options.root),
      driftCommand: options.driftCommand,
      force: options.force,
      skills: selected,
    });
    for (const skill of installed) {
      console.log(`Installed ${skill.name} -> ${skill.path}`);
    }
  });

// Commander already validates command shape. This catch is only for unexpected
// runtime failures so user-facing Drift validation errors stay formatted by fail().
program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

// Keep CLI failures compact and deterministic; tests and CI should rely on the
// stable DRIFTxxx codes, not on stack traces.
function fail(errors: Parameters<typeof formatErrors>[0]): never {
  console.error(formatErrors(errors));
  process.exit(1);
}

function parseProvider(value: string): SkillProvider {
  if (value === 'openai' || value === 'claude' || value === 'cursor') return value;
  throw new Error(`Unsupported skills provider "${value}". Expected openai, claude, or cursor.`);
}

type InstallCommandOptions = {
  root: string;
  source?: string;
  packageManager?: string;
  eslint: boolean;
  ci?: string | false;
  agent?: string | false;
  example?: string;
  dryRun: boolean;
  force: boolean;
};

function parsePackageManager(value: string): PackageManager {
  if (value === 'npm' || value === 'pnpm' || value === 'yarn' || value === 'bun') return value;
  throw new Error(`Unsupported package manager "${value}". Expected npm, pnpm, yarn, or bun.`);
}

function parseCiOption(value: string | false | undefined): CiProvider | false {
  if (value === undefined) return false;
  if (value === false) return false;
  if (value === 'github') return 'github';
  throw new Error(`Unsupported CI provider "${value}". Expected github.`);
}

function parseAgentOption(value: string | false | undefined): SkillProvider | false {
  if (value === undefined) return false;
  if (value === false) return false;
  return parseProvider(value);
}

function printInstallSummary(summary: InstallProjectSummary): void {
  console.log(summary.dryRun ? 'DriftLock install dry run.' : 'DriftLock installed.');
  printList(summary.dryRun ? 'Would create:' : 'Created:', summary.created);
  printList(summary.dryRun ? 'Would update:' : 'Updated:', summary.updated);
  printList('Skipped:', summary.skipped);
  printList(summary.dryRun ? 'Would run:' : 'Ran:', summary.commands);
  if (summary.notes.length > 0) {
    console.log('\nNotes:');
    for (const note of summary.notes) console.log(`- ${note}`);
  }
  console.log('\nNext:');
  console.log(`- ${scriptCommand(summary.packageManager, 'drift-lock:check')}`);
  console.log('- drift-lock context <file>');
}

function printList(title: string, items: string[]): void {
  if (items.length === 0) return;
  console.log(`\n${title}`);
  for (const item of items) console.log(`- ${item}`);
}

function scriptCommand(packageManager: PackageManager, script: string): string {
  if (packageManager === 'npm') return `npm run ${script}`;
  return `${packageManager} ${script}`;
}
