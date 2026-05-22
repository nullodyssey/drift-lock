import type { CheckOptions } from './checker.js';
import { checkContracts } from './checker.js';
import type { DriftError, DriftExtractedContract, DriftExplanation } from '../types.js';

/* @drift
version: 1
id: core.explain
scope: file
stability: locked

intent: >
  Convert current Drift violations into explanations that describe the expected
  behavior, observed drift, and actionable fix for humans and agents.

ssot:
  checker: "./checker.ts"

invariants:
  - id: explanations-from-check-results
    enforce: drift/ssot-usage
    ssot: checker

llm:
  must_not_change:
    - Explanations must derive from current check results.
    - SSOT flow explanations must include sink, reason, and suggested fix when available.
    - Empty explanation output must remain explicit.
*/
export type ExplainOptions = CheckOptions & {
  contractId?: string;
};

export async function explainContracts(options: ExplainOptions): Promise<{
  contracts: DriftExtractedContract[];
  errors: DriftError[];
  explanations: DriftExplanation[];
}> {
  const result = await checkContracts(options);
  const contracts = options.contractId ? result.contracts.filter((contract) => contract.id === options.contractId) : result.contracts;
  const errors = options.contractId
    ? result.errors.filter((error) => error.contractId === options.contractId || error.details?.id === options.contractId)
    : result.errors;
  const contractsById = new Map(result.contracts.map((contract) => [contract.id, contract]));

  return {
    contracts,
    errors,
    explanations: errors.map((error) => explainError(error, contractsById.get(error.contractId ?? String(error.details?.id ?? '')))),
  };
}

export function formatExplanations(explanations: DriftExplanation[]): string {
  if (explanations.length === 0) return 'No Drift violations found.';

  return explanations.map(formatExplanation).join('\n\n');
}

function formatExplanation(explanation: DriftExplanation): string {
  const lines = [
    'Drift violation:',
    `${explanation.code} ${explanation.contractId ?? 'unknown-contract'}`,
    '',
    `Location: ${formatLocation(explanation)}`,
  ];

  if (explanation.invariantId) lines.push(`Invariant: ${explanation.invariantId}`);
  if (explanation.sink) lines.push(`Sink: ${explanation.sink}`);
  if (explanation.ssot) lines.push(`SSOT: ${explanation.ssot}`);
  if (explanation.reason) lines.push(`Reason: ${explanation.reason}`);

  lines.push('', 'Expected:', explanation.expected, '', 'Found:', explanation.found, '', 'Suggested fix:', explanation.suggestedFix);
  return lines.join('\n');
}

function explainError(error: DriftError, contract?: DriftExtractedContract): DriftExplanation {
  const details = error.details ?? {};
  const contractId = error.contractId ?? stringDetail(details.id);
  const invariantId = stringDetail(details.invariantId);
  const sink = stringDetail(details.sink);
  const ssotKey = stringDetail(details.ssotKey);
  const ssotPath = ssotKey ? stringDetail(contract?.ssot?.[ssotKey]) ?? stringDetail(details.ssotPath) : stringDetail(details.ssotPath);
  const ssot = ssotKey ? (ssotPath ? `${ssotKey} -> ${ssotPath}` : ssotKey) : ssotPath;
  const reason = stringDetail(details.reason);
  const foundExpression = stringDetail(details.foundExpression);
  const foundNodeKind = stringDetail(details.foundNodeKind);

  const base = {
    code: error.code,
    message: error.message,
    file: error.file,
    line: error.line,
    column: error.column,
    contractId,
    contract: contract
      ? {
          id: contract.id,
          file: contract.file,
          stability: contract.stability,
        }
      : undefined,
    invariantId,
    sink,
    ssot,
    reason,
    foundExpression,
    foundNodeKind,
  };

  if (error.code === 'DRIFT010_SSOT_NOT_USED') {
    return {
      ...base,
      expected: `The anchored code should reference ssot "${ssotKey ?? 'unknown'}"${ssotPath ? ` at "${ssotPath}"` : ''}.`,
      found: `No reference to the declared SSOT was found in the anchored code.`,
      suggestedFix: `Read the critical value from the declared SSOT or update the contract if this code no longer depends on it.`,
    };
  }

  if (error.code === 'DRIFT011_LOCKED_CONTRACT_CHANGED') {
    return {
      ...base,
      expected: 'A locked contract should match the committed Drift index unless the change is explicitly accepted.',
      found: 'The locked contract changed without a valid acceptance file.',
      suggestedFix: `Restore the contract or add .drift/accepted-contract-changes/${contractId ?? '<contract-id>'}.md with a clear product reason.`,
    };
  }

  if (error.code === 'DRIFT012_INVALID_ACCEPTANCE_FILE') {
    return {
      ...base,
      expected: 'An acceptance file should reference the changed contract and include a reason of at least 20 characters.',
      found: 'The acceptance file is missing required content or references another contract.',
      suggestedFix: `Update .drift/accepted-contract-changes/${contractId ?? '<contract-id>'}.md with contract and reason fields.`,
    };
  }

  if (error.code === 'DRIFT013_SSOT_FLOW_NOT_PROVEN') {
    return {
      ...base,
      expected: `Sink "${sink ?? 'unknown'}" should derive from ssot "${ssotKey ?? 'unknown'}".`,
      found: foundForSsotFlow(reason, sink, foundExpression),
      suggestedFix: suggestedFixForSsotFlow(reason, sink),
    };
  }

  if (error.code === 'DRIFT014_UNSUPPORTED_FLOW_PATTERN') {
    return {
      ...base,
      expected: sink
        ? `Sink "${sink}" should be proven through a supported local ssot-flow pattern.`
        : 'The invariant should be proven through a supported local ssot-flow pattern.',
      found: foundForSsotFlow(reason, sink, foundExpression),
      suggestedFix: suggestedFixForSsotFlow(reason, sink),
    };
  }

  if (error.code === 'DRIFT015_REQUIRED_CONTRACT_MISSING') {
    return {
      ...base,
      expected: `File "${error.file}" should contain a valid @drift contract because it matches "${stringDetail(details.pattern) ?? 'a required contract pattern'}".`,
      found: 'No valid @drift contract was extracted for this file.',
      suggestedFix: 'Add an @drift contract to the file, or remove the file from requireContracts if it is not a critical Drift-protected surface.',
    };
  }

  return {
    ...base,
    expected: 'The @drift contract should satisfy the declared schema, anchor, stability and invariants.',
    found: error.message,
    suggestedFix: 'Use the DRIFT code and location to update the contract or the anchored code.',
  };
}

function foundForSsotFlow(reason: string | undefined, sink: string | undefined, foundExpression: string | undefined): string {
  if (foundExpression && sink) return `${sink} = ${foundExpression}`;
  if (foundExpression) return `Found expression: ${foundExpression}`;
  if (reason === 'missing-sink') return `Sink "${sink ?? 'unknown'}" is missing from the returned object.`;
  if (reason === 'untrusted-value') return `Sink "${sink ?? 'unknown'}" is assigned from a value that is not proven to derive from the SSOT.`;
  if (reason === 'unsupported-call') return `Sink "${sink ?? 'unknown'}" depends on a call, await, or constructor that Drift cannot prove locally.`;
  if (reason === 'unsupported-return') return 'A return path does not return a supported object literal.';
  if (reason === 'unsupported-spread') return 'The return object uses a spread that can hide or override critical sinks.';
  if (reason === 'unsupported-mutation') return 'The anchored flow mutates state, so local provenance is not reliable.';
  if (reason === 'implicit-fallthrough') return 'At least one control-flow path can finish without returning a proven object or explicitly terminating.';
  if (reason === 'unsupported-switch-fallthrough') return 'A non-empty switch case can fall through into another case.';
  return sink ? `Sink "${sink}" uses a pattern Drift cannot prove yet.` : 'The invariant uses a pattern Drift cannot prove yet.';
}

function suggestedFixForSsotFlow(reason: string | undefined, sink: string | undefined): string {
  if (reason === 'missing-sink') return `Add "${sink ?? 'the missing sink'}" to the returned object and derive it from the declared SSOT.`;
  if (reason === 'untrusted-value') return `Replace the local or hardcoded value with a value derived from the declared SSOT.`;
  if (reason === 'unsupported-call') return 'Inline the critical SSOT-derived value locally, or wait for helper provenance summaries before using this pattern.';
  if (reason === 'unsupported-return') return 'Return an object literal containing the declared sinks, or explicitly terminate paths that should not return.';
  if (reason === 'unsupported-spread') return 'Write critical return fields explicitly instead of relying on object spread.';
  if (reason === 'unsupported-mutation') return 'Keep the critical flow immutable with const aliases and explicit return fields.';
  if (reason === 'implicit-fallthrough') return 'Ensure every path either returns a proven object or terminates explicitly with throw/return.';
  if (reason === 'unsupported-switch-fallthrough') return 'Use return, throw, break, or an intentionally empty case before the next terminating case.';
  return 'Simplify the critical flow to supported const aliases, property access, derived expressions and explicit return fields.';
}

function formatLocation(explanation: DriftExplanation): string {
  return explanation.line ? `${explanation.file}:${explanation.line}:${explanation.column ?? 1}` : explanation.file;
}

function stringDetail(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
