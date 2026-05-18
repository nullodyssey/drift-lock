import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DriftContractsIndex, DriftExtractedContract } from '../types.js';

export const defaultIndexPath = '.drift/contracts.generated.json';

export function toIndex(contracts: DriftExtractedContract[]): DriftContractsIndex {
  return {
    version: 1,
    // Runtime-only fields make checks possible in-memory, but keeping them out of
    // the committed index preserves a small, stable baseline.
    contracts: contracts.map(({ raw: _raw, bodyStart: _bodyStart, bodyEnd: _bodyEnd, line: _line, column: _column, ...contract }) => contract),
  };
}

export async function writeIndex(root: string, output = defaultIndexPath, index: DriftContractsIndex): Promise<void> {
  const absoluteOutput = path.resolve(root, output);
  await mkdir(path.dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

export async function readIndex(root: string, input = defaultIndexPath): Promise<DriftContractsIndex | undefined> {
  const absoluteInput = path.resolve(root, input);
  try {
    return JSON.parse(await readFile(absoluteInput, 'utf8')) as DriftContractsIndex;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
