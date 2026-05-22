import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* @drift
version: 1
id: cli.skills
scope: file
stability: locked

intent: >
  List and install bundled DriftLock agent skills with provider-specific file
  layout and command templating.

llm:
  must_not_change:
    - Unknown requested skills must fail instead of being silently ignored.
    - Existing installed skills must require force before replacement.
    - Provider-specific filtering must preserve OpenAI, Claude, and Cursor layouts.
*/
export type SkillProvider = 'openai' | 'claude' | 'cursor';

export type InstallSkillsOptions = {
  provider: SkillProvider;
  root: string;
  force?: boolean;
  driftCommand?: string;
  skills?: string[];
};

export type InstalledSkill = {
  name: string;
  path: string;
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const bundledSkillsDir = path.resolve(currentDir, '../skills');
const defaultDriftCommand = 'npx --yes @drift-lock/cli';
const templateTextExtensions = new Set(['.md', '.mdc', '.txt', '.yaml', '.yml']);

export async function listBundledSkills(skillsDir = bundledSkillsDir): Promise<string[]> {
  const entries = await readdir(skillsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export async function installSkills(options: InstallSkillsOptions, skillsDir = bundledSkillsDir): Promise<InstalledSkill[]> {
  const root = path.resolve(options.root);
  const template = { driftCommand: normalizeCommand(options.driftCommand ?? defaultDriftCommand) };
  const available = await listBundledSkills(skillsDir);
  const selected = options.skills && options.skills.length > 0 ? options.skills : available;
  const unknown = selected.filter((skill) => !available.includes(skill));
  if (unknown.length > 0) {
    throw new Error(`Unknown Drift skill(s): ${unknown.join(', ')}`);
  }

  const installed: InstalledSkill[] = [];
  for (const skill of selected) {
    const source = path.join(skillsDir, skill);
    if (options.provider === 'cursor') {
      installed.push(await installCursorRule(root, source, skill, Boolean(options.force), template));
      continue;
    }

    const destinationRoot = options.provider === 'openai' ? path.join(root, '.agents', 'skills') : path.join(root, '.claude', 'skills');
    const destination = path.join(destinationRoot, skill);
    await copySkillDirectory(source, destination, options.provider, Boolean(options.force), template);
    installed.push({ name: skill, path: destination });
  }

  return installed;
}

type SkillTemplate = {
  driftCommand: string;
};

async function copySkillDirectory(
  source: string,
  destination: string,
  provider: 'openai' | 'claude',
  force: boolean,
  template: SkillTemplate,
): Promise<void> {
  if (await exists(destination)) {
    if (!force) throw new Error(`Skill already exists: ${destination}. Use --force to overwrite.`);
    await rm(destination, { recursive: true, force: true });
  }

  await mkdir(destination, { recursive: true });
  await copyRecursive(source, destination, (relativePath) => {
    if (provider === 'openai') return true;
    return relativePath === 'SKILL.md' || relativePath === 'references' || relativePath.startsWith(`references${path.sep}`);
  }, template);
}

async function installCursorRule(
  root: string,
  source: string,
  skill: string,
  force: boolean,
  template: SkillTemplate,
): Promise<InstalledSkill> {
  const destination = path.join(root, '.cursor', 'rules', `${skill}.mdc`);
  if (await exists(destination)) {
    if (!force) throw new Error(`Cursor rule already exists: ${destination}. Use --force to overwrite.`);
    await rm(destination, { force: true });
  }

  const skillText = renderTemplate(await readFile(path.join(source, 'SKILL.md'), 'utf8'), template);
  const metadata = parseSkillFrontmatter(skillText);
  const body = stripFrontmatter(skillText);
  const references = await renderCursorReferences(source, template);
  const content = [body.trim(), references].filter(Boolean).join('\n\n');
  const rule = `---\ndescription: "${escapeYamlString(metadata.description)}"\nglobs: []\nalwaysApply: false\n---\n\n${content}\n`;

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, rule, 'utf8');
  return { name: skill, path: destination };
}

async function renderCursorReferences(source: string, template: SkillTemplate): Promise<string> {
  const referencesRoot = path.join(source, 'references');
  if (!(await exists(referencesRoot))) return '';

  const files = await listFiles(referencesRoot);
  if (files.length === 0) return '';

  const rendered: string[] = ['## Bundled References'];
  for (const file of files) {
    const relativePath = toPosixPath(path.relative(source, file));
    const content = isTemplateTextFile(file) ? renderTemplate(await readFile(file, 'utf8'), template) : await readFile(file, 'utf8');
    rendered.push(`### ${relativePath}\n\n${content.trim()}`);
  }

  return rendered.join('\n\n');
}

async function copyRecursive(
  source: string,
  destination: string,
  include: (relativePath: string) => boolean,
  template: SkillTemplate,
  base = source,
): Promise<void> {
  const sourceStat = await stat(source);
  const relativePath = path.relative(base, source);
  if (relativePath && !include(relativePath)) return;

  if (sourceStat.isDirectory()) {
    await mkdir(destination, { recursive: true });
    const entries = await readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      await copyRecursive(path.join(source, entry.name), path.join(destination, entry.name), include, template, base);
    }
    return;
  }

  await mkdir(path.dirname(destination), { recursive: true });
  if (isTemplateTextFile(source)) {
    const rendered = renderTemplate(await readFile(source, 'utf8'), template);
    await writeFile(destination, rendered, 'utf8');
    return;
  }

  await copyFile(source, destination);
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(file)));
      continue;
    }
    if (entry.isFile()) files.push(file);
  }
  return files.sort();
}

function parseSkillFrontmatter(text: string): { name: string; description: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error('Invalid skill frontmatter.');
  const frontmatter = match[1] ?? '';
  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
  if (!name || !description) throw new Error('Skill frontmatter must include name and description.');
  return { name, description };
}

function stripFrontmatter(text: string): string {
  return text.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

function escapeYamlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function isTemplateTextFile(file: string): boolean {
  return templateTextExtensions.has(path.extname(file));
}

function renderTemplate(text: string, template: SkillTemplate): string {
  return text.replaceAll('{{DRIFT_COMMAND}}', template.driftCommand);
}

function normalizeCommand(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) throw new Error('Drift command cannot be empty.');
  return trimmed;
}

function toPosixPath(file: string): string {
  return file.split(path.sep).join('/');
}
