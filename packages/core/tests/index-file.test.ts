import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractContracts, openIndexStore, toIndex, writeIndexStore } from '@drift-lock/core';
import { createGitBaseline, createProject } from './helpers/core-test-utils.js';
import { validActionsSource } from './helpers/contract-fixtures.js';
import { validFlowSource } from './helpers/flow-fixtures.js';

describe('drift sharded index store', () => {
  it('returns undefined when the index store is absent', async () => {
    const root = await createProject({});

    await expect(openIndexStore({ kind: 'working-tree', root })).resolves.toBeUndefined();
  });

  it('reads contracts from an index store written by writeIndexStore', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    const expected = toIndex(extracted.contracts);
    await writeIndexStore(root, undefined, expected);

    const store = await openIndexStore({ kind: 'working-tree', root });

    await expect(store?.materializeIndex()).resolves.toEqual(expected);
    await expect(store?.getContractsByIds([expected.contracts[0]!.id])).resolves.toEqual(expected.contracts);
  });

  it('reads contract ids by file and impacted ssot file', async () => {
    const root = await createProject({ 'src/actions.ts': validFlowSource('billing.changed') });
    const extracted = await extractContracts({ root });
    await writeIndexStore(root, undefined, toIndex(extracted.contracts), { sourceDir: 'src' });

    const store = await openIndexStore({ kind: 'working-tree', root });

    await expect(store?.getContractIdsForFiles(['src/actions.ts'], { includeOwned: true })).resolves.toMatchObject({
      ownedContractIds: ['billing.changed'],
    });
    await expect(store?.getContractIdsForFiles(['src/features/billing/pricing.ts'], { includeImpacted: true })).resolves.toMatchObject({
      impactedContractIds: ['billing.changed'],
    });
  });

  it('reads index stores from Git refs', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource('billing.changed') });
    const extracted = await extractContracts({ root });
    await writeIndexStore(root, undefined, toIndex(extracted.contracts));
    await createGitBaseline(root);

    const store = await openIndexStore({ kind: 'git-ref', root, ref: 'HEAD' });

    await expect(store?.getContractsByIds(['billing.changed'])).resolves.toEqual([
      expect.objectContaining({ id: 'billing.changed' }),
    ]);
  });

  it('reads index stores from Git refs when the index path is absolute', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource('billing.absolute') });
    const extracted = await extractContracts({ root });
    await writeIndexStore(root, undefined, toIndex(extracted.contracts));
    await createGitBaseline(root);

    const store = await openIndexStore({
      kind: 'git-ref',
      root,
      ref: 'HEAD',
      indexPath: path.join(root, '.drift/contracts.generated.index'),
    });

    await expect(store?.getContractsByIds(['billing.absolute'])).resolves.toEqual([
      expect.objectContaining({ id: 'billing.absolute' }),
    ]);
  });

  it('does not collapse unrelated top-level monorepo paths during file lookups', async () => {
    const root = await createProject({
      'apps/foo/src/actions.ts': validActionsSource('billing.app'),
      'packages/foo/src/actions.ts': validActionsSource('billing.package'),
    });
    const sourceDir = ['apps/foo/src', 'packages/foo/src'];
    const extracted = await extractContracts({ root, sourceDir });
    await writeIndexStore(root, undefined, toIndex(extracted.contracts), { sourceDir });

    const store = await openIndexStore({ kind: 'working-tree', root });

    await expect(store?.getContractIdsForFiles(['apps/foo/src/actions.ts'], { includeOwned: true })).resolves.toMatchObject({
      ownedContractIds: ['billing.app'],
    });
    await expect(store?.getContractIdsForFiles(['packages/foo/src/actions.ts'], { includeOwned: true })).resolves.toMatchObject({
      ownedContractIds: ['billing.package'],
    });
    await expect(store?.getContractIdsForFiles(['foo/src/actions.ts'], { includeOwned: true })).resolves.toMatchObject({
      ownedContractIds: [],
      missingFiles: expect.arrayContaining(['foo/src/actions.ts']),
    });
  });

  it('stores alias ssot impacts as exact source-root physical paths', async () => {
    const root = await createProject({ 'src/actions.ts': validFlowSource('billing.source-root') });
    const extracted = await extractContracts({ root, sourceDir: 'src' });
    await writeIndexStore(root, undefined, toIndex(extracted.contracts), { sourceDir: 'src' });

    const store = await openIndexStore({ kind: 'working-tree', root });

    await expect(store?.getContractIdsForFiles(['src/features/billing/pricing.ts'], { includeImpacted: true })).resolves.toMatchObject({
      impactedContractIds: ['billing.source-root'],
    });
    await expect(store?.getContractIdsForFiles(['features/billing/pricing.ts'], { includeImpacted: true })).resolves.toMatchObject({
      impactedContractIds: [],
      missingFiles: expect.arrayContaining(['features/billing/pricing.ts']),
    });
  });

  it('resolves alias ssot paths against the declaring contract source root', async () => {
    const root = await createProject({
      'apps/foo/src/actions.ts': validFlowSource('billing.app'),
      'packages/foo/src/actions.ts': validFlowSource('billing.package'),
    });
    const sourceDir = ['apps/foo/src', 'packages/foo/src'];
    const extracted = await extractContracts({ root, sourceDir });
    await writeIndexStore(root, undefined, toIndex(extracted.contracts), { sourceDir });

    const store = await openIndexStore({ kind: 'working-tree', root });

    await expect(store?.getContractIdsForFiles(['apps/foo/src/features/billing/pricing.ts'], { includeImpacted: true })).resolves.toMatchObject({
      impactedContractIds: ['billing.app'],
    });
    await expect(store?.getContractIdsForFiles(['packages/foo/src/features/billing/pricing.ts'], { includeImpacted: true })).resolves.toMatchObject({
      impactedContractIds: ['billing.package'],
    });
    await expect(store?.getContractIdsForFiles(['features/billing/pricing.ts'], { includeImpacted: true })).resolves.toMatchObject({
      impactedContractIds: [],
    });
  });

  it('rejects invalid manifests', async () => {
    const root = await createProject({});
    await mkdir(path.join(root, '.drift/contracts.generated.index'), { recursive: true });
    await writeFile(path.join(root, '.drift/contracts.generated.index/manifest.json'), '{', 'utf8');

    await expect(openIndexStore({ kind: 'working-tree', root })).rejects.toThrow(/Invalid Drift contracts index/);
  });

  it('writes deterministic sharded artifacts without runtime extraction fields', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndexStore(root, undefined, toIndex(extracted.contracts));

    const manifest = await readFile(path.join(root, '.drift/contracts.generated.index/manifest.json'), 'utf8');
    expect(manifest).not.toContain('generatedAt');
    expect(manifest.endsWith('\n')).toBe(true);

    const byContractDir = path.join(root, '.drift/contracts.generated.index/by-contract');
    await expect(readdir(byContractDir)).resolves.toEqual(expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{2}\.ndjson$/)]));
    const store = await openIndexStore({ kind: 'working-tree', root });
    const materialized = await store?.materializeIndex();
    expect(materialized?.contracts[0]).not.toHaveProperty('raw');
    expect(materialized?.contracts[0]?.bodyHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('writes derived ssot-flow summaries for indexed helper contracts', async () => {
    const root = await createProject({ 'src/actions.ts': validFlowSource() });
    const extracted = await extractContracts({ root });
    const index = toIndex(extracted.contracts);

    expect(index.contracts[0]?.summaries).toEqual({
      ssotFlow: [
        {
          ssotPath: '@/features/billing/pricing.ts',
          returns: ['return.amount', 'return.currency', 'return.priceId'],
        },
      ],
    });
  });
});
