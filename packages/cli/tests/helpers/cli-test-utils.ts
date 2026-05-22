import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect } from 'vitest';

export const execFileAsync = promisify(execFile);
export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const repoRoot = path.resolve(packageRoot, '../..');
export const cliSource = path.join(packageRoot, 'src/cli.ts');

export async function tempProject(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'drift-skills-test-'));
  await mkdir(path.join(root, 'src'), { recursive: true });
  return root;
}

export async function writePackage(root: string): Promise<void> {
  await writeFile(
    path.join(root, 'package.json'),
    `${JSON.stringify({ name: 'fixture', version: '0.0.0', type: 'module', scripts: {} }, null, 2)}\n`,
    'utf8',
  );
}

export async function writeDriftConfigFile(root: string, requireContracts: string[], source: string | string[] = 'src', adoptionMode?: 'audit' | 'warn' | 'enforce'): Promise<void> {
  await mkdir(path.join(root, '.drift'), { recursive: true });
  await writeFile(
    path.join(root, '.drift/config.json'),
    `${JSON.stringify({ version: 1, source, index: '.drift/contracts.generated.json', requireContracts, ...(adoptionMode ? { adoption: { mode: adoptionMode } } : {}) }, null, 2)}\n`,
    'utf8',
  );
}

export async function expectExists(file: string): Promise<void> {
  await expect(stat(file)).resolves.toBeTruthy();
}

export async function expectMissing(file: string): Promise<void> {
  await expect(stat(file)).rejects.toThrow();
}

export async function createGitBaseline(root: string): Promise<void> {
  await execFileAsync('git', ['init'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'drift@example.com'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Drift Test'], { cwd: root });
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', 'baseline'], { cwd: root });
}

export async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFileAsync(process.execPath, ['--import', 'tsx', cliSource, ...args], { cwd: repoRoot });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', code: result.code ?? 1 };
  }
}
