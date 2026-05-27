import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DriftAdoptionMode, DriftSource } from '../types.js';
import { defaultIndexPath } from './index-file.js';

/* @drift
version: 1
id: core.config
scope: file
stability: locked

intent: >
  Define and validate the DriftLock project config schema used by every CLI command.

ssot:
  index-file: "./index-file.ts"

invariants:
  - id: default-index-path-from-index-file
    enforce: drift/ssot-usage
    ssot: index-file

llm:
  must_not_change:
    - Preserve default config compatibility for projects without .drift/config.json.
    - Keep config validation strict so ignored fields cannot look enforceable.
    - The default index path must point at the canonical sharded index store.
*/
export const defaultConfigPath = '.drift/config.json';

export type DriftConfigInput = {
  version: 1;
  source: DriftSource;
  index: string;
  requireContracts?: string[];
  adoption?: {
    mode: DriftAdoptionMode;
  };
};

export type DriftConfig = {
  version: 1;
  source: DriftSource;
  index: string;
  requireContracts: string[];
  adoption: {
    mode: DriftAdoptionMode;
  };
};

export const defaultDriftConfig: DriftConfig = createDefaultDriftConfig();

/* @drift
version: 1
id: core.config.default-index-flow
scope: declaration
stability: locked

intent: >
  Build the default DriftLock config from the shared default sharded index path
  so CLI defaults cannot drift away from index store behavior.

ssot:
  index-file: "./index-file.ts"

invariants:
  - id: default-index-from-index-file
    enforce: drift/ssot-flow
    ssot: index-file
    sinks:
      - return.index

llm:
  must_not_change:
    - Default config index must come from defaultIndexPath.
    - Missing config files must keep using enforce adoption mode.
*/
function createDefaultDriftConfig(): DriftConfig {
  return {
    version: 1,
    source: 'src',
    index: defaultIndexPath,
    requireContracts: [],
    adoption: { mode: 'enforce' },
  };
}

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

export async function writeDriftConfig(root: string, config: DriftConfigInput = defaultDriftConfig, output = defaultConfigPath): Promise<void> {
  const absoluteOutput = path.resolve(root, output);
  await mkdir(path.dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

const configKeys = new Set(['version', 'source', 'index', 'requireContracts', 'adoption']);

function validateConfig(value: unknown, file: string): DriftConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid DriftLock config at "${file}".`);
  }

  if (Object.keys(value).some((key) => !configKeys.has(key))) {
    throw new Error(`Invalid DriftLock config at "${file}".`);
  }

  const config = value as Partial<DriftConfigInput>;
  if (config.version !== 1 || !isValidSource(config.source) || typeof config.index !== 'string') {
    throw new Error(`Invalid DriftLock config at "${file}".`);
  }

  if (!config.index.trim()) {
    throw new Error(`Invalid DriftLock config at "${file}".`);
  }

  if (config.requireContracts !== undefined) {
    if (!Array.isArray(config.requireContracts)) {
      throw new Error(`Invalid DriftLock config at "${file}".`);
    }
    if (config.requireContracts.some((pattern) => typeof pattern !== 'string' || pattern.trim().length === 0)) {
      throw new Error(`Invalid DriftLock config at "${file}".`);
    }
  }

  const adoption = normalizeAdoption(config.adoption, file);

  return {
    version: 1,
    source: normalizeSource(config.source),
    index: config.index,
    requireContracts: config.requireContracts?.map((pattern) => pattern.trim()) ?? [],
    adoption,
  };
}

function normalizeAdoption(value: unknown, file: string): DriftConfig['adoption'] {
  if (value === undefined) return { mode: 'enforce' };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid DriftLock config at "${file}".`);
  }

  const adoption = value as Partial<DriftConfig['adoption']>;
  if (!isValidAdoptionMode(adoption.mode) || Object.keys(adoption).some((key) => key !== 'mode')) {
    throw new Error(`Invalid DriftLock config at "${file}".`);
  }

  return { mode: adoption.mode };
}

function isValidAdoptionMode(value: unknown): value is DriftAdoptionMode {
  return value === 'audit' || value === 'warn' || value === 'enforce';
}

function isValidSource(value: unknown): value is DriftSource {
  if (typeof value === 'string') return value.trim().length > 0;
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((source) => typeof source === 'string' && source.trim().length > 0);
}

function normalizeSource(source: DriftSource): DriftSource {
  if (typeof source === 'string') return source.trim();
  return source.map((entry) => entry.trim());
}
