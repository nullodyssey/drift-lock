import { describe, expect, it } from 'vitest';
import { renderContext } from '@drift-lock/core';
import { createProject } from './helpers/core-test-utils.js';
import { validActionsSource } from './helpers/contract-fixtures.js';

// Task context was removed: predicting the relevant contracts from a prompt is
// structurally inexact (measured 10% precision / 89% recall over real commits, never
// the exact set). Context is file-scoped only — exact by construction.
describe('drift context rendering', () => {
  it('renders context for a target file', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const result = await renderContext(root, 'src/actions.ts');

    expect(result.errors).toEqual([]);
    expect(result.output).toContain('Relevant Drift Contracts');
    expect(result.output).toContain('billing.create-checkout-session');
    expect(result.output).toContain('pricing: @/features/billing/pricing.ts');
    expect(result.output).toBe([
      'Relevant Drift Contracts',
      '',
      '- billing.create-checkout-session',
      '  scope: declaration',
      '  stability: locked',
      '  intent: Create a Stripe Checkout session for the Pro subscription.',
      '  ssot:',
      '    pricing: @/features/billing/pricing.ts',
      '    schema: @/features/billing/billing.schema.ts',
      '  must_not_change:',
      '    - pricing source',
      '    - accepted input shape',
      '    - checkout flow',
    ].join('\n'));
  });

  it('stays scoped to the requested file when it carries no contracts', async () => {
    const root = await createProject({
      'src/actions.ts': validActionsSource(),
      'src/plain.ts': 'export const answer = 42;\n',
    });
    const result = await renderContext(root, 'src/plain.ts');

    expect(result.errors).toEqual([]);
    expect(result.output).toContain('No @drift contracts found for src/plain.ts.');
    expect(result.output).not.toContain('billing.create-checkout-session');
  });
});
