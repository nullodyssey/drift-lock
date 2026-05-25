import { describe, expect, it } from 'vitest';
import { driftError, formatDiagnostics, formatErrors, toDiagnostic } from '../src/core/errors.js';

describe('drift error formatting', () => {
  it('formats errors with stable messages and locations', () => {
    const missingSsot = driftError(
      'DRIFT010_SSOT_NOT_USED',
      'src/actions.ts',
      { id: 'billing.create-checkout-session', ssotKey: 'pricing', ssotPath: './pricing.ts' },
      { line: 7, column: 3 },
    );
    const requiredContract = driftError(
      'DRIFT015_REQUIRED_CONTRACT_MISSING',
      'src/services/payment.ts',
      { pattern: 'src/**/*.ts' },
      { line: 2 },
    );
    const invalidYaml = driftError('DRIFT001_INVALID_YAML', 'src/bad.ts');

    expect(missingSsot).toMatchObject({
      code: 'DRIFT010_SSOT_NOT_USED',
      contractId: 'billing.create-checkout-session',
      file: 'src/actions.ts',
      line: 7,
      column: 3,
      details: { id: 'billing.create-checkout-session', ssotKey: 'pricing', ssotPath: './pricing.ts' },
    });
    expect(formatErrors([missingSsot, requiredContract, invalidYaml])).toBe([
      'src/actions.ts:7:3 DRIFT010: Contract "billing.create-checkout-session" requires ssot "pricing" but the anchored code does not reference "./pricing.ts".',
      'src/services/payment.ts:2:1 DRIFT015: File requires an @drift contract because it matches "src/**/*.ts".',
      'src/bad.ts DRIFT001: Invalid @drift YAML.',
    ].join('\n'));
  });

  it('formats diagnostic severity prefixes', () => {
    const lockedChange = driftError(
      'DRIFT011_LOCKED_CONTRACT_CHANGED',
      'src/actions.ts',
      { id: 'billing.create-checkout-session' },
      { line: 12, column: 1 },
    );

    expect(toDiagnostic(lockedChange)).toMatchObject({ severity: 'error' });
    expect(formatDiagnostics([
      toDiagnostic(lockedChange, 'info'),
      toDiagnostic(lockedChange, 'warning'),
      toDiagnostic(lockedChange, 'error'),
    ])).toBe([
      'INFO src/actions.ts:12:1 DRIFT011: Locked @drift contract "billing.create-checkout-session" changed without explicit acceptance.',
      'WARN src/actions.ts:12:1 DRIFT011: Locked @drift contract "billing.create-checkout-session" changed without explicit acceptance.',
      'ERROR src/actions.ts:12:1 DRIFT011: Locked @drift contract "billing.create-checkout-session" changed without explicit acceptance.',
    ].join('\n'));
  });
});
