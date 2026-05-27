import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkContracts, extractContracts, toIndex, writeIndexStore } from '@drift-lock/core';
import { createGitBaseline, createProject } from './helpers/core-test-utils.js';

describe('drift synthetic scaling', () => {
  it('extracts many contract files deterministically', async () => {
    const count = 100;
    const root = await createProject(syntheticProject(count));

    const result = await extractContracts({ root });
    const ids = result.contracts.map((contract) => contract.id);

    expect(result.errors).toEqual([]);
    expect(ids).toEqual(syntheticIds(count));
    expect(new Set(ids).size).toBe(count);
  });

  it('checks many simple contracts without diagnostics', async () => {
    const count = 100;
    const root = await createProject(syntheticProject(count));

    const result = await checkContracts({ root });

    expect(result.errors).toEqual([]);
    expect(result.contracts.map((contract) => contract.id)).toEqual(syntheticIds(count));
  });

  it('keeps Git changed-only checks scoped to the changed contract file', async () => {
    const count = 30;
    const root = await createProject(syntheticProject(count));
    const extracted = await extractContracts({ root });
    await writeIndexStore(root, undefined, toIndex(extracted.contracts));
    await createGitBaseline(root);

    const changed = featureLabel(7);
    await writeFile(
      path.join(root, featureFile(changed)),
      syntheticUsageSource(changed, { includeImport: false, returnExpression: '{ hardcoded: true }' }),
      'utf8',
    );

    const result = await checkContracts({ root, changedOnly: true, gitBase: 'HEAD' });

    expect(result.contracts.map((contract) => contract.id)).toEqual([syntheticId(changed)]);
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'DRIFT010_SSOT_NOT_USED',
        contractId: syntheticId(changed),
        file: featureFile(changed),
      }),
    ]);
  });

  it('expands Git changed-only checks for a shared SSOT file without selecting unrelated contracts', async () => {
    const count = 20;
    const root = await createProject({
      ...syntheticProject(count),
      'src/schema.ts': 'export const schema = { parse: (input: unknown) => input };\n',
      'src/features/unrelated/actions.ts': syntheticUsageSource('unrelated', {
        contractId: 'billing.unrelated',
        importName: 'schema',
        importPath: '@/schema',
        ssotPath: '@/schema.ts',
      }),
    });
    const extracted = await extractContracts({ root });
    await writeIndexStore(root, undefined, toIndex(extracted.contracts));
    await createGitBaseline(root);
    await writeFile(path.join(root, 'src/pricing.ts'), 'export const PRICING = { changed: true };\n', 'utf8');

    const result = await checkContracts({ root, changedOnly: true, gitBase: 'HEAD' });

    expect(result.errors).toEqual([]);
    expect(result.contracts.map((contract) => contract.id)).toEqual(syntheticIds(count));
    expect(result.contracts.some((contract) => contract.id === 'billing.unrelated')).toBe(false);
  });
});

function syntheticProject(count: number): Record<string, string> {
  const files: Record<string, string> = {
    'src/pricing.ts': syntheticPricingSource(),
  };

  for (let index = 0; index < count; index += 1) {
    const label = featureLabel(index);
    files[featureFile(label)] = syntheticUsageSource(label);
  }

  return files;
}

function syntheticUsageSource(
  label: string,
  options: {
    contractId?: string;
    includeImport?: boolean;
    importName?: string;
    importPath?: string;
    returnExpression?: string;
    ssotPath?: string;
  } = {},
): string {
  const contractId = options.contractId ?? syntheticId(label);
  const includeImport = options.includeImport ?? true;
  const importName = options.importName ?? 'PRICING';
  const importPath = options.importPath ?? '@/pricing';
  const returnExpression = options.returnExpression ?? importName;
  const ssotPath = options.ssotPath ?? '@/pricing.ts';
  const functionName = `checkout${pascalIdentifier(label)}`;

  return `${includeImport ? `import { ${importName} } from '${importPath}';\n\n` : ''}/* @drift
version: 1
id: ${contractId}
scope: declaration
stability: locked

intent: >
  Keep synthetic checkout feature ${label} wired to its declared source of truth.

ssot:
  pricing: "${ssotPath}"

invariants:
  - id: uses-pricing-ssot
    enforce: drift/ssot-usage
    ssot: pricing
*/
export function ${functionName}() {
  return ${returnExpression};
}
`;
}

function syntheticPricingSource(): string {
  return 'export const PRICING = { pro: { priceId: "price_pro" } };\n';
}

function syntheticIds(count: number): string[] {
  return Array.from({ length: count }, (_value, index) => syntheticId(featureLabel(index)));
}

function syntheticId(label: string): string {
  return `billing.feature-${label}`;
}

function featureLabel(index: number): string {
  return String(index).padStart(3, '0');
}

function featureFile(label: string): string {
  return `src/features/feature-${label}/actions.ts`;
}

function pascalIdentifier(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('');
}
