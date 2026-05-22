import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { installSkills, listBundledSkills } from '../src/skills.js';
import { expectExists, expectMissing, tempProject } from './helpers/cli-test-utils.js';

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
