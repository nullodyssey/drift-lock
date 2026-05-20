import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuleTester } from 'eslint';
import * as parser from '@typescript-eslint/parser';
import { extractContractsFromSource, toIndex } from '@drift-core/core';
import plugin from '../src/index.js';
import { describe, expect, it } from 'vitest';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
});

const rules = plugin.rules;

it('exposes recommended rules under the drift-lock namespace', () => {
  expect(plugin.configs.recommended.plugins).toHaveProperty('drift-lock');
  expect(plugin.configs.recommended.rules).toMatchObject({
    'drift-lock/valid-contract': 'error',
    'drift-lock/ssot-usage': 'error',
    'drift-lock/ssot-flow': 'error',
    'drift-lock/no-locked-contract-change': 'error',
  });
});

ruleTester.run('valid-contract', rules['valid-contract'] as any, {
  valid: [
    {
      filename: 'src/actions.ts',
      code: validActionsSource(),
    },
    {
      filename: 'src/actions.ts',
      code: validActionsSource().replaceAll('\n', '\r\n'),
    },
  ],
  invalid: [
    {
      filename: 'src/actions.ts',
      code: `/* @drift
version: 1
id: billing.create-checkout-session
scope: declaration
kind: command
*/
export function createCheckoutSession() {}
`,
      errors: [{ message: /DRIFT002/ }, { message: /DRIFT003/ }, { message: /DRIFT003/ }],
    },
    {
      filename: 'src/actions.ts',
      code: `/* @drift
version: 1
id: billing.create-checkout-session
scope: declaration
stability: locked
intent: Create a Stripe Checkout session for the Pro subscription.
*/
if (true) {}
`,
      errors: [{ message: /DRIFT006/ }],
    },
    {
      filename: 'src/actions.ts',
      code: fileScopedFlowSource(),
      errors: [{ message: /DRIFT008/ }],
    },
  ],
});

ruleTester.run('ssot-usage', rules['ssot-usage'] as any, {
  valid: [
    {
      filename: 'src/actions.ts',
      code: validActionsSource(),
    },
    {
      filename: 'src/actions.ts',
      code: validActionsSource()
        .replace("ssot:\n  pricing: \"@/features/billing/pricing.ts\"", "ssot:\n  pricing: \"./pricing.ts\"")
        .replace("import { PRO_PRICE_ID } from '@/features/billing/pricing';", "import { PRO_PRICE_ID } from './pricing.js';"),
    },
  ],
  invalid: [
    {
      filename: 'src/actions.ts',
      code: validActionsSource().replace("import { PRO_PRICE_ID } from '@/features/billing/pricing';\n", ''),
      errors: [{ message: /DRIFT010/ }],
    },
  ],
});

ruleTester.run('ssot-flow', rules['ssot-flow'] as any, {
  valid: [
    {
      filename: 'src/actions.ts',
      code: validFlowSource(),
    },
  ],
  invalid: [
    {
      filename: 'src/actions.ts',
      code: validFlowSource().replace(
        "const price = BILLING_PRICES[payload.plan];",
        `const price = {
    priceId: 'test',
    monthlyAmount: 10,
    currency: 'USD',
  };`,
      ),
      errors: [{ message: /DRIFT013/ }, { message: /DRIFT013/ }, { message: /DRIFT013/ }],
    },
    {
      filename: 'src/actions.ts',
      code: validFlowSource().replace('const price = BILLING_PRICES[payload.plan];', 'const price = resolvePrice(payload.plan);'),
      errors: [{ message: /DRIFT014/ }, { message: /DRIFT014/ }, { message: /DRIFT014/ }],
    },
  ],
});

{
  const unchanged = createIndexedProject(validActionsSource());
  const changed = createIndexedProject(validActionsSource());
  const removed = createIndexedProject(validActionsSource());
  const accepted = createIndexedProject(validActionsSource());
  const invalidIndex = createProjectWithIndex('{<<<<<<< HEAD');
  mkdirSync(path.join(accepted.root, '.drift/accepted-contract-changes'), { recursive: true });
  writeFileSync(
    path.join(accepted.root, '.drift/accepted-contract-changes/billing.create-checkout-session.md'),
    'contract: billing.create-checkout-session\nreason: Product terminology changed intentionally.\n',
  );

  ruleTester.run('no-locked-contract-change', rules['no-locked-contract-change'] as any, {
    valid: [
      {
        filename: unchanged.filename,
        code: validActionsSource(),
        options: [{ root: unchanged.root }],
      },
      {
        filename: accepted.filename,
        code: validActionsSource().replace('the Pro subscription.', 'the Premium subscription.'),
        options: [{ root: accepted.root }],
      },
      {
        filename: 'src/actions.ts',
        code: validActionsSource().replace('the Pro subscription.', 'the Premium subscription.'),
      },
    ],
    invalid: [
      {
        filename: invalidIndex.filename,
        code: validActionsSource(),
        options: [{ root: invalidIndex.root }],
        errors: [{ message: /DRIFT_INDEX_INVALID/ }],
      },
      {
        filename: changed.filename,
        code: validActionsSource().replace('the Pro subscription.', 'the Premium subscription.'),
        options: [{ root: changed.root }],
        errors: [{ message: /DRIFT011/ }],
      },
      {
        filename: removed.filename,
        code: `export async function createCheckoutSession(input: unknown) {
  return { payload: input, price: 'price_pro' };
}
`,
        options: [{ root: removed.root }],
        errors: [{ message: /DRIFT011/ }],
      },
    ],
  });
}

function createIndexedProject(code: string): { root: string; filename: string } {
  const project = createProject();
  writeFileSync(project.filename, code);

  const extracted = extractContractsFromSource('src/actions.ts', code);
  writeFileSync(path.join(project.root, '.drift/contracts.generated.json'), `${JSON.stringify(toIndex(extracted.contracts), null, 2)}\n`);

  return project;
}

function createProjectWithIndex(index: string): { root: string; filename: string } {
  const project = createProject();
  writeFileSync(path.join(project.root, '.drift/contracts.generated.json'), index);
  return project;
}

function createProject(): { root: string; filename: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'drift-eslint-test-'));
  const filename = path.join(root, 'src/actions.ts');
  mkdirSync(path.dirname(filename), { recursive: true });
  mkdirSync(path.join(root, '.drift'), { recursive: true });
  return { root, filename };
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

function fileScopedFlowSource(): string {
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
  - id: checkout-price-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.priceId
*/
export const price = PRO_PRICE_ID;
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
