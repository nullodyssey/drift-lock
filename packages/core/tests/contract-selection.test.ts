import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DriftContractsIndex, DriftExtractedContract, DriftIndexedContract } from '../src/types.js';
import { changedContracts, resolveCheckScope } from '../src/core/contract-selection.js';
import { createGitBaseline, createProject } from './helpers/core-test-utils.js';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;

describe('drift contract selection', () => {
  it('keeps changedOnly conservative when no committed index exists', () => {
    const contracts = [extractedContract('billing.changed')];

    expect(changedContracts(contracts, undefined)).toEqual(contracts);
  });

  it('selects no contracts when the committed index is identical', () => {
    const contracts = [extractedContract('billing.same')];
    const index = indexFor(contracts.map(toIndexedContract));

    expect(changedContracts(contracts, index)).toEqual([]);
  });

  it('selects contracts changed against the committed index', () => {
    const current = extractedContract('billing.changed', 'src/changed.ts', HASH_A, HASH_C);
    const previous = toIndexedContract(extractedContract('billing.changed', 'src/changed.ts', HASH_A, HASH_B));

    expect(changedContracts([current], indexFor([previous]))).toEqual([current]);
  });

  it('selects unchanged contracts impacted by SSOT file changes', () => {
    const unchanged = extractedContract('billing.impacted');
    const index = indexFor([toIndexedContract(unchanged)]);

    expect(changedContracts([unchanged], index, ['billing.impacted'])).toEqual([unchanged]);
  });

  it('resolves Git scope into scoped index and extract files without mutating the full index', async () => {
    const root = await createProject({
      'src/a.ts': `export const a = 1;\n`,
      'src/b.ts': `export const b = 1;\n`,
    });
    const index = indexFor([
      toIndexedContract(extractedContract('billing.a', 'src/a.ts')),
      toIndexedContract(extractedContract('billing.b', 'src/b.ts')),
    ]);
    await createGitBaseline(root);
    await writeFile(path.join(root, 'src/a.ts'), `export const a = 2;\n`, 'utf8');

    const result = await resolveCheckScope({ root, gitBase: 'HEAD' }, index);

    expect(result.gitScope?.contractFiles).toEqual(['src/a.ts']);
    expect(result.extractFiles).toEqual(['src/a.ts']);
    expect(result.scopedIndex?.contracts.map((contract) => contract.id)).toEqual(['billing.a']);
    expect(index.contracts.map((contract) => contract.id)).toEqual(['billing.a', 'billing.b']);
  });
});

function indexFor(contracts: DriftIndexedContract[]): DriftContractsIndex {
  return {
    version: 1,
    contracts,
  };
}

function extractedContract(
  id: string,
  file = `src/${id}.ts`,
  contentHash = HASH_A,
  bodyHash = HASH_B,
): DriftExtractedContract {
  return {
    version: 1,
    id,
    scope: 'declaration',
    stability: 'locked',
    intent: 'Select this contract for a focused check.',
    file,
    anchor: { type: 'function', name: id.split('.').at(-1) ?? id },
    contentHash,
    bodyHash,
    line: 1,
    column: 1,
    raw: '',
    bodyStart: 0,
    bodyEnd: 0,
  };
}

function toIndexedContract(contract: DriftExtractedContract): DriftIndexedContract {
  const indexed: DriftIndexedContract = {
    version: contract.version,
    id: contract.id,
    scope: contract.scope,
    stability: contract.stability,
    intent: contract.intent,
    file: contract.file,
    anchor: contract.anchor,
    contentHash: contract.contentHash,
    bodyHash: contract.bodyHash,
  };
  if (contract.ssot) indexed.ssot = contract.ssot;
  if (contract.invariants) indexed.invariants = contract.invariants;
  if (contract.llm) indexed.llm = contract.llm;
  return indexed;
}
