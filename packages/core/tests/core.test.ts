import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { checkContracts } from '@drift-lock/core';
import { diffContracts, formatContractDiffSummary, writeAcceptanceFile } from '@drift-lock/core';
import { explainContracts, formatExplanations } from '@drift-lock/core';
import { getCoverage } from '@drift-lock/core';
import { renderContext, renderTaskContext } from '@drift-lock/core';
import { extractContracts, extractContractsFromSource } from '@drift-lock/core';
import { discoverSourceFiles } from '@drift-lock/core';
import { isValidContractId, readDriftConfig, writeDriftConfig } from '@drift-lock/core';
import { toIndex, writeIndex } from '@drift-lock/core';

const execFileAsync = promisify(execFile);

describe('drift v1 core', () => {
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

  it('reads DriftLock config with defaults and explicit values', async () => {
    const root = await createProject({});

    await expect(readDriftConfig(root)).resolves.toEqual({
      version: 1,
      source: 'src',
      index: '.drift/contracts.generated.json',
      requireContracts: [],
    });

    await writeDriftConfig(root, {
      version: 1,
      source: 'app',
      index: '.drift/custom.generated.json',
      requireContracts: ['app/**/*.ts'],
    });

    await expect(readDriftConfig(root)).resolves.toEqual({
      version: 1,
      source: 'app',
      index: '.drift/custom.generated.json',
      requireContracts: ['app/**/*.ts'],
    });

    await writeDriftConfig(root, {
      version: 1,
      source: ['packages/core/src', 'packages/cli/src'],
      index: '.drift/contracts.generated.json',
      requireContracts: ['packages/core/src/**/*.ts'],
    });

    await expect(readDriftConfig(root)).resolves.toEqual({
      version: 1,
      source: ['packages/core/src', 'packages/cli/src'],
      index: '.drift/contracts.generated.json',
      requireContracts: ['packages/core/src/**/*.ts'],
    });
  });

  it('rejects invalid config values', async () => {
    const root = await createProject({});
    await mkdir(path.join(root, '.drift'), { recursive: true });
    await writeFile(
      path.join(root, '.drift/config.json'),
      JSON.stringify({ version: 1, source: 'src', index: '.drift/contracts.generated.json', requireContracts: ['src/**/*.ts', ''] }),
      'utf8',
    );

    await expect(readDriftConfig(root)).rejects.toThrow(/Invalid DriftLock config/);

    await writeFile(
      path.join(root, '.drift/config.json'),
      JSON.stringify({ version: 1, source: [], index: '.drift/contracts.generated.json', requireContracts: [] }),
      'utf8',
    );

    await expect(readDriftConfig(root)).rejects.toThrow(/Invalid DriftLock config/);
  });

  it('discovers source files from multiple source directories', async () => {
    const root = await createProject({
      'packages/core/src/index.ts': 'export const core = true;\n',
      'packages/core/tests/core.test.ts': 'export const test = true;\n',
      'packages/cli/src/cli.ts': 'export const cli = true;\n',
    });

    await expect(discoverSourceFiles(root, ['packages/core/src', 'packages/cli/src', 'packages/core/src'])).resolves.toEqual([
      'packages/cli/src/cli.ts',
      'packages/core/src/index.ts',
    ]);
  });

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

  it('proves ssot flow for return sinks', async () => {
    const root = await createProject({ 'src/actions.ts': validFlowSource() });

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('proves ssot flow for nested return paths and const aliases', async () => {
    const root = await createProject({ 'src/actions.ts': validNestedFlowSource() });

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('proves ssot flow across all branch returns', async () => {
    const root = await createProject({ 'src/actions.ts': validBranchFlowSource() });

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('detects branch returns that bypass ssot flow', async () => {
    const root = await createProject({
      'src/actions.ts': validBranchFlowSource().replace('return { priceId: price.priceId };', "return { priceId: 'price_fallback' };"),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT013_SSOT_FLOW_NOT_PROVEN');
  });

  it('rejects if branches that can fall through without a proven return', async () => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`if (input.plan === 'pro') {
    return { priceId: BILLING_PRICES.pro.priceId };
  }`),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT014_UNSUPPORTED_FLOW_PATTERN');
    expect(result.errors.some((error) => error.details?.reason === 'implicit-fallthrough')).toBe(true);
  });

  it('accepts incomplete if branches when a proven return follows', async () => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`if (input.plan === 'pro') {
    return { priceId: BILLING_PRICES.pro.priceId };
  }

  const price = BILLING_PRICES[input.plan];
  return { priceId: price.priceId };`),
    });

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('accepts if branches that terminate with return or throw', async () => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`if (input.plan === 'pro') {
    return { priceId: BILLING_PRICES.pro.priceId };
  } else {
    throw new Error('Unsupported plan');
  }`),
    });

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('rejects if else branches that can fall through at function end', async () => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`if (input.plan === 'pro') {
    return { priceId: BILLING_PRICES.pro.priceId };
  } else {
    const plan = input.plan;
  }`),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT014_UNSUPPORTED_FLOW_PATTERN');
  });

  it('rejects switches that can fall through without a proven return', async () => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`switch (input.plan) {
    case 'pro':
      return { priceId: BILLING_PRICES.pro.priceId };
  }`),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT014_UNSUPPORTED_FLOW_PATTERN');
  });

  it('accepts switches when every case and default terminates', async () => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`switch (input.plan) {
    case 'pro':
      return { priceId: BILLING_PRICES.pro.priceId };
    case 'team':
      throw new Error('Unsupported plan');
    default:
      throw new Error('Unknown plan');
  }`),
    });

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('accepts empty switch case fallthrough into a terminating case', async () => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`switch (input.plan) {
    case 'pro':
    case 'team':
      return { priceId: BILLING_PRICES.pro.priceId };
    default:
      throw new Error('Unknown plan');
  }`),
    });

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('rejects non-empty switch case fallthrough as unsupported', async () => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`switch (input.plan) {
    case 'pro':
      const price = BILLING_PRICES.pro;
    case 'team':
      return { priceId: BILLING_PRICES.pro.priceId };
    default:
      throw new Error('Unknown plan');
  }`),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT014_UNSUPPORTED_FLOW_PATTERN');
    expect(result.errors.some((error) => error.details?.reason === 'unsupported-switch-fallthrough')).toBe(true);
  });

  it('accepts incomplete switches when a proven return follows', async () => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`switch (input.plan) {
    case 'pro':
      return { priceId: BILLING_PRICES.pro.priceId };
  }

  const price = BILLING_PRICES[input.plan];
  return { priceId: price.priceId };`),
    });

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('accepts switch breaks when a proven return follows', async () => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`switch (input.plan) {
    case 'pro':
      break;
    case 'team':
      break;
  }

  const price = BILLING_PRICES[input.plan];
  return { priceId: price.priceId };`),
    });

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('rejects unsupported nested return control flow instead of ignoring it', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource().replace(
        'const price = BILLING_PRICES[payload.plan];',
        `const price = BILLING_PRICES[payload.plan];
  try {
    return { priceId: 'price_fallback', amount: 1, currency: 'USD' };
  } catch {}`,
      ),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT014_UNSUPPORTED_FLOW_PATTERN');
  });

  it('rejects unsupported unbraced branch returns instead of ignoring them', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource().replace(
        'const price = BILLING_PRICES[payload.plan];',
        `const price = BILLING_PRICES[payload.plan];
  if (payload.plan === 'pro')
    try {
      return { priceId: 'price_fallback', amount: 1, currency: 'USD' };
    } catch {}`,
      ),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT014_UNSUPPORTED_FLOW_PATTERN');
  });

  it('proves ssot flow for const arrow function contracts', async () => {
    const root = await createProject({ 'src/actions.ts': validConstArrowFlowSource() });

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('proves ssot flow for expression-bodied arrow contracts', async () => {
    const root = await createProject({ 'src/actions.ts': validExpressionArrowFlowSource() });

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('detects local values that bypass ssot flow', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource().replace(
        "const price = BILLING_PRICES[payload.plan];",
        `const price = {
    priceId: 'test',
    monthlyAmount: 10,
    currency: 'USD',
  };`,
      ),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT013_SSOT_FLOW_NOT_PROVEN');
  });

  it('annotates untrusted ssot flow sinks with the returned source expression', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource().replace('priceId: price.priceId,', "priceId: 'price_hardcoded',"),
    });

    const result = await checkContracts({ root });
    const untrustedSink = result.errors.find((error) => error.details?.sink === 'return.priceId');

    expect(untrustedSink).toMatchObject({
      code: 'DRIFT013_SSOT_FLOW_NOT_PROVEN',
      details: {
        reason: 'untrusted-value',
        foundExpression: "'price_hardcoded'",
        foundNodeKind: 'StringLiteral',
      },
    });
  });

  it('detects unsupported ssot flow helper calls', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource().replace('const price = BILLING_PRICES[payload.plan];', 'const price = resolvePrice(payload.plan);'),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT014_UNSUPPORTED_FLOW_PATTERN');
  });

  it('rejects ssot flow expressions that can discard the trusted value', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource()
        .replace('priceId: price.priceId,', "priceId: (price.priceId, 'price_local_hotfix'),")
        .replace('currency: price.currency,', "currency: price.currency ?? 'USD',"),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT014_UNSUPPORTED_FLOW_PATTERN');
  });

  it('detects missing nested ssot flow sinks', async () => {
    const root = await createProject({
      'src/actions.ts': validNestedFlowSource().replace('amount: amount,', 'total: amount,'),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT013_SSOT_FLOW_NOT_PROVEN');
  });

  it('annotates missing sinks with a stable ssot-flow reason', async () => {
    const root = await createProject({
      'src/actions.ts': validNestedFlowSource().replace('amount: amount,', 'total: amount,'),
    });

    const result = await checkContracts({ root });
    const missingSink = result.errors.find((error) => error.details?.sink === 'return.totals.monthly.amount');
    expect(missingSink).toMatchObject({
      code: 'DRIFT013_SSOT_FLOW_NOT_PROVEN',
      message:
        'DRIFT013: Contract "billing.create-checkout-session" requires sink "return.totals.monthly.amount" to derive from ssot "pricing".',
      details: { reason: 'missing-sink' },
    });
    expect(missingSink?.details).not.toHaveProperty('foundExpression');
    expect(missingSink?.details).not.toHaveProperty('foundNodeKind');
  });

  it('rejects unsupported awaited ssot flow sink expressions', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource().replace('priceId: price.priceId,', 'priceId: await resolvePriceId(price),'),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT014_UNSUPPORTED_FLOW_PATTERN');
    expect(result.errors.find((error) => error.details?.reason === 'unsupported-call')).toMatchObject({
      details: {
        foundExpression: 'await resolvePriceId(price)',
        foundNodeKind: 'AwaitExpression',
      },
    });
  });

  it('treats parameters that shadow trusted imports as untrusted', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource()
        .replace('export async function createCheckoutSession(input: unknown) {', 'export async function createCheckoutSession(BILLING_PRICES: any) {')
        .replace('const payload = parseCheckoutInput(input);', 'const payload = parseCheckoutInput({ plan: "pro", seats: 1 });'),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT013_SSOT_FLOW_NOT_PROVEN');
  });

  it('rejects delete mutations in ssot flow bodies', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource().replace(
        'const price = BILLING_PRICES[payload.plan];',
        `const price = BILLING_PRICES[payload.plan];
  delete price.priceId;`,
      ),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT014_UNSUPPORTED_FLOW_PATTERN');
  });

  it('rejects invalid ssot flow sinks', () => {
    const result = extractContractsFromSource(
      'src/actions.ts',
      validFlowSource().replace('      - return.priceId', '      - checkout.priceId'),
    );

    expect(result.errors.map((error) => error.code)).toContain('DRIFT004_INVALID_FIELD_VALUE');
  });

  it('rejects collection wildcard ssot flow sinks in the P0 schema', () => {
    const result = extractContractsFromSource(
      'src/actions.ts',
      validFlowSource().replace('      - return.priceId', '      - return.items[].priceId'),
    );

    expect(result.errors.map((error) => error.code)).toContain('DRIFT004_INVALID_FIELD_VALUE');
  });

  it('requires sinks for ssot flow invariants', () => {
    const result = extractContractsFromSource(
      'src/actions.ts',
      validFlowSource().replace(`    sinks:
      - return.priceId
      - return.amount
      - return.currency
`, ''),
    );

    expect(result.errors.map((error) => error.code)).toContain('DRIFT004_INVALID_FIELD_VALUE');
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

  it('detects locked contract changes against the committed index', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));

    await writeFile(
      path.join(root, 'src/actions.ts'),
      validActionsSource().replace('the Pro subscription.', 'the Premium subscription.'),
      'utf8',
    );

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT011_LOCKED_CONTRACT_CHANGED');
  });

  it('detects locked contract downgrades against the committed index', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));

    await writeFile(path.join(root, 'src/actions.ts'), validActionsSource().replace('stability: locked', 'stability: draft'), 'utf8');

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT011_LOCKED_CONTRACT_CHANGED');
  });

  it('detects locked contract removals against the committed index', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));

    await writeFile(
      path.join(root, 'src/actions.ts'),
      `export async function createCheckoutSession(input: unknown) {
  return { payload: input, price: 'price_pro' };
}
`,
      'utf8',
    );

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT011_LOCKED_CONTRACT_CHANGED');
  });

  it('accepts locked contract changes with a valid acceptance file', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));

    await writeFile(
      path.join(root, 'src/actions.ts'),
      validActionsSource().replace('the Pro subscription.', 'the Premium subscription.'),
      'utf8',
    );
    await mkdir(path.join(root, '.drift/accepted-contract-changes'), { recursive: true });
    await writeFile(
      path.join(root, '.drift/accepted-contract-changes/billing.create-checkout-session.md'),
      'contract: billing.create-checkout-session\nreason: Product terminology changed intentionally.\n',
      'utf8',
    );

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('renders context for a target file', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const result = await renderContext(root, 'src/actions.ts');

    expect(result.errors).toEqual([]);
    expect(result.output).toContain('Relevant Drift Contracts');
    expect(result.output).toContain('billing.create-checkout-session');
    expect(result.output).toContain('pricing: @/features/billing/pricing.ts');
  });

  it('renders pre-plan task context from relevant contracts', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource('billing.create-checkout-session'),
      'src/other.ts': validActionsSource('support.unrelated-ticket')
        .replaceAll('billing', 'support')
        .replaceAll('pricing', 'queue')
        .replaceAll('Pricing', 'Queue')
        .replace('Create a Stripe Checkout session for the Pro subscription.', 'Send support ticket notifications.'),
    });
    const result = await renderTaskContext({ root, task: 'add yearly billing pricing plan' });

    expect(result.errors).toEqual([]);
    expect(result.output).toContain('Drift Context For Task');
    expect(result.output).toContain('Task:\nadd yearly billing pricing plan');
    expect(result.output).toContain('- billing.create-checkout-session');
    expect(result.output).toContain('  stability: locked');
    expect(result.output).toContain('  ssot:');
    expect(result.output).toContain('    pricing: @/features/billing/pricing.ts');
    expect(result.output).toContain('    - checkout-price-from-pricing: drift/ssot-flow ssot=pricing sinks=return.priceId, return.amount');
    expect(result.output).toContain('Relevant Files:');
    expect(result.output).toContain('- @/features/billing/pricing.ts');
    expect(result.output).toContain('- src/actions.ts');
    expect(result.output).not.toContain('support.unrelated-ticket');
    expect(result.output).toContain('Planning Notes:');
    expect(result.output).toContain('- Run drift-lock diff --summary after implementation.');
  });

  it('resolves relative ssot paths in task context relevant files', async () => {
    const root = await createProject({
      'src/features/billing/actions.ts': validFlowSource('billing.create-checkout-session').replace(
        'pricing: "@/features/billing/pricing.ts"',
        'pricing: "./pricing.ts"',
      ),
    });
    const result = await renderTaskContext({ root, task: 'change billing pricing' });

    expect(result.errors).toEqual([]);
    expect(result.output).toContain('    pricing: ./pricing.ts');
    expect(result.output).toContain('- src/features/billing/actions.ts');
    expect(result.output).toContain('- src/features/billing/pricing.ts');
    expect(result.output).not.toContain('- ./pricing.ts');
  });

  it('renders explicit empty task context when no contracts match', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const result = await renderTaskContext({ root, task: 'rename dashboard navigation labels' });

    expect(result.errors).toEqual([]);
    expect(result.output).toContain('No relevant @drift contracts found for this task.');
    expect(result.output).toContain('No relevant files found.');
    expect(result.output).toContain('Planning Notes:');
  });

  it('reports Drift coverage for required files and invariants', async () => {
    const root = await createProject({
      'src/features/billing/actions.ts': validActionsSource('billing.actions'),
      'src/features/billing/pricing.ts': 'export const PRO_PRICE_ID = "price_pro";\n',
      'src/services/payment.ts': 'export function pay() { return true; }\n',
    });

    const result = await getCoverage({
      root,
      requireContracts: ['src/features/**/actions.ts', 'src/services/**/*.ts'],
    });

    expect(result.errors).toEqual([]);
    expect(result.coverage).toMatchObject({
      contracts: { total: 1, locked: 1, draft: 0 },
      files: {
        source: 3,
        withContracts: 1,
        requiringContracts: 2,
        requiredCovered: 1,
        requiredUncovered: 1,
        requiredUncoveredFiles: ['src/services/payment.ts'],
      },
      invariants: { total: 2, executable: 2 },
    });
  });

  it('explains missing ssot-flow sinks with actionable diagnostics', async () => {
    const root = await createProject({
      'src/actions.ts': validNestedFlowSource().replace('amount: amount,', 'total: amount,'),
    });

    const result = await explainContracts({ root });
    const explanation = result.explanations.find((item) => item.sink === 'return.totals.monthly.amount');

    expect(explanation).toMatchObject({
      code: 'DRIFT013_SSOT_FLOW_NOT_PROVEN',
      contractId: 'billing.create-checkout-session',
      invariantId: 'checkout-price-from-pricing',
      sink: 'return.totals.monthly.amount',
      ssot: 'pricing -> @/features/billing/pricing.ts',
      reason: 'missing-sink',
      expected: 'Sink "return.totals.monthly.amount" should derive from ssot "pricing".',
      found: 'Sink "return.totals.monthly.amount" is missing from the returned object.',
      suggestedFix: 'Add "return.totals.monthly.amount" to the returned object and derive it from the declared SSOT.',
    });
  });

  it('explains ssot-flow sink failures with the exact found expression', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource().replace('priceId: price.priceId,', "priceId: 'price_hardcoded',"),
    });

    const result = await explainContracts({ root });
    const explanation = result.explanations.find((item) => item.sink === 'return.priceId');
    const output = formatExplanations(result.explanations);

    expect(explanation).toMatchObject({
      code: 'DRIFT013_SSOT_FLOW_NOT_PROVEN',
      sink: 'return.priceId',
      reason: 'untrusted-value',
      foundExpression: "'price_hardcoded'",
      foundNodeKind: 'StringLiteral',
      found: "return.priceId = 'price_hardcoded'",
    });
    expect(output).toContain("Found:\nreturn.priceId = 'price_hardcoded'");
  });

  it('explains unsupported switch fallthrough with a dedicated fix', async () => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`switch (input.plan) {
    case 'pro':
      const price = BILLING_PRICES.pro;
    case 'team':
      return { priceId: BILLING_PRICES.pro.priceId };
    default:
      throw new Error('Unknown plan');
  }`),
    });

    const result = await explainContracts({ root });

    expect(result.explanations).toEqual([
      expect.objectContaining({
        code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
        reason: 'unsupported-switch-fallthrough',
        found: 'A non-empty switch case can fall through into another case.',
        suggestedFix: 'Use return, throw, break, or an intentionally empty case before the next terminating case.',
      }),
    ]);
  });

  it('explains required files without contracts', async () => {
    const root = await createProject({
      'src/features/billing/actions.ts': 'export const checkoutAction = true;\n',
    });

    const result = await explainContracts({ root, requireContracts: ['src/features/**/actions.ts'] });

    expect(result.explanations).toEqual([
      expect.objectContaining({
        code: 'DRIFT015_REQUIRED_CONTRACT_MISSING',
        file: 'src/features/billing/actions.ts',
        expected:
          'File "src/features/billing/actions.ts" should contain a valid @drift contract because it matches "src/features/**/actions.ts".',
        found: 'No valid @drift contract was extracted for this file.',
        suggestedFix:
          'Add an @drift contract to the file, or remove the file from requireContracts if it is not a critical Drift-protected surface.',
      }),
    ]);
  });

  it('explains generic ssot usage errors and filters by contract id', async () => {
    const root = await createProject({
      'src/actions.ts': validActionsSource('billing.create-checkout-session').replace(
        "import { PRO_PRICE_ID } from '@/features/billing/pricing';\n",
        '',
      ),
      'src/other.ts': validActionsSource('billing.other-checkout-session').replace(
        "import { PRO_PRICE_ID } from '@/features/billing/pricing';\n",
        '',
      ),
    });

    const result = await explainContracts({ root, contractId: 'billing.other-checkout-session' });

    expect(result.explanations).toHaveLength(1);
    expect(result.explanations[0]).toMatchObject({
      code: 'DRIFT010_SSOT_NOT_USED',
      contractId: 'billing.other-checkout-session',
      expected: 'The anchored code should reference ssot "pricing" at "@/features/billing/pricing.ts".',
      found: 'No reference to the declared SSOT was found in the anchored code.',
    });
  });

  it('formats explanations for humans', async () => {
    const root = await createProject({
      'src/actions.ts': validNestedFlowSource().replace('amount: amount,', 'total: amount,'),
    });

    const result = await explainContracts({ root });
    const output = formatExplanations(result.explanations);

    expect(output).toContain('Drift violation:');
    expect(output).toContain('Sink: return.totals.monthly.amount');
    expect(output).toContain('Reason: missing-sink');
    expect(formatExplanations([])).toBe('No Drift violations found.');
  });

  it('writes a stable index without generatedAt', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));

    const index = await readFile(path.join(root, '.drift/contracts.generated.json'), 'utf8');
    expect(index).not.toContain('generatedAt');
    expect(JSON.parse(index).contracts[0]).not.toHaveProperty('raw');
    expect(JSON.parse(index).contracts[0].bodyHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('summarizes added changed and removed contracts against the Drift index', async () => {
    const root = await createProject({
      'src/changed.ts': validActionsSource('billing.changed'),
      'src/removed.ts': validActionsSource('billing.removed'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await writeFile(
      path.join(root, 'src/changed.ts'),
      validActionsSource('billing.changed')
        .replace('the Pro subscription.', 'the Enterprise subscription.')
        .replace('pricing: "@/features/billing/pricing.ts"', 'pricing: "@/features/billing/pricing-v2.ts"'),
      'utf8',
    );
    await writeFile(path.join(root, 'src/removed.ts'), 'export const removed = true;\n', 'utf8');
    await writeFile(path.join(root, 'src/added.ts'), validActionsSource('billing.added'), 'utf8');

    const result = await diffContracts({ root });
    const summary = formatContractDiffSummary(result.diff);

    expect(result.errors).toEqual([]);
    expect(result.diff.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'billing.changed', kind: 'changed', fields: expect.arrayContaining(['intent', 'ssot']) }),
      expect.objectContaining({ id: 'billing.added', kind: 'added', fields: [] }),
      expect.objectContaining({ id: 'billing.removed', kind: 'removed', fields: [] }),
    ]));
    expect(summary).toContain('billing.changed (changed)');
    expect(summary).toContain('fields: intent, ssot');
  });

  it('summarizes invariant ssot and sink changes semantically', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource('billing.changed'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed')
        .replace('    ssot: pricing', '    ssot: schema')
        .replace(`      - return.priceId
      - return.amount
      - return.currency`, `      - return.currency
      - return.priceId
      - return.tax`),
      'utf8',
    );

    const result = await diffContracts({ root });
    const summary = formatContractDiffSummary(result.diff);

    expect(result.diff.changes).toEqual([
      expect.objectContaining({
        id: 'billing.changed',
        fields: expect.arrayContaining(['invariants']),
        invariantChanges: [
          expect.objectContaining({
            id: 'checkout-price-from-pricing',
            kind: 'changed',
            fields: ['ssot', 'sinks'],
            sinksAdded: ['return.tax'],
            sinksRemoved: ['return.amount'],
          }),
        ],
      }),
    ]);
    expect(summary).toContain('  invariants:');
    expect(summary).toContain('    ~ checkout-price-from-pricing');
    expect(summary).toContain('      ssot: pricing -> schema');
    expect(summary).toContain('      sinks added:');
    expect(summary).toContain('        + return.tax');
    expect(summary).toContain('      sinks removed:');
    expect(summary).toContain('        - return.amount');
  });

  it('summarizes added and removed invariants semantically', async () => {
    const root = await createProject({
      'src/actions.ts': validActionsSource('billing.changed'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validActionsSource('billing.changed')
        .replace(`  - id: validates-input
    enforce: drift/ssot-usage
    ssot: schema
`, `  - id: validates-output
    enforce: drift/ssot-usage
    ssot: pricing
`),
      'utf8',
    );

    const result = await diffContracts({ root });
    const summary = formatContractDiffSummary(result.diff);

    expect(result.diff.changes[0]).toMatchObject({
      invariantChanges: [
        { id: 'validates-output', kind: 'added', enforce: 'drift/ssot-usage' },
        { id: 'validates-input', kind: 'removed', enforce: 'drift/ssot-usage' },
      ],
    });
    expect(summary).toContain('    + validates-output');
    expect(summary).toContain('      ssot: pricing');
    expect(summary).toContain('    - validates-input');
    expect(summary).toContain('      ssot: schema');
  });

  it('does not report invariant changes when sinks are reordered', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource('billing.changed'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed').replace(`      - return.priceId
      - return.amount
      - return.currency`, `      - return.currency
      - return.amount
      - return.priceId`),
      'utf8',
    );

    const result = await diffContracts({ root });

    expect(result.diff.changes[0]).toMatchObject({
      id: 'billing.changed',
      fields: [],
    });
    expect(result.diff.changes[0]?.invariantChanges).toBeUndefined();
  });

  it('reports invariant block reorders explicitly', async () => {
    const baselineSource = validActionsSource('billing.changed');
    const reorderedSource = reorderActionInvariantBlocks(baselineSource);
    expect(reorderedSource).not.toBe(baselineSource);

    const root = await createProject({
      'src/actions.ts': baselineSource,
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await writeFile(path.join(root, 'src/actions.ts'), reorderedSource, 'utf8');

    const result = await diffContracts({ root });
    const summary = formatContractDiffSummary(result.diff);

    expect(result.diff.changes[0]).toMatchObject({
      id: 'billing.changed',
      fields: ['invariants'],
      invariantChanges: [
        {
          id: '__order__',
          kind: 'reordered',
          previousOrder: ['uses-pricing-ssot', 'validates-input'],
          currentOrder: ['validates-input', 'uses-pricing-ssot'],
        },
      ],
    });
    expect(summary).toContain('    ~ invariant order changed');
    expect(summary).toContain('      previous: uses-pricing-ssot, validates-input');
    expect(summary).toContain('      current: validates-input, uses-pricing-ssot');
  });

  it('does not report semantic no-op diffs when ssot keys are reordered', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validActionsSource().replace(
        `ssot:
  pricing: "@/features/billing/pricing.ts"
  schema: "@/features/billing/billing.schema.ts"`,
        `ssot:
  schema: "@/features/billing/billing.schema.ts"
  pricing: "@/features/billing/pricing.ts"`,
      ),
      'utf8',
    );

    const diff = await diffContracts({ root });
    const changedOnly = await checkContracts({ root, changedOnly: true });

    expect(diff.diff.changes).toEqual([]);
    expect(changedOnly.errors).toEqual([]);
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
    await writeIndex(root, undefined, toIndex(extracted.contracts));
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

  it('limits contract diffs to files changed since a Git base', async () => {
    const root = await createProject({
      'src/changed.ts': validActionsSource('billing.changed'),
      'src/unchanged.ts': validActionsSource('billing.unchanged'),
      'src/removed.ts': validActionsSource('billing.removed'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await createGitBaseline(root);

    await writeFile(
      path.join(root, 'src/changed.ts'),
      validActionsSource('billing.changed').replace('the Pro subscription.', 'the Team subscription.'),
      'utf8',
    );
    await unlink(path.join(root, 'src/removed.ts'));

    const diff = await diffContracts({ root, gitBase: 'HEAD' });

    expect(diff.diff.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'billing.changed', kind: 'changed', fields: ['intent'] }),
      expect.objectContaining({ id: 'billing.removed', kind: 'removed' }),
    ]));
    expect(diff.diff.changes.some((change) => change.id === 'billing.unchanged')).toBe(false);
  });

  it('checks Git-scoped SSOT impacts and ignores unrelated pre-existing drift', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource().replace('priceId: price.priceId,', "priceId: 'price_hardcoded',"),
      'src/unchanged.ts': schemaOnlySource('billing.unchanged').replace(
        "import { billingSchema } from '@/features/billing/billing.schema';\n",
        '',
      ),
      'src/features/billing/pricing.ts': 'export const BILLING_PRICES = { pro: { priceId: "price", monthlyAmount: 10, currency: "usd" } };\n',
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await createGitBaseline(root);
    await writeFile(
      path.join(root, 'src/features/billing/pricing.ts'),
      'export const BILLING_PRICES = { pro: { priceId: "price_v2", monthlyAmount: 20, currency: "usd" } };\n',
      'utf8',
    );

    const result = await checkContracts({ root, changedOnly: true, gitBase: 'HEAD' });

    expect(result.contracts.map((contract) => contract.id)).toEqual(['billing.create-checkout-session']);
    expect(result.errors.map((error) => error.code)).toContain('DRIFT013_SSOT_FLOW_NOT_PROVEN');
    expect(result.errors.some((error) => error.contractId === 'billing.unchanged')).toBe(false);
  });

  it('rejects duplicate ids introduced outside the Git scope', async () => {
    const root = await createProject({
      'src/existing.ts': validActionsSource('billing.duplicate'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await createGitBaseline(root);
    await writeFile(path.join(root, 'src/new.ts'), validActionsSource('billing.duplicate'), 'utf8');
    await execFileAsync('git', ['add', 'src/new.ts'], { cwd: root });

    const result = await checkContracts({ root, changedOnly: true, gitBase: 'HEAD' });

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'DRIFT005_DUPLICATE_CONTRACT_ID',
        contractId: 'billing.duplicate',
        file: 'src/new.ts',
      }),
    ]);
  });

  it('does not report a Git-scoped duplicate for the same indexed file', async () => {
    const root = await createProject({
      'src/actions.ts': validActionsSource('billing.same-file'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await createGitBaseline(root);
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validActionsSource('billing.same-file').replace('the Pro subscription.', 'the Team subscription.'),
      'utf8',
    );

    const result = await checkContracts({ root, changedOnly: true, gitBase: 'HEAD' });

    expect(result.errors.some((error) => error.code === 'DRIFT005_DUPLICATE_CONTRACT_ID')).toBe(false);
  });

  it('treats contracts from legacy indexes without bodyHash as changed', async () => {
    const root = await createProject({ 'src/actions.ts': validFlowSource() });
    const extracted = await extractContracts({ root });
    const index = toIndex(extracted.contracts);
    await writeIndex(root, undefined, {
      ...index,
      contracts: index.contracts.map((contract) => {
        const legacy = { ...contract } as Record<string, unknown>;
        delete legacy.bodyHash;
        return legacy as (typeof index.contracts)[number];
      }),
    });

    const result = await diffContracts({ root });

    expect(result.diff.changes).toEqual([
      expect.objectContaining({ id: 'billing.create-checkout-session', fields: ['body'] }),
    ]);
  });

  it('keeps locked removals blocking when changedOnly is enabled', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await writeFile(path.join(root, 'src/actions.ts'), 'export const removed = true;\n', 'utf8');

    const result = await checkContracts({ root, changedOnly: true });

    expect(result.errors.map((error) => error.code)).toContain('DRIFT011_LOCKED_CONTRACT_CHANGED');
  });

  it('writes acceptance files and protects existing files', async () => {
    const root = await createProject({});
    const first = await writeAcceptanceFile({
      root,
      contractId: 'billing.create-checkout-session',
      reason: 'Product change accepted by the billing owner.',
    });

    await expect(
      writeAcceptanceFile({
        root,
        contractId: 'billing.create-checkout-session',
        reason: 'Product change accepted by the billing owner.',
      }),
    ).rejects.toThrow(/already exists/);
    await expect(
      writeAcceptanceFile({ root, contractId: 'billing.short', reason: 'too short' }),
    ).rejects.toThrow(/at least 20/);

    const content = await readFile(path.join(root, first.path), 'utf8');
    expect(content).toBe('contract: billing.create-checkout-session\nreason: Product change accepted by the billing owner.\n');
    await expect(
      writeAcceptanceFile({
        root,
        contractId: 'billing.create-checkout-session',
        reason: 'Updated product change accepted by owner.',
        force: true,
      }),
    ).resolves.toEqual(first);
  });

  it('rejects unsafe acceptance contract ids before writing files', async () => {
    const root = await createProject({});
    const unsafeIds = ['../../../tmp/foo', '../billing.escape', 'billing/escape', 'billing\\escape', 'billing..escape', 'billing escape'];

    expect(isValidContractId('billing.create-checkout-session')).toBe(true);
    for (const contractId of unsafeIds) {
      expect(isValidContractId(contractId)).toBe(false);
      await expect(
        writeAcceptanceFile({
          root,
          contractId,
          reason: 'Product change accepted by the billing owner.',
        }),
      ).rejects.toThrow(/Invalid contract id/);
    }

    await expect(readFile(path.join(root, '.drift/accepted-contract-changes/../../../tmp/foo.md'), 'utf8')).rejects.toThrow();
  });
});

async function createProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'drift-test-'));
  for (const [file, content] of Object.entries(files)) {
    const absoluteFile = path.join(root, file);
    await mkdir(path.dirname(absoluteFile), { recursive: true });
    await writeFile(absoluteFile, content, 'utf8');
  }
  return root;
}

async function createGitBaseline(root: string): Promise<void> {
  await execFileAsync('git', ['init'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'drift@example.com'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Drift Test'], { cwd: root });
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', 'baseline'], { cwd: root });
}

function validActionsSource(id = 'billing.create-checkout-session'): string {
  return `import { billingSchema } from '@/features/billing/billing.schema';
import { PRO_PRICE_ID } from '@/features/billing/pricing';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Create a Stripe Checkout session for the Pro subscription.

ssot:
  pricing: "@/features/billing/pricing.ts"
  schema: "@/features/billing/billing.schema.ts"

invariants:
  - id: uses-pricing-ssot
    enforce: drift/ssot-usage
    ssot: pricing
  - id: validates-input
    enforce: drift/ssot-usage
    ssot: schema

llm:
  must_not_change:
    - pricing source
    - accepted input shape
    - checkout flow
*/
export async function createCheckoutSession(input: unknown) {
  const payload = billingSchema.parse(input);
  return { payload, price: PRO_PRICE_ID };
}
`;
}

function reorderActionInvariantBlocks(source: string): string {
  return source.replace(
    `  - id: uses-pricing-ssot
    enforce: drift/ssot-usage
    ssot: pricing
  - id: validates-input
    enforce: drift/ssot-usage
    ssot: schema`,
    `  - id: validates-input
    enforce: drift/ssot-usage
    ssot: schema
  - id: uses-pricing-ssot
    enforce: drift/ssot-usage
    ssot: pricing`,
  );
}

function fileScopedUsageSource(): string {
  return `import { PRO_PRICE_ID } from '@/features/billing/pricing';

/* @drift
version: 1
id: billing.module-boundary
scope: file
stability: locked

intent: >
  Keep this billing module wired to the declared pricing source of truth.

ssot:
  pricing: "@/features/billing/pricing.ts"

invariants:
  - id: uses-pricing-ssot
    enforce: drift/ssot-usage
    ssot: pricing
*/
export const price = PRO_PRICE_ID;
`;
}

function schemaOnlySource(id = 'billing.schema-only'): string {
  return `import { billingSchema } from '@/features/billing/billing.schema';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Validate checkout input using the billing schema.

ssot:
  schema: "@/features/billing/billing.schema.ts"

invariants:
  - id: validates-input
    enforce: drift/ssot-usage
    ssot: schema
*/
export function validateCheckoutInput(input: unknown) {
  return billingSchema.parse(input);
}
`;
}

function validFlowSource(id = 'billing.create-checkout-session'): string {
  return `import { parseCheckoutInput } from '@/features/billing/billing.schema';
import { BILLING_PRICES } from '@/features/billing/pricing';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Create a Stripe Checkout session for the Pro subscription.

ssot:
  pricing: "@/features/billing/pricing.ts"
  schema: "@/features/billing/billing.schema.ts"

invariants:
  - id: checkout-price-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.priceId
      - return.amount
      - return.currency

llm:
  must_not_change:
    - pricing source
    - accepted input shape
    - checkout flow
*/
export async function createCheckoutSession(input: unknown) {
  const payload = parseCheckoutInput(input);
  const price = BILLING_PRICES[payload.plan];

  return {
    checkoutUrl: \`https://checkout.example.test/\${price.priceId}?seats=\${payload.seats}\`,
    priceId: price.priceId,
    amount: price.monthlyAmount * payload.seats,
    currency: price.currency,
  };
}
`;
}

function validNestedFlowSource(id = 'billing.create-checkout-session'): string {
  return `import { parseCheckoutInput } from '@/features/billing/billing.schema';
import { BILLING_PRICES } from '@/features/billing/pricing';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Create a Stripe Checkout session for the Pro subscription.

ssot:
  pricing: "@/features/billing/pricing.ts"

invariants:
  - id: checkout-price-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.lineItem.price.id
      - return.totals.monthly.amount
*/
export async function createCheckoutSession(input: unknown) {
  const payload = parseCheckoutInput(input);
  const price = BILLING_PRICES[payload.plan];
  const amount = price.monthlyAmount * payload.seats;

  return {
    lineItem: {
      price: {
        id: price.priceId,
      },
    },
    totals: {
      monthly: {
        amount: amount,
      },
    },
  };
}
`;
}

function validBranchFlowSource(id = 'billing.create-checkout-session'): string {
  return `import { BILLING_PRICES } from '@/features/billing/pricing';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Create a Stripe Checkout session for the selected subscription plan.

ssot:
  pricing: "@/features/billing/pricing.ts"

invariants:
  - id: checkout-price-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.priceId
*/
export function createCheckoutSession(input: { plan: 'pro' | 'team' }) {
  if (input.plan === 'pro') {
    const price = BILLING_PRICES.pro;
    return { priceId: price.priceId };
  }

  const price = BILLING_PRICES.team;
  return { priceId: price.priceId };
}
`;
}

function validConstArrowFlowSource(id = 'billing.create-checkout-session'): string {
  return `import { BILLING_PRICES } from '@/features/billing/pricing';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Create a Stripe Checkout session for the selected subscription plan.

ssot:
  pricing: "@/features/billing/pricing.ts"

invariants:
  - id: checkout-price-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.priceId
*/
export const createCheckoutSession = async (input: { plan: 'pro' }) => {
  const price = BILLING_PRICES[input.plan];
  return { priceId: price.priceId };
};
`;
}

function validExpressionArrowFlowSource(id = 'billing.create-checkout-session'): string {
  return `import { BILLING_PRICES } from '@/features/billing/pricing';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Create a Stripe Checkout session for the selected subscription plan.

ssot:
  pricing: "@/features/billing/pricing.ts"

invariants:
  - id: checkout-price-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.priceId
*/
export const createCheckoutSession = (input: { plan: 'pro' }) => ({
  priceId: BILLING_PRICES[input.plan].priceId,
});
`;
}

function flowSourceWithBody(body: string, id = 'billing.create-checkout-session'): string {
  return `import { BILLING_PRICES } from '@/features/billing/pricing';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Create a checkout response while proving return values come from pricing.

ssot:
  pricing: "@/features/billing/pricing.ts"

invariants:
  - id: checkout-price-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.priceId
*/
export function createCheckoutSession(input: { plan: 'pro' | 'team' }) {
  ${body}
}
`;
}
