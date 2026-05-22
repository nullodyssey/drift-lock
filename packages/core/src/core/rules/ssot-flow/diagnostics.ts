import ts from 'typescript';
import type { DriftError } from '../../../types.js';
import { driftError } from '../../errors.js';
import type { FlowContext, FlowErrorDetails, FlowReason } from './types.js';

/* @drift
version: 1
id: core.ssot-flow.diagnostics
scope: file
stability: draft

intent: >
  Build stable SSOT flow diagnostics and source-expression details for explain,
  CLI, ESLint, and agent workflows.

ssot:
  errors: "../../errors.ts"

invariants:
  - id: diagnostics-use-shared-error-factory
    enforce: drift/ssot-usage
    ssot: errors

llm:
  must_not_change:
    - DRIFT013 and DRIFT014 details.reason values must remain stable.
    - Source expression details must stay available for actionable explanations.
*/
export function unsupportedForSinks(
  context: FlowContext,
  sinks: string[],
  reason: FlowReason = 'unsupported-pattern',
  node?: ts.Node,
): DriftError[] {
  return sinks.map((sink) => unsupportedPattern(context, sink, reason, { nodeKind: node ? ts.SyntaxKind[node.kind] : undefined }));
}

export function flowNotProven(
  context: FlowContext,
  sink: string,
  reason: FlowReason = 'untrusted-value',
  details: FlowErrorDetails = {},
): DriftError {
  return driftError(
    'DRIFT013_SSOT_FLOW_NOT_PROVEN',
    context.contract.file,
    {
      id: context.contract.id,
      invariantId: context.invariant.id,
      ssotKey: context.invariant.ssot,
      sink,
      reason,
      ...details,
    },
    { line: context.contract.line, column: context.contract.column },
  );
}

export function unsupportedPattern(
  context: FlowContext,
  sink: string,
  reason: FlowReason = 'unsupported-pattern',
  details: FlowErrorDetails = {},
): DriftError {
  return driftError(
    'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
    context.contract.file,
    {
      id: context.contract.id,
      invariantId: context.invariant.id,
      ssotKey: context.invariant.ssot,
      sink,
      reason,
      ...details,
    },
    { line: context.contract.line, column: context.contract.column },
  );
}

export function sourceExpressionDetails(sourceFile: ts.SourceFile, expression: ts.Expression): FlowErrorDetails {
  return {
    foundExpression: expression.getText(sourceFile),
    foundNodeKind: ts.SyntaxKind[expression.kind],
  };
}
