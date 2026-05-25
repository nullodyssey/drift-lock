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

  it('rejects parser-named input helpers instead of trusting function names', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource().replace(
        "const payload = input as { plan: 'pro'; seats: number };",
        'const payload = parseCheckoutInput(input);',
      ),
    });

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.amount')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unsupported-call',
        foundExpression: 'price.monthlyAmount * payload.seats',
        foundNodeKind: 'BinaryExpression',
      },
    });
  });

  it('rejects parser-named helper aliases mixed with trusted values', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource()
        .replace('const price = BILLING_PRICES[payload.plan];', `const price = BILLING_PRICES[payload.plan];
  const fee = parseFee(payload);`)
        .replace('amount: price.monthlyAmount * payload.seats,', 'amount: price.monthlyAmount + fee,'),
    });

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.amount')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unsupported-call',
        nodeKind: 'CallExpression',
        foundExpression: 'price.monthlyAmount + fee',
        foundNodeKind: 'BinaryExpression',
      },
    });
  });

  it('proves helper calls with verified ssot-flow summaries', async () => {
    const root = await createProject(helperSummaryProject());

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('rejects helper calls without verified summaries', async () => {
    const files = helperSummaryProject();
    files['src/pricing.ts'] = helperSourceWithoutContract();
    const root = await createProject(files);

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.amount')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unverified-helper-call',
        foundExpression: 'price.monthlyAmount * input.seats',
        foundNodeKind: 'BinaryExpression',
      },
    });
  });

  it('rejects helper summary fields that are not declared as returned sinks', async () => {
    const files = helperSummaryProject();
    files['src/pricing.ts'] = verifiedHelperSource(['return.priceId']);
    const root = await createProject(files);

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.amount')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unverified-helper-call',
        foundExpression: 'price.monthlyAmount * input.seats',
        foundNodeKind: 'BinaryExpression',
      },
    });
  });

  it('rejects helper summaries for a different ssot path', async () => {
    const files = helperSummaryProject();
    files['src/actions.ts'] = helperCallSiteSource('./other-pricing-source.ts');
    const root = await createProject(files);

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.priceId')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unverified-helper-call',
      },
    });
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

  it('rejects trusted object destructuring until destructuring flow is explicit', async () => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`const price = BILLING_PRICES[input.plan];
  const { priceId } = price;
  return { priceId };`),
    });

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.priceId')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unsupported-pattern',
        foundExpression: 'priceId',
        foundNodeKind: 'Identifier',
      },
    });
  });

  it.each([
    ['rest destructuring', 'const { ...rest } = price;\n  return { priceId: rest.priceId };'],
    ['computed destructuring keys', 'const field = "priceId";\n  const { [field]: priceId } = price;\n  return { priceId };'],
    ['destructuring defaults', 'const { priceId = resolveFallback(input) } = price;\n  return { priceId };'],
    ['nested destructuring', 'const { nested: { priceId } } = price;\n  return { priceId };'],
  ])('rejects unsupported %s until destructuring support is explicit', async (_label, body) => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`const price = BILLING_PRICES[input.plan];
  ${body}`),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT014_UNSUPPORTED_FLOW_PATTERN');
  });

  it('keeps destructured values mixed with unsupported calls unsupported', async () => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`const price = BILLING_PRICES[input.plan];
  const { priceId } = price;
  return { priceId: priceId + resolveLabel(input) };`),
    });

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.priceId')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
    });
  });

  it('rejects trusted object spreads until resolvable spread support exists', async () => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`const price = BILLING_PRICES[input.plan];
  return {
    ...price,
    priceId: price.priceId,
  };`),
    });

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.priceId')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unsupported-spread',
      },
    });
  });

  it('rejects spreads that can overwrite an explicitly proven sink', async () => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`const price = BILLING_PRICES[input.plan];
  const override = { priceId: "price_local" };
  return {
    priceId: price.priceId,
    ...override,
  };`),
    });

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.priceId')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unsupported-spread',
      },
    });
  });

  it('rejects helper spreads until helper object keys and overwrite order are modeled', async () => {
    const root = await createProject({
      'src/actions.ts': flowSourceWithBody(`const price = resolvePrice(input.plan);
  return {
    ...price,
  };`),
    });

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.priceId')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unsupported-spread',
      },
    });
  });

  it('rejects inline array map callbacks until collection flow is explicit', async () => {
    const root = await createProject({
      'src/actions.ts': collectionFlowSourceWithBody(`const prices = BILLING_PRICES[input.plan].items;
  return {
    items: prices.map((price) => ({ priceId: price.priceId })),
  };`),
    });

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.items')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unsupported-call',
        foundNodeKind: 'CallExpression',
      },
    });
  });

  it.each([
    ['external callbacks', 'prices.map(buildLineItem)'],
    ['async callbacks', 'prices.map(async (price) => ({ priceId: price.priceId }))'],
    ['helper calls inside callbacks', 'prices.map((price) => buildLineItem(price))'],
  ])('rejects %s in array map collection flow', async (_label, expression) => {
    const root = await createProject({
      'src/actions.ts': collectionFlowSourceWithBody(`const prices = BILLING_PRICES[input.plan].items;
  return {
    items: ${expression},
  };`),
    });

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.items')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unsupported-call',
      },
    });
  });

  it('proves nested helper summary paths that are explicitly indexed', async () => {
    const root = await createProject(nestedHelperSummaryProject());

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('rejects nested helper summary sibling fields that are not indexed', async () => {
    const files = nestedHelperSummaryProject();
    files['src/actions.ts'] = nestedHelperCallSiteSource('./pricing-source.ts').replace(
      'priceId: summary.price.id,',
      'priceId: summary.price.localFallback,',
    );
    const root = await createProject(files);

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.priceId')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unverified-helper-call',
        foundExpression: 'summary.price.localFallback',
        foundNodeKind: 'PropertyAccessExpression',
      },
    });
  });

  it('rejects element access into helper summaries until collection summaries exist', async () => {
    const files = nestedHelperSummaryProject();
    files['src/pricing.ts'] = verifiedNestedHelperSource(['return.price.items.id']);
    files['src/actions.ts'] = nestedHelperCallSiteSource('./pricing-source.ts').replace(
      'priceId: summary.price.id,',
      'priceId: summary.price.items[0].id,',
    );
    const root = await createProject(files);

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.priceId')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unverified-helper-call',
      },
    });
  });

  it('keeps nested helper summaries mixed with unsupported dependencies unsupported', async () => {
    const files = nestedHelperSummaryProject();
    files['src/actions.ts'] = nestedHelperCallSiteSource('./pricing-source.ts').replace(
      'priceId: summary.price.id,',
      'priceId: summary.price.id + resolveLabel(input),',
    );
    const root = await createProject(files);

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.priceId')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unsupported-call',
        foundExpression: 'summary.price.id + resolveLabel(input)',
        foundNodeKind: 'BinaryExpression',
      },
    });
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

  it('proves ssot flow for named import aliases', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource()
        .replace(
          "import { BILLING_PRICES } from '@/features/billing/pricing';",
          "import { BILLING_PRICES as PRICES } from '@/features/billing/pricing';",
        )
        .replace('const price = BILLING_PRICES[payload.plan];', 'const price = PRICES[payload.plan];'),
    });

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('proves ssot flow for static namespace import access', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource()
        .replace(
          "import { BILLING_PRICES } from '@/features/billing/pricing';",
          "import * as pricing from '@/features/billing/pricing';",
        )
        .replace('const price = BILLING_PRICES[payload.plan];', 'const price = pricing.BILLING_PRICES[payload.plan];'),
    });

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('keeps default imports from ssot modules untrusted', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource()
        .replace(
          "import { BILLING_PRICES } from '@/features/billing/pricing';",
          "import pricing from '@/features/billing/pricing';",
        )
        .replace('const price = BILLING_PRICES[payload.plan];', 'const price = pricing.BILLING_PRICES[payload.plan];'),
    });

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.priceId')).toMatchObject({
      code: 'DRIFT013_SSOT_FLOW_NOT_PROVEN',
    });
  });

  it('keeps named default import aliases from ssot modules untrusted', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource()
        .replace(
          "import { BILLING_PRICES } from '@/features/billing/pricing';",
          "import { default as pricing } from '@/features/billing/pricing';",
        )
        .replace('const price = BILLING_PRICES[payload.plan];', 'const price = pricing.BILLING_PRICES[payload.plan];'),
    });

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.priceId')).toMatchObject({
      code: 'DRIFT013_SSOT_FLOW_NOT_PROVEN',
    });
  });

  it('rejects computed namespace import access as unsupported', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource()
        .replace(
          "import { BILLING_PRICES } from '@/features/billing/pricing';",
          "import * as pricing from '@/features/billing/pricing';",
        )
        .replace('const price = BILLING_PRICES[payload.plan];', `const key = 'BILLING_PRICES';
  const price = pricing[key][payload.plan];`),
    });

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.priceId')).toMatchObject({
      code: 'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
      details: {
        reason: 'unsupported-pattern',
      },
    });
  });

  it('treats parameters that shadow trusted imports as untrusted', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource()
        .replace('export async function createCheckoutSession(input: unknown) {', 'export async function createCheckoutSession(BILLING_PRICES: any) {')
        .replace("const payload = input as { plan: 'pro'; seats: number };", 'const payload = { plan: "pro" as const, seats: 1 };'),
    });

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT013_SSOT_FLOW_NOT_PROVEN');
  });

  it('treats local variables that shadow trusted imports as untrusted', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource().replace(
        'const price = BILLING_PRICES[payload.plan];',
        `const BILLING_PRICES = {
    pro: { priceId: 'price_local', monthlyAmount: 1000, currency: 'USD' },
  };
  const price = BILLING_PRICES[payload.plan];`,
      ),
    });

    const result = await checkContracts({ root });
    expect(result.errors.find((error) => error.details?.sink === 'return.priceId')).toMatchObject({
      code: 'DRIFT013_SSOT_FLOW_NOT_PROVEN',
    });
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
function helperSummaryProject(): Record<string, string> {
  return {
    'src/actions.ts': helperCallSiteSource('./pricing-source.ts'),
    'src/pricing.ts': verifiedHelperSource(['return.priceId', 'return.monthlyAmount', 'return.currency']),
    'src/pricing-source.ts': `export const BILLING_PRICES = {
  pro: { priceId: 'price_pro', monthlyAmount: 1000, currency: 'USD' },
};
`,
  };
}

function helperCallSiteSource(ssotPath: string): string {
  return `import { resolvePrice } from './pricing';

/* @drift
version: 1
id: billing.create-checkout-session
scope: declaration
stability: locked

intent: >
  Create a Stripe Checkout session from a helper-provided pricing summary.

ssot:
  pricing: "${ssotPath}"

invariants:
  - id: checkout-price-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.priceId
      - return.amount
      - return.currency
*/
export function createCheckoutSession(input: { plan: 'pro'; seats: number }) {
  const price = resolvePrice(input.plan);

  return {
    priceId: price.priceId,
    amount: price.monthlyAmount * input.seats,
    currency: price.currency,
  };
}
`;
}

function collectionFlowSourceWithBody(body: string, id = 'billing.create-checkout-session'): string {
  return `import { BILLING_PRICES } from '@/features/billing/pricing';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Create a checkout response while proving returned collection values come from pricing.

ssot:
  pricing: "@/features/billing/pricing.ts"

invariants:
  - id: checkout-items-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.items
*/
export function createCheckoutSession(input: { plan: 'pro' | 'team' }) {
  ${body}
}
`;
}

function nestedHelperSummaryProject(): Record<string, string> {
  return {
    'src/actions.ts': nestedHelperCallSiteSource('./pricing-source.ts'),
    'src/pricing.ts': verifiedNestedHelperSource(['return.price.id']),
    'src/pricing-source.ts': `export const BILLING_PRICES = {
  pro: { priceId: 'price_pro', monthlyAmount: 1000, currency: 'USD' },
};
`,
  };
}

function nestedHelperCallSiteSource(ssotPath: string): string {
  return `import { buildPriceSummary } from './pricing';

/* @drift
version: 1
id: billing.create-checkout-session
scope: declaration
stability: locked

intent: >
  Create a Stripe Checkout session from a nested helper-provided pricing summary.

ssot:
  pricing: "${ssotPath}"

invariants:
  - id: checkout-price-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.priceId
*/
export function createCheckoutSession(input: { plan: 'pro' }) {
  const summary = buildPriceSummary(input.plan);

  return {
    priceId: summary.price.id,
  };
}
`;
}

function verifiedNestedHelperSource(sinks: string[]): string {
  return `import { BILLING_PRICES } from './pricing-source';

/* @drift
version: 1
id: billing.build-price-summary
scope: declaration
stability: locked

intent: >
  Resolve a nested billing price summary from the pricing source of truth.

ssot:
  pricing: "./pricing-source.ts"

invariants:
  - id: return-price-summary-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
${sinks.map((sink) => `      - ${sink}`).join('\n')}
*/
export function buildPriceSummary(plan: 'pro') {
  const price = BILLING_PRICES[plan];
  return {
    price: {
      id: price.priceId,
      items: {
        id: price.priceId,
      },
    },
  };
}
`;
}

function verifiedHelperSource(sinks: string[]): string {
  return `import { BILLING_PRICES } from './pricing-source';

/* @drift
version: 1
id: billing.resolve-price
scope: declaration
stability: locked

intent: >
  Resolve the selected billing price from the pricing source of truth.

ssot:
  pricing: "./pricing-source.ts"

invariants:
  - id: return-price-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
${sinks.map((sink) => `      - ${sink}`).join('\n')}
*/
export function resolvePrice(plan: 'pro') {
  const price = BILLING_PRICES[plan];
  return {
    priceId: price.priceId,
    monthlyAmount: price.monthlyAmount,
    currency: price.currency,
  };
}
`;
}

function helperSourceWithoutContract(): string {
  return `import { BILLING_PRICES } from './pricing-source';

export function resolvePrice(plan: 'pro') {
  const price = BILLING_PRICES[plan];
  return {
    priceId: price.priceId,
    monthlyAmount: price.monthlyAmount,
    currency: price.currency,
  };
}
`;
}

});
