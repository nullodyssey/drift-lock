import ts from 'typescript';
import type { DriftError } from '../../../types.js';
import { flowNotProven, sourceExpressionDetails, unsupportedForSinks, unsupportedPattern } from './diagnostics.js';
import { applyVariableStatement, cloneEnv, expressionFlow, flowForObjectProperty } from './env.js';
import { parseReturnSinkPath } from './sinks.js';
import type { FlowCheckResult, FlowContext, FlowEnv, FlowReason, FlowValue, SinkPathSegment, SinkResolution } from './types.js';
import { trusted } from './types.js';

/* @drift
version: 1
id: core.ssot-flow.control
scope: file
stability: draft

intent: >
  Validate supported local control-flow and return expressions for SSOT flow
  provenance checks.

llm:
  must_not_change:
    - Every applicable return path must be proven or explicitly rejected.
    - Unsupported returns hidden in nested statements must not be ignored.
    - Switch fallthrough behavior must remain conservative and explainable.
*/
export function checkStatements(context: FlowContext, statements: ts.NodeArray<ts.Statement>, env: FlowEnv): FlowCheckResult {
  const errors: DriftError[] = [];
  let completed = false;
  let breaks = false;

  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      applyVariableStatement(statement, env);
      continue;
    }

    if (ts.isReturnStatement(statement)) {
      errors.push(...checkReturnStatement(context, statement, env));
      return { errors, completed: true, breaks, fallsThrough: false };
    }

    if (ts.isThrowStatement(statement)) {
      return { errors, completed: true, breaks, fallsThrough: false };
    }

    if (ts.isBreakStatement(statement)) {
      return { errors, completed, breaks: true, fallsThrough: false };
    }

    if (ts.isIfStatement(statement)) {
      const checked = checkIfStatement(context, statement, env);
      errors.push(...checked.errors);
      completed = checked.completed || completed;
      breaks = checked.breaks || breaks;
      if (!checked.fallsThrough) return { errors, completed, breaks, fallsThrough: false };
      continue;
    }

    if (ts.isSwitchStatement(statement)) {
      const checked = checkSwitchStatement(context, statement, env);
      errors.push(...checked.errors);
      completed = checked.completed || completed;
      breaks = checked.breaks || breaks;
      if (!checked.fallsThrough) return { errors, completed, breaks, fallsThrough: false };
      continue;
    }

    if (hasReturnOutsideNestedFunction(statement)) {
      errors.push(...unsupportedForSinks(context, context.invariant.sinks ?? [], 'unsupported-return'));
      return { errors, completed: true, breaks, fallsThrough: false };
    }
  }

  return { errors, completed, breaks, fallsThrough: true };
}

export function checkReturnExpression(context: FlowContext, expression: ts.Expression, env: FlowEnv): DriftError[] {
  const errors: DriftError[] = [];
  const sinks = context.invariant.sinks ?? [];
  const returnExpression = unwrapReturnExpression(expression);

  if (!ts.isObjectLiteralExpression(returnExpression)) {
    return unsupportedForSinks(context, sinks, 'unsupported-return', returnExpression);
  }

  for (const sink of sinks) {
    const path = parseReturnSinkPath(sink);
    if (!path) {
      errors.push(unsupportedPattern(context, sink, 'unsupported-pattern'));
      continue;
    }

    const property = resolveSinkExpression(returnExpression, path, env);
    const error = checkSinkResolution(context, sink, property, env);
    if (error) errors.push(error);
  }

  return errors;
}

function checkSinkResolution(context: FlowContext, sink: string, property: SinkResolution, env: FlowEnv): DriftError | undefined {
  if (property.kind === 'missing') {
    return flowNotProven(context, sink, 'missing-sink');
  }

  if (property.kind === 'unsupported') {
    return unsupportedPattern(
      context,
      sink,
      property.reason ?? 'unsupported-pattern',
      property.expression ? sourceExpressionDetails(context.sourceFile, property.expression) : {},
    );
  }

  if (property.kind === 'flow') {
    return flowError(context, sink, property.expression, property.flow);
  }

  if (property.kind === 'collection') {
    return checkCollectionSink(context, sink, property, env);
  }

  return flowErrorForExpression(context, sink, property.expression, env);
}

function checkCollectionSink(
  context: FlowContext,
  sink: string,
  property: Extract<SinkResolution, { kind: 'collection' }>,
  env: FlowEnv,
): DriftError | undefined {
  const collectionExpression = unwrapReturnExpression(property.expression);

  if (!ts.isCallExpression(collectionExpression)) {
    return unsupportedPattern(context, sink, 'unsupported-pattern', sourceExpressionDetails(context.sourceFile, collectionExpression));
  }

  const callee = collectionExpression.expression;
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'map') {
    return unsupportedPattern(context, sink, 'unsupported-call', sourceExpressionDetails(context.sourceFile, collectionExpression));
  }

  const receiverFlow = expressionFlow(callee.expression, env);
  const receiverError = flowError(context, sink, callee.expression, receiverFlow);
  if (receiverError) return receiverError;

  const [callback] = collectionExpression.arguments;
  if (!callback || collectionExpression.arguments.length !== 1 || !isSupportedMapCallback(callback)) {
    return unsupportedPattern(context, sink, 'unsupported-call', sourceExpressionDetails(context.sourceFile, collectionExpression));
  }

  if (callback.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
    return unsupportedPattern(context, sink, 'unsupported-call', sourceExpressionDetails(context.sourceFile, callback));
  }

  if (ts.isFunctionExpression(callback) && callback.asteriskToken) {
    return unsupportedPattern(context, sink, 'unsupported-call', sourceExpressionDetails(context.sourceFile, callback));
  }

  const [parameter] = callback.parameters;
  if (
    callback.parameters.length !== 1 ||
    !parameter ||
    !ts.isIdentifier(parameter.name) ||
    parameter.initializer ||
    parameter.dotDotDotToken
  ) {
    return unsupportedPattern(context, sink, 'unsupported-pattern', sourceExpressionDetails(context.sourceFile, callback));
  }

  if (hasUnsupportedMutation(callback.body)) {
    return unsupportedPattern(context, sink, 'unsupported-mutation', sourceExpressionDetails(context.sourceFile, callback.body));
  }

  const callbackEnv = cloneEnv(env);
  callbackEnv.set(parameter.name.text, trusted);
  const callbackReturn = mapCallbackReturnObject(callback, callbackEnv);

  if (callbackReturn.kind === 'unsupported') {
    return unsupportedPattern(
      context,
      sink,
      callbackReturn.reason,
      sourceExpressionDetails(context.sourceFile, callbackReturn.expression),
    );
  }

  const itemProperty = resolveSinkExpression(callbackReturn.expression, property.itemPath, callbackEnv);
  return checkSinkResolution(context, sink, itemProperty, callbackEnv);
}

function resolveSinkExpression(expression: ts.ObjectLiteralExpression, path: SinkPathSegment[], env: FlowEnv): SinkResolution {
  const [segment, ...rest] = path;
  if (!segment) return { kind: 'found', expression };

  let resolved: SinkResolution | undefined;

  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spreadResolution = resolveSpreadSegment(property.expression, segment, rest, env);
      if (spreadResolution.kind === 'unsupported') return spreadResolution;
      if (spreadResolution.kind !== 'missing') resolved = spreadResolution;
      continue;
    }

    if (ts.isPropertyAssignment(property)) {
      const match = propertyNameMatch(property.name, segment.name);
      if (match === 'match') {
        resolved = resolvePropertyAssignment(property.initializer, segment, rest, env);
        continue;
      }
      if (match === 'unknown' && resolved) {
        return { kind: 'unsupported', reason: 'unsupported-pattern', expression: property };
      }
      continue;
    }

    if (ts.isShorthandPropertyAssignment(property) && property.name.text === segment.name) {
      resolved = resolveShorthandProperty(property.name, segment, rest, env);
      continue;
    }

    if (ts.isMethodDeclaration(property) || ts.isGetAccessorDeclaration(property) || ts.isSetAccessorDeclaration(property)) {
      const match = propertyNameMatch(property.name, segment.name);
      if (match === 'match' || (match === 'unknown' && resolved)) {
        return { kind: 'unsupported', reason: 'unsupported-pattern', expression: property };
      }
    }
  }

  return resolved ?? { kind: 'missing' };
}

function resolvePropertyAssignment(
  initializer: ts.Expression,
  segment: SinkPathSegment,
  rest: SinkPathSegment[],
  env: FlowEnv,
): SinkResolution {
  if (segment.collection) return { kind: 'collection', expression: initializer, itemPath: rest };
  if (rest.length === 0) return { kind: 'found', expression: initializer };

  const nested = unwrapReturnExpression(initializer);
  if (ts.isObjectLiteralExpression(nested)) return resolveSinkExpression(nested, rest, env);

  const flow = expressionFlow(initializer, env);
  if (flow.objectSummary) return resolveFlowPath(flow, rest, initializer);
  return { kind: 'unsupported', reason: 'unsupported-pattern', expression: initializer };
}

function resolveShorthandProperty(
  expression: ts.Identifier,
  segment: SinkPathSegment,
  rest: SinkPathSegment[],
  env: FlowEnv,
): SinkResolution {
  if (segment.collection) return { kind: 'collection', expression, itemPath: rest };
  if (rest.length === 0) return { kind: 'found', expression };

  const flow = expressionFlow(expression, env);
  if (flow.objectSummary) return resolveFlowPath(flow, rest, expression);
  return { kind: 'unsupported', reason: 'unsupported-pattern', expression };
}

function resolveSpreadSegment(
  expression: ts.Expression,
  segment: SinkPathSegment,
  rest: SinkPathSegment[],
  env: FlowEnv,
): SinkResolution {
  const flow = expressionFlow(expression, env);
  if (!flow.objectSummary) return { kind: 'unsupported', reason: 'unsupported-spread', expression };
  if (segment.collection) return { kind: 'unsupported', reason: 'unsupported-spread', expression };
  return resolveFlowPath(flow, [segment, ...rest], expression, { missingKnownKey: 'missing', unsupportedReason: 'unsupported-spread' });
}

function resolveFlowPath(
  flow: FlowValue,
  path: SinkPathSegment[],
  expression: ts.Expression,
  options: { missingKnownKey?: 'missing' | 'unsupported'; unsupportedReason?: FlowReason } = {},
): SinkResolution {
  let current = flow;

  for (const segment of path) {
    if (segment.collection) return { kind: 'unsupported', reason: options.unsupportedReason ?? 'unsupported-pattern', expression };
    const summary = current.objectSummary;
    if (!summary) return { kind: 'unsupported', reason: options.unsupportedReason ?? 'unsupported-pattern', expression };
    if (summary.kind === 'known' && !Object.prototype.hasOwnProperty.call(summary.properties, segment.name)) {
      return options.missingKnownKey === 'missing'
        ? { kind: 'missing' }
        : { kind: 'unsupported', reason: options.unsupportedReason ?? 'unsupported-pattern', expression };
    }
    current = flowForObjectProperty(current, segment.name, expression);
  }

  return { kind: 'flow', flow: current, expression };
}

function flowErrorForExpression(context: FlowContext, sink: string, expression: ts.Expression, env: FlowEnv): DriftError | undefined {
  return flowError(context, sink, expression, expressionFlow(expression, env));
}

function flowError(context: FlowContext, sink: string, expression: ts.Expression, flow: FlowValue): DriftError | undefined {
  if (flow.trust === 'trusted') return undefined;
  const expressionDetails = sourceExpressionDetails(context.sourceFile, expression);
  return flow.trust === 'unsupported'
    ? unsupportedPattern(context, sink, flow.reason ?? 'unsupported-pattern', {
        nodeKind: flow.nodeKind,
        ...expressionDetails,
      })
    : flowNotProven(context, sink, 'untrusted-value', {
        nodeKind: flow.nodeKind,
        ...expressionDetails,
      });
}

function isSupportedMapCallback(expression: ts.Expression): expression is ts.ArrowFunction | ts.FunctionExpression {
  return ts.isArrowFunction(expression) || ts.isFunctionExpression(expression);
}

function mapCallbackReturnObject(
  callback: ts.ArrowFunction | ts.FunctionExpression,
  env: FlowEnv,
): { kind: 'found'; expression: ts.ObjectLiteralExpression } | { kind: 'unsupported'; reason: FlowReason; expression: ts.Node } {
  if (!ts.isBlock(callback.body)) {
    const expression = unwrapReturnExpression(callback.body);
    if (ts.isObjectLiteralExpression(expression)) return { kind: 'found', expression };
    return { kind: 'unsupported', reason: ts.isCallExpression(expression) ? 'unsupported-call' : 'unsupported-return', expression };
  }

  for (const statement of callback.body.statements) {
    if (ts.isVariableStatement(statement)) {
      applyVariableStatement(statement, env);
      continue;
    }

    if (ts.isReturnStatement(statement) && statement.expression) {
      const expression = unwrapReturnExpression(statement.expression);
      if (ts.isObjectLiteralExpression(expression)) return { kind: 'found', expression };
      return {
        kind: 'unsupported',
        reason: ts.isCallExpression(expression) ? 'unsupported-call' : 'unsupported-return',
        expression,
      };
    }

    return { kind: 'unsupported', reason: 'unsupported-pattern', expression: statementExpression(statement) };
  }

  return { kind: 'unsupported', reason: 'unsupported-return', expression: callback };
}

function statementExpression(statement: ts.Statement): ts.Node {
  if (ts.isExpressionStatement(statement)) return statement.expression;
  return statement;
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

type PropertyNameMatch = 'match' | 'miss' | 'unknown';

function propertyNameMatch(name: ts.PropertyName, segment: string): PropertyNameMatch {
  const text = propertyNameText(name);
  if (text !== undefined) return text === segment ? 'match' : 'miss';
  if (!ts.isComputedPropertyName(name)) return 'unknown';

  const computedText = computedPropertyNameText(name);
  if (computedText !== undefined) return computedText === segment ? 'match' : 'miss';
  return 'unknown';
}

function computedPropertyNameText(name: ts.ComputedPropertyName): string | undefined {
  const expression = name.expression;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression) || ts.isNumericLiteral(expression)) {
    return expression.text;
  }
  return undefined;
}

export function checkIfStatement(context: FlowContext, statement: ts.IfStatement, env: FlowEnv): FlowCheckResult {
  const thenChecked = checkStatementBranch(context, statement.thenStatement, cloneEnv(env));
  const elseChecked = statement.elseStatement
    ? checkStatementBranch(context, statement.elseStatement, cloneEnv(env))
    : { errors: [], completed: false, breaks: false, fallsThrough: true };

  return {
    errors: [...thenChecked.errors, ...elseChecked.errors],
    completed: thenChecked.completed || elseChecked.completed,
    breaks: thenChecked.breaks || elseChecked.breaks,
    fallsThrough: thenChecked.fallsThrough || elseChecked.fallsThrough,
  };
}

export function checkSwitchStatement(context: FlowContext, statement: ts.SwitchStatement, env: FlowEnv): FlowCheckResult {
  const errors: DriftError[] = [];
  let hasDefault = false;
  let completed = false;
  let fallsThrough = false;
  const clauses = statement.caseBlock.clauses;

  for (const [index, clause] of clauses.entries()) {
    if (ts.isDefaultClause(clause)) hasDefault = true;
    if (clause.statements.length === 0) {
      if (index === clauses.length - 1) fallsThrough = true;
      continue;
    }

    const checked = checkStatements(context, clause.statements, cloneEnv(env));
    errors.push(...checked.errors);
    completed = checked.completed || completed;
    fallsThrough = checked.breaks || fallsThrough;

    if (checked.fallsThrough && index < clauses.length - 1) {
      errors.push(...unsupportedForSinks(context, context.invariant.sinks ?? [], 'unsupported-switch-fallthrough'));
      continue;
    }

    if (checked.fallsThrough) fallsThrough = true;
  }

  return { errors, completed, breaks: false, fallsThrough: !hasDefault || fallsThrough };
}

export function hasUnsupportedMutation(body: ts.ConciseBody): boolean {
  let found = false;

  const visit = (node: ts.Node): void => {
    if (found) return;
    if (node !== body && ts.isFunctionLike(node)) return;
    if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
      found = true;
      return;
    }
    if (node.kind === ts.SyntaxKind.DeleteExpression) {
      found = true;
      return;
    }
    if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
      if (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(body);
  return found;
}

function checkStatementBranch(context: FlowContext, statement: ts.Statement, env: FlowEnv): FlowCheckResult {
  if (ts.isBlock(statement)) return checkStatements(context, statement.statements, env);
  if (ts.isReturnStatement(statement)) {
    return { errors: checkReturnStatement(context, statement, env), completed: true, breaks: false, fallsThrough: false };
  }
  if (ts.isThrowStatement(statement)) return { errors: [], completed: true, breaks: false, fallsThrough: false };
  if (ts.isBreakStatement(statement)) return { errors: [], completed: false, breaks: true, fallsThrough: false };
  if (ts.isIfStatement(statement)) return checkIfStatement(context, statement, env);
  if (ts.isSwitchStatement(statement)) return checkSwitchStatement(context, statement, env);
  if (ts.isVariableStatement(statement)) {
    applyVariableStatement(statement, env);
    return { errors: [], completed: false, breaks: false, fallsThrough: true };
  }

  if (hasReturnOutsideNestedFunction(statement)) {
    return {
      errors: unsupportedForSinks(context, context.invariant.sinks ?? [], 'unsupported-return'),
      completed: true,
      breaks: false,
      fallsThrough: false,
    };
  }

  return { errors: [], completed: false, breaks: false, fallsThrough: true };
}

function checkReturnStatement(context: FlowContext, statement: ts.ReturnStatement, env: FlowEnv): DriftError[] {
  const sinks = context.invariant.sinks ?? [];

  if (!statement.expression) {
    return unsupportedForSinks(context, sinks, 'unsupported-return');
  }

  return checkReturnExpression(context, statement.expression, env);
}

function hasReturnOutsideNestedFunction(statement: ts.Statement): boolean {
  let found = false;

  const visit = (node: ts.Node): void => {
    if (found) return;
    if (node !== statement && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(statement);
  return found;
}

function unwrapReturnExpression(expression: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(expression)) return unwrapReturnExpression(expression.expression);
  return expression;
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}
