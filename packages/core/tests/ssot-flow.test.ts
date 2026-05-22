import { describe, expect, it } from 'vitest';
import { checkContracts, extractContractsFromSource } from '@drift-lock/core';
import { createProject } from './helpers/core-test-utils.js';
import {
  flowSourceWithBody,
  validBranchFlowSource,
  validConstArrowFlowSource,
  validExpressionArrowFlowSource,
  validFlowSource,
  validNestedFlowSource,
} from './helpers/flow-fixtures.js';

describe('drift ssot flow', () => {
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

  it('rejects derived expressions that mix trusted values with unsupported helper calls', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource().replace('amount: price.monthlyAmount * payload.seats,', 'amount: price.monthlyAmount + resolveFee(payload),'),
    });

    const result = await checkContracts({ root });
    const amountError = result.errors.find((error) => error.details?.sink === 'return.amount');
    expect(amountError).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unsupported-call',
        foundExpression: 'price.monthlyAmount + resolveFee(payload)',
        foundNodeKind: 'BinaryExpression',
      },
    });
  });

  it('rejects template expressions that mix trusted values with unsupported helper calls', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource().replace('priceId: price.priceId,', 'priceId: `${price.priceId} ${resolveLabel(payload)}`,'),
    });

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.priceId')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unsupported-call',
        foundExpression: '`${price.priceId} ${resolveLabel(payload)}`',
        foundNodeKind: 'TemplateExpression',
      },
    });
  });

  it('rejects derived expressions that mix trusted values with awaited helper calls', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource().replace('amount: price.monthlyAmount * payload.seats,', 'amount: price.monthlyAmount + await resolveFee(payload),'),
    });

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.amount')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unsupported-call',
        foundExpression: 'price.monthlyAmount + await resolveFee(payload)',
        foundNodeKind: 'BinaryExpression',
      },
    });
  });

  it('keeps purely local derived expressions untrusted instead of unsupported', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource().replace('amount: price.monthlyAmount * payload.seats,', 'amount: payload.seats * 10,'),
    });

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.amount')).toMatchObject({
      code: 'DRIFT013_SSOT_FLOW_NOT_PROVEN',
      details: {
        reason: 'untrusted-value',
        foundExpression: 'payload.seats * 10',
        foundNodeKind: 'BinaryExpression',
      },
    });
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
});
