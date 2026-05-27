import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkContracts, diffContracts, extractContracts, extractContractsFromSource, toIndex, writeIndexStore } from '@drift-lock/core';
import { createProject } from './helpers/core-test-utils.js';
import { fileScopedUsageSource, validActionsSource } from './helpers/contract-fixtures.js';
import { validFlowSource } from './helpers/flow-fixtures.js';

describe('drift contract checking', () => {
  it('detects missing ssot usage', async () => {
    const root = await createProject({
      'src/actions.ts': validActionsSource().replace(
        "import { PRO_PRICE_ID } from '@/features/billing/pricing';\n",
        '',
      ),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT010_SSOT_NOT_USED');
  });

  it('detects required source files without contracts', async () => {
    const root = await createProject({
      'src/features/billing/actions.ts': 'export const checkoutAction = true;\n',
      'src/features/support/actions.ts': validActionsSource('support.actions').replaceAll('billing', 'support'),
    });

    const result = await checkContracts({ root, requireContracts: ['src/features/**/actions.ts'] });

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'DRIFT015_REQUIRED_CONTRACT_MISSING',
        file: 'src/features/billing/actions.ts',
        details: expect.objectContaining({ pattern: 'src/features/**/actions.ts' }),
      }),
    ]);
  });

  it('reports required-contract gaps as non-blocking diagnostics in warn and audit modes', async () => {
    const root = await createProject({
      'src/features/billing/actions.ts': 'export const checkoutAction = true;\n',
    });

    const warn = await checkContracts({ root, requireContracts: ['src/features/**/actions.ts'], adoptionMode: 'warn' });
    const audit = await checkContracts({ root, requireContracts: ['src/features/**/actions.ts'], adoptionMode: 'audit' });

    expect(warn.errors).toEqual([]);
    expect(warn.diagnostics).toEqual([
      expect.objectContaining({ code: 'DRIFT015_REQUIRED_CONTRACT_MISSING', severity: 'warning' }),
    ]);
    expect(audit.errors).toEqual([]);
    expect(audit.diagnostics).toEqual([
      expect.objectContaining({ code: 'DRIFT015_REQUIRED_CONTRACT_MISSING', severity: 'info' }),
    ]);
  });

  it('keeps executable invariant violations blocking in audit mode', async () => {
    const root = await createProject({
      'src/actions.ts': validActionsSource().replace(
        "import { PRO_PRICE_ID } from '@/features/billing/pricing';\n",
        '',
      ),
    });

    const result = await checkContracts({ root, adoptionMode: 'audit' });

    expect(result.errors.map((error) => error.code)).toContain('DRIFT010_SSOT_NOT_USED');
    expect(result.diagnostics.find((diagnostic) => diagnostic.code === 'DRIFT010_SSOT_NOT_USED')).toMatchObject({ severity: 'error' });
  });

  it('accepts ssot usage on file-scoped contracts', () => {
    const result = extractContractsFromSource('src/actions.ts', fileScopedUsageSource());

    expect(result.errors).toEqual([]);
    expect(result.contracts[0]).toMatchObject({
      id: 'billing.module-boundary',
      scope: 'file',
      anchor: { type: 'file' },
    });
  });

  it('rejects ssot flow on file-scoped contracts', () => {
    const result = extractContractsFromSource(
      'src/actions.ts',
      fileScopedUsageSource().replace('enforce: drift/ssot-usage', `enforce: drift/ssot-flow
    sinks:
      - return.priceId`),
    );

    expect(result.errors.map((error) => error.code)).toContain('DRIFT008_UNSUPPORTED_INVARIANT');
  });

  it('accepts NodeNext .js imports for .ts ssot paths', async () => {
    const root = await createProject({
      'src/actions.ts': validActionsSource()
        .replace("ssot:\n  pricing: \"@/features/billing/pricing.ts\"", "ssot:\n  pricing: \"./pricing.ts\"")
        .replace("import { PRO_PRICE_ID } from '@/features/billing/pricing';", "import { PRO_PRICE_ID } from './pricing.js';"),
    });

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('checks code-only regressions when changedOnly is enabled', async () => {
    const root = await createProject({
      'src/unchanged.ts': validActionsSource('billing.unchanged').replace(
        "import { PRO_PRICE_ID } from '@/features/billing/pricing';\n",
        '',
      ),
      'src/changed.ts': validFlowSource('billing.changed'),
    });
    const extracted = await extractContracts({ root });
    await writeIndexStore(root, undefined, toIndex(extracted.contracts));
    await writeFile(
      path.join(root, 'src/changed.ts'),
      validFlowSource('billing.changed').replace('priceId: price.priceId,', "priceId: 'price_hardcoded',"),
      'utf8',
    );

    const changedOnly = await checkContracts({ root, changedOnly: true });
    const diff = await diffContracts({ root });

    expect(diff.diff.changes).toEqual([
      expect.objectContaining({ id: 'billing.changed', fields: ['body'] }),
    ]);
    expect(changedOnly.errors.map((error) => error.code)).toContain('DRIFT013_SSOT_FLOW_NOT_PROVEN');
    expect(changedOnly.errors.some((error) => error.contractId === 'billing.unchanged')).toBe(false);
  });
});
