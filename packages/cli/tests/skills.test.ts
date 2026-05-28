import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { installSkills, listBundledSkills } from '../src/skills.js';
import { expectExists, expectMissing, tempProject } from './helpers/cli-test-utils.js';

describe('drift skills installer', () => {
  it('lists bundled Drift skills', async () => {
    await expect(listBundledSkills()).resolves.toEqual([
      'drift-analyst',
      'drift-cm',
      'drift-dev',
    ]);
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

  it('installs Claude skills without OpenAI metadata', async () => {
    const root = await tempProject();

    await installSkills({
      provider: 'claude',
      root,
      driftCommand: 'pnpm --filter next-v1 exec drift-lock',
      skills: ['drift-cm'],
    });

    await expectExists(path.join(root, '.claude/skills/drift-cm/SKILL.md'));
    await expectExists(path.join(root, '.claude/skills/drift-cm/references/checklist.md'));
    await expectMissing(path.join(root, '.claude/skills/drift-cm/agents/openai.yaml'));

    const checklist = await readFile(path.join(root, '.claude/skills/drift-cm/references/checklist.md'), 'utf8');
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
      skills: ['drift-analyst'],
    });

    const rule = await readFile(path.join(root, '.cursor/rules/drift-analyst.mdc'), 'utf8');
    expect(rule).toContain('alwaysApply: false');
    expect(rule).toContain('Analyze LLM-drift impact');
    expect(rule).toContain('# Drift Analyst');
    expect(rule).toContain('pnpm --filter next-v1 exec drift-lock check');
    expect(rule).toContain('pnpm --filter next-v1 exec drift-lock coverage');
    expect(rule).toContain('pnpm --filter next-v1 exec drift-lock diff --summary');
    expect(rule).toContain('pnpm --filter next-v1 exec drift-lock explain <contract-id>');
    expect(rule).toContain('pnpm --filter next-v1 exec drift-lock proof --git-base <ref>');
    expect(rule).toContain('## Bundled References');
    expect(rule).toContain('### references/output-format.md');
    expect(rule).toContain('### references/risk-matrix.md');
    expect(rule).toContain('CRITICAL -> ask for product/contract confirmation before implementation');
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
