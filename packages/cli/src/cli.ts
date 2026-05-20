#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import {
  checkContracts,
  defaultIndexPath,
  extractContracts,
  formatErrors,
  renderContext,
  toIndex,
  writeIndex,
} from '@drift/core';
import { installSkills, listBundledSkills, type SkillProvider } from './skills.js';

const program = new Command();

program.name('drift').description('Contract anti LLM-drift CLI').version('0.1.0');

// Extract is intentionally the only command that writes repo state: the index is
// the committed baseline used later to detect locked contract changes in CI.
program
  .command('extract')
  .description('Extract @drift contracts into .drift/contracts.generated.json')
  .option('--root <dir>', 'project root', process.cwd())
  .option('--source <dir>', 'source directory to scan', 'src')
  .option('--out <file>', 'output index path', defaultIndexPath)
  .action(async (options: { root: string; source: string; out: string }) => {
    const root = path.resolve(options.root);
    const result = await extractContracts({ root, sourceDir: options.source });
    if (result.errors.length > 0) fail(result.errors);
    await writeIndex(root, options.out, toIndex(result.contracts));
    console.log(`Extracted ${result.contracts.length} @drift contract(s) to ${options.out}.`);
  });

program
  .command('context')
  .description('Render @drift context for a file')
  .argument('<file>', 'target file')
  .option('--root <dir>', 'project root', process.cwd())
  .action(async (file: string, options: { root: string }) => {
    const result = await renderContext(path.resolve(options.root), file);
    if (result.errors.length > 0) fail(result.errors);
    console.log(result.output);
  });

program
  .command('check')
  .description('Validate @drift contracts and V1 invariants')
  .option('--root <dir>', 'project root', process.cwd())
  .option('--source <dir>', 'source directory to scan', 'src')
  .option('--index <file>', 'index path', defaultIndexPath)
  .action(async (options: { root: string; source: string; index: string }) => {
    const result = await checkContracts({
      root: path.resolve(options.root),
      sourceDir: options.source,
      indexPath: options.index,
    });
    if (result.errors.length > 0) fail(result.errors);
    console.log(`Checked ${result.contracts.length} @drift contract(s).`);
  });

const skills = program.command('skills').description('Manage Drift agent skills');

skills
  .command('list')
  .description('List bundled Drift skills')
  .action(async () => {
    const bundled = await listBundledSkills();
    for (const skill of bundled) console.log(skill);
  });

skills
  .command('install')
  .description('Install bundled Drift skills into the current project')
  .argument('[skills...]', 'skill names to install; defaults to all bundled skills')
  .option('--provider <provider>', 'target provider: openai, claude, or cursor', 'openai')
  .option('--root <dir>', 'project root', process.cwd())
  .option('--drift-command <command>', 'Drift command prefix embedded in installed skills', 'npx --yes drift')
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
