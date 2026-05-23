import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DriftContractSummaries, DriftContractsIndex, DriftExtractedContract, DriftIndexedContract } from '../types.js';

/* @drift
version: 1
id: core.index-file
scope: file
stability: locked

intent: >
  Read, write, and serialize the committed Drift contract index used as the
  baseline for locked contract checks.

llm:
  must_not_change:
    - Runtime-only extraction fields must not be written to the committed index.
    - Missing index files must be treated as absent, not invalid.
    - Generated indexes must remain stable pretty-printed JSON with a trailing newline.
*/
export const defaultIndexPath = '.drift/contracts.generated.json';

export function toIndex(contracts: DriftExtractedContract[]): DriftContractsIndex {
  return {
    version: 1,
    // Runtime-only fields make checks possible in-memory, but keeping them out of
    // the committed index preserves a small, stable baseline.
    contracts: contracts.map(toIndexedContract),
  };
}

function toIndexedContract(contract: DriftExtractedContract): DriftIndexedContract {
  const { raw: _raw, bodyStart: _bodyStart, bodyEnd: _bodyEnd, line: _line, column: _column, ...indexed } = contract;
  const summaries = summariesForContract(contract);
  return summaries ? { ...indexed, summaries } : indexed;
}

function summariesForContract(contract: DriftExtractedContract): DriftContractSummaries | undefined {
  const ssotFlow = (contract.invariants ?? [])
    .filter((invariant) => invariant.enforce === 'drift/ssot-flow' && invariant.ssot && invariant.sinks?.length)
    .flatMap((invariant) => {
      const ssotPath = contract.ssot?.[invariant.ssot as string];
      if (!ssotPath) return [];
      return [{ ssotPath, returns: [...new Set(invariant.sinks)].sort() }];
    });

  return ssotFlow.length > 0 ? { ssotFlow } : undefined;
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
