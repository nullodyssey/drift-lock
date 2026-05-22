import { describe, expect, it } from 'vitest';
import { explainContracts, formatExplanations } from '@drift-lock/core';
import { createProject } from './helpers/core-test-utils.js';
import { validActionsSource } from './helpers/contract-fixtures.js';
import { flowSourceWithBody, validFlowSource, validNestedFlowSource } from './helpers/flow-fixtures.js';

describe('drift explanations', () => {
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
});
