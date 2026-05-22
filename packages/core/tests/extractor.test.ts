import { describe, expect, it } from 'vitest';
import { extractContracts, extractContractsFromSource } from '@drift-lock/core';
import { createProject } from './helpers/core-test-utils.js';
import { validActionsSource } from './helpers/contract-fixtures.js';

describe('drift contract extraction', () => {
  it('extracts a valid declaration contract with a stable hash', () => {
    const source = validActionsSource();
    const result = extractContractsFromSource('src/features/billing/actions.ts', source);

    expect(result.errors).toEqual([]);
    expect(result.contracts).toHaveLength(1);
    expect(result.contracts[0]).toMatchObject({
      id: 'billing.create-checkout-session',
      scope: 'declaration',
      stability: 'locked',
      anchor: { type: 'function', name: 'createCheckoutSession' },
    });
    expect(result.contracts[0]?.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('extracts contracts with CRLF opening markers', () => {
    const source = validActionsSource().replaceAll('\n', '\r\n');
    const result = extractContractsFromSource('src/features/billing/actions.ts', source);

    expect(result.errors).toEqual([]);
    expect(result.contracts).toHaveLength(1);
    expect(result.contracts[0]?.id).toBe('billing.create-checkout-session');
  });

  it('ignores drift-like blocks inside strings', () => {
    const result = extractContractsFromSource(
      'src/install.ts',
      `const template = \`/* @drift
version: 1
id: billing.create-checkout-session
scope: declaration
stability: locked
intent: Create a checkout session from pricing.
*/
export function createCheckoutSession() {}
\`;
`,
    );

    expect(result).toEqual({ contracts: [], errors: [] });
  });

  it('extracts a file contract after imports in an import-only module', () => {
    const result = extractContractsFromSource(
      'src/setup.ts',
      `import './polyfill';

/* @drift
version: 1
id: module.side-effect-boundary
scope: file
stability: locked

intent: >
  Protect this import-only side-effect module contract.
*/
`,
    );

    expect(result.errors).toEqual([]);
    expect(result.contracts).toHaveLength(1);
    expect(result.contracts[0]).toMatchObject({
      id: 'module.side-effect-boundary',
      scope: 'file',
      anchor: { type: 'file' },
    });
  });

  it('extracts a file-only contract with no statements', () => {
    const result = extractContractsFromSource(
      'src/boundary.ts',
      `/* @drift
version: 1
id: module.boundary
scope: file
stability: locked

intent: >
  Protect this empty module boundary contract.
*/
`,
    );

    expect(result.errors).toEqual([]);
    expect(result.contracts).toHaveLength(1);
    expect(result.contracts[0]).toMatchObject({
      id: 'module.boundary',
      scope: 'file',
      anchor: { type: 'file' },
    });
  });

  it('returns schema errors for unknown fields and missing required fields', () => {
    const result = extractContractsFromSource(
      'src/example.ts',
      `/* @drift
version: 1
id: billing.create-checkout-session
scope: declaration
kind: command
*/
export function createCheckoutSession() {}
`,
    );

    expect(result.errors.map((error) => error.code)).toContain('DRIFT002_UNKNOWN_FIELD');
    expect(result.errors.map((error) => error.code)).toContain('DRIFT003_MISSING_REQUIRED_FIELD');
  });

  it('rejects unanchored declaration contracts', () => {
    const result = extractContractsFromSource(
      'src/example.ts',
      `/* @drift
version: 1
id: billing.create-checkout-session
scope: declaration
stability: locked
intent: Create a Stripe Checkout session for the Pro subscription.
*/
if (true) {}
`,
    );

    expect(result.errors.map((error) => error.code)).toContain('DRIFT006_UNANCHORED_CONTRACT');
  });

  it('detects duplicate ids across files', async () => {
    const root = await createProject({
      'src/a.ts': validActionsSource('billing.create-checkout-session'),
      'src/b.ts': validActionsSource('billing.create-checkout-session'),
    });

    const result = await extractContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT005_DUPLICATE_CONTRACT_ID');
  });
});
