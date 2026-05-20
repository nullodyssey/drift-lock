import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkContracts } from '@drift-lock/core';
import { renderContext } from '@drift-lock/core';
import { extractContracts, extractContractsFromSource } from '@drift-lock/core';
import { readDriftConfig, writeDriftConfig } from '@drift-lock/core';
import { toIndex, writeIndex } from '@drift-lock/core';

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
intent: Cree une session Checkout Stripe pour l'abonnement Pro.
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
    });

    await writeDriftConfig(root, {
      version: 1,
      source: 'app',
      index: '.drift/custom.generated.json',
    });

    await expect(readDriftConfig(root)).resolves.toEqual({
      version: 1,
      source: 'app',
      index: '.drift/custom.generated.json',
    });
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

  it('proves ssot flow for return sinks', async () => {
    const root = await createProject({ 'src/actions.ts': validFlowSource() });

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
      validActionsSource().replace("l'abonnement Pro.", "l'abonnement Premium."),
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
      validActionsSource().replace("l'abonnement Pro.", "l'abonnement Premium."),
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

  it('writes a stable index without generatedAt', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));

    const index = await readFile(path.join(root, '.drift/contracts.generated.json'), 'utf8');
    expect(index).not.toContain('generatedAt');
    expect(JSON.parse(index).contracts[0]).not.toHaveProperty('raw');
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

function validActionsSource(id = 'billing.create-checkout-session'): string {
  return `import { billingSchema } from '@/features/billing/billing.schema';
import { PRO_PRICE_ID } from '@/features/billing/pricing';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Cree une session Checkout Stripe pour l'abonnement Pro.

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

function validFlowSource(id = 'billing.create-checkout-session'): string {
  return `import { parseCheckoutInput } from '@/features/billing/billing.schema';
import { BILLING_PRICES } from '@/features/billing/pricing';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Cree une session Checkout Stripe pour l'abonnement Pro.

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
