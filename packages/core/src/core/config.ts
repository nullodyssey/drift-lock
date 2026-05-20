import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultIndexPath } from './index-file.js';

export const defaultConfigPath = '.drift/config.json';

export type DriftConfig = {
  version: 1;
  source: string;
  index: string;
};

export const defaultDriftConfig: DriftConfig = {
  version: 1,
  source: 'src',
  index: defaultIndexPath,
};

export async function readDriftConfig(root: string, input = defaultConfigPath): Promise<DriftConfig> {
  const absoluteInput = path.resolve(root, input);
  try {
    const parsed = JSON.parse(await readFile(absoluteInput, 'utf8')) as unknown;
    return validateConfig(parsed, input);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultDriftConfig;
    if (error instanceof Error && error.message.startsWith('Invalid DriftLock config')) throw error;
    throw new Error(`Invalid DriftLock config at "${input}".`);
  }
}

export async function writeDriftConfig(root: string, config: DriftConfig = defaultDriftConfig, output = defaultConfigPath): Promise<void> {
  const absoluteOutput = path.resolve(root, output);
  await mkdir(path.dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function validateConfig(value: unknown, file: string): DriftConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid DriftLock config at "${file}".`);
  }

  const config = value as Partial<DriftConfig>;
  if (config.version !== 1 || typeof config.source !== 'string' || typeof config.index !== 'string') {
    throw new Error(`Invalid DriftLock config at "${file}".`);
  }

  if (!config.source.trim() || !config.index.trim()) {
    throw new Error(`Invalid DriftLock config at "${file}".`);
  }

  return {
    version: 1,
    source: config.source,
    index: config.index,
  };
}
