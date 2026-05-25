import { isValidContractId } from './validator.js';

/* @drift
version: 1
id: core.acceptance-file
scope: file
stability: locked

intent: >
  Keep locked-contract acceptance file parsing and serialization on one shared,
  validated format.

ssot:
  validator: "./validator.ts"

invariants:
  - id: acceptance-uses-contract-id-validator
    enforce: drift/ssot-usage
    ssot: validator

llm:
  must_not_change:
    - Acceptance files must keep the contract and reason line format stable.
    - Contract ids must be validated through the shared contract id validator.
    - Reasons shorter than 20 characters must stay invalid.
*/
export type AcceptanceParseIssue =
  | 'missing-contract'
  | 'missing-reason'
  | 'short-reason'
  | 'invalid-contract-id';

export type AcceptanceParseResult =
  | { valid: true; contractId: string; reason: string }
  | { valid: false; issue: AcceptanceParseIssue; contractId?: string; reason?: string };

export type SerializeAcceptanceFileOptions = {
  contractId: string;
  reason: string;
};

export function serializeAcceptanceFile(options: SerializeAcceptanceFileOptions): string {
  const reason = options.reason.trim();
  validateAcceptanceInput(options.contractId, reason);
  return `contract: ${options.contractId}\nreason: ${reason}\n`;
}

export function parseAcceptanceFile(content: string): AcceptanceParseResult {
  const contractId = lineValue(content, 'contract');
  if (!contractId) return { valid: false, issue: 'missing-contract' };
  if (!isValidContractId(contractId)) return { valid: false, issue: 'invalid-contract-id', contractId };

  const reason = lineValue(content, 'reason');
  if (!reason) return { valid: false, issue: 'missing-reason', contractId };
  if (reason.length < 20) return { valid: false, issue: 'short-reason', contractId, reason };

  return { valid: true, contractId, reason };
}

export function isAcceptanceForContract(content: string, expectedContractId: string): boolean {
  const parsed = parseAcceptanceFile(content);
  return parsed.valid && parsed.contractId === expectedContractId;
}

function validateAcceptanceInput(contractId: string, reason: string): void {
  if (reason.length < 20) throw new Error('Acceptance reason must be at least 20 characters long.');
  if (!isValidContractId(contractId)) throw new Error(`Invalid contract id "${contractId}".`);
}

function lineValue(content: string, key: 'contract' | 'reason'): string | undefined {
  for (const line of content.split(/\r?\n/)) {
    const prefix = `${key}:`;
    if (!line.startsWith(prefix)) continue;
    const value = line.slice(prefix.length).trim();
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}
