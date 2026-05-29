import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundledSkillCatalog, formatSkillCatalog, installSkills, listBundledSkills } from '../src/skills.js';
import { expectExists, expectMissing, runCli, tempProject } from './helpers/cli-test-utils.js';

describe('drift skills installer', () => {
  it('lists bundled Drift skills', async () => {
    await expect(listBundledSkills()).resolves.toEqual([
      'drift-analyst',
      'drift-architect',
      'drift-cm',
      'drift-dev',
      'drift-tech-writer',
      'drift-ux-designer',
    ]);
  });

  it('exposes a detailed role catalog', async () => {
    const catalogNames = bundledSkillCatalog.map((entry) => entry.name);

    expect(catalogNames).toEqual([
      'drift-cm',
      'drift-dev',
      'drift-analyst',
      'drift-tech-writer',
      'drift-ux-designer',
      'drift-architect',
    ]);
    await expect(listBundledSkills()).resolves.toEqual([...catalogNames].sort());

    const catalog = formatSkillCatalog();
    expect(catalog).toContain('CODE  SKILL');
    expect(catalog).toContain('CTX   drift-cm');
    expect(catalog).toContain('DEV   drift-dev');
    expect(catalog).toContain('IMP   drift-analyst');
    expect(catalog).toContain('DOC   drift-tech-writer');
    expect(catalog).toContain('UX    drift-ux-designer');
    expect(catalog).toContain('ARC   drift-architect');
    expect(catalog).toContain('Protect system boundaries');
  });

  it('prints simple and detailed skill lists from the CLI', async () => {
    const simple = await runCli(['skills', 'list']);
    const detailed = await runCli(['skills', 'list', '--details']);

    expect(simple.code).toBe(0);
    expect(simple.stdout.trim().split('\n')).toEqual([
      'drift-analyst',
      'drift-architect',
      'drift-cm',
      'drift-dev',
      'drift-tech-writer',
      'drift-ux-designer',
    ]);
    expect(simple.stdout).not.toContain('CODE');

    expect(detailed.code).toBe(0);
    expect(detailed.stdout).toContain('CODE  SKILL');
    expect(detailed.stdout).toContain('CTX   drift-cm');
    expect(detailed.stdout).toContain('Prepare task context');
    expect(detailed.stdout).toContain('ARC   drift-architect');
    expect(detailed.stdout).toContain('Protect system boundaries');
  });

  it('installs OpenAI skills into .agents/skills', async () => {
    const root = await tempProject();

    const installed = await installSkills({ provider: 'openai', root, skills: ['drift-dev'] });

    expect(installed).toHaveLength(1);
    await expectExists(path.join(root, '.agents/skills/drift-dev/SKILL.md'));
    await expectExists(path.join(root, '.agents/skills/drift-dev/agents/openai.yaml'));
    await expectExists(path.join(root, '.agents/skills/drift-dev/references/pre-edit-checklist.md'));

    const skill = await readFile(path.join(root, '.agents/skills/drift-dev/SKILL.md'), 'utf8');
    expect(skill).toContain('npx --yes @drift-lock/cli context --task "<user prompt>"');
    expect(skill).toContain('npx --yes @drift-lock/cli context <file>');
    expect(skill).toContain('npx --yes @drift-lock/cli coverage');
    expect(skill).toContain('npx --yes @drift-lock/cli diff --summary');
    expect(skill).toContain('npx --yes @drift-lock/cli check --changed');
    expect(skill).toContain('npx --yes @drift-lock/cli explain <contract-id>');
    expect(skill).toContain('npx --yes @drift-lock/cli proof --git-base <ref>');
    expect(skill).not.toContain('{{DRIFT_COMMAND}}');
  });

  it('installs all OpenAI role skills', async () => {
    const root = await tempProject();

    const installed = await installSkills({ provider: 'openai', root });

    expect(installed.map((skill) => skill.name)).toEqual([
      'drift-analyst',
      'drift-architect',
      'drift-cm',
      'drift-dev',
      'drift-tech-writer',
      'drift-ux-designer',
    ]);
    await expectExists(path.join(root, '.agents/skills/drift-architect/SKILL.md'));
    await expectExists(path.join(root, '.agents/skills/drift-tech-writer/agents/openai.yaml'));
    await expectExists(path.join(root, '.agents/skills/drift-ux-designer/references/output-format.md'));

    const skill = await readFile(path.join(root, '.agents/skills/drift-architect/SKILL.md'), 'utf8');
    expect(skill).toContain('npx --yes @drift-lock/cli context --task "<user prompt>"');
    expect(skill).not.toContain('{{DRIFT_COMMAND}}');
  });

  it('installs Claude skills without OpenAI metadata', async () => {
    const root = await tempProject();

    await installSkills({
      provider: 'claude',
      root,
      driftCommand: 'pnpm --filter next-v1 exec drift-lock',
      skills: ['drift-tech-writer'],
    });

    await expectExists(path.join(root, '.claude/skills/drift-tech-writer/SKILL.md'));
    await expectExists(path.join(root, '.claude/skills/drift-tech-writer/references/checklist.md'));
    await expectMissing(path.join(root, '.claude/skills/drift-tech-writer/agents/openai.yaml'));

    const checklist = await readFile(path.join(root, '.claude/skills/drift-tech-writer/references/checklist.md'), 'utf8');
    expect(checklist).toContain('pnpm --filter next-v1 exec drift-lock context --task "<user prompt>"');
    expect(checklist).toContain('pnpm --filter next-v1 exec drift-lock context <file>');
    expect(checklist).toContain('pnpm --filter next-v1 exec drift-lock coverage');
    expect(checklist).toContain('pnpm --filter next-v1 exec drift-lock diff --summary');
    expect(checklist).toContain('pnpm --filter next-v1 exec drift-lock explain <contract-id>');
    expect(checklist).toContain('pnpm --filter next-v1 exec drift-lock proof --git-base <ref>');
  });

  it('generates Cursor rules', async () => {
    const root = await tempProject();

    await installSkills({
      provider: 'cursor',
      root,
      driftCommand: 'pnpm --filter next-v1 exec drift-lock',
      skills: ['drift-architect'],
    });

    const rule = await readFile(path.join(root, '.cursor/rules/drift-architect.mdc'), 'utf8');
    expect(rule).toContain('alwaysApply: false');
    expect(rule).toContain('Protect system boundaries');
    expect(rule).toContain('# Drift Architect');
    expect(rule).toContain('pnpm --filter next-v1 exec drift-lock check');
    expect(rule).toContain('pnpm --filter next-v1 exec drift-lock coverage');
    expect(rule).toContain('pnpm --filter next-v1 exec drift-lock diff --summary');
    expect(rule).toContain('pnpm --filter next-v1 exec drift-lock explain <contract-id>');
    expect(rule).toContain('pnpm --filter next-v1 exec drift-lock proof --git-base <ref>');
    expect(rule).toContain('## Bundled References');
    expect(rule).toContain('### references/output-format.md');
    expect(rule).toContain('### references/checklist.md');
    expect(rule).toContain('Current boundaries:');
    expect(rule).not.toContain('{{DRIFT_COMMAND}}');
  });

  it('refuses to overwrite without force', async () => {
    const root = await tempProject();
    await installSkills({ provider: 'openai', root, skills: ['drift-dev'] });

    await expect(installSkills({ provider: 'openai', root, skills: ['drift-dev'] })).rejects.toThrow(
      /Use --force/,
    );
  });

  it('overwrites when force is enabled', async () => {
    const root = await tempProject();
    await installSkills({ provider: 'openai', root, skills: ['drift-dev'] });

    await expect(installSkills({ provider: 'openai', root, force: true, skills: ['drift-dev'] })).resolves.toHaveLength(1);
  });
});
