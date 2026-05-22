import ts from 'typescript';
import type { DriftError } from '../../../types.js';
import { flowNotProven, sourceExpressionDetails, unsupportedForSinks, unsupportedPattern } from './diagnostics.js';
import { applyVariableStatement, cloneEnv, expressionFlow } from './env.js';
import { findSinkExpression } from './sinks.js';
import type { FlowCheckResult, FlowContext, FlowEnv } from './types.js';

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

  if (returnExpression.properties.some(ts.isSpreadAssignment)) {
    return unsupportedForSinks(context, sinks, 'unsupported-spread', returnExpression);
  }

  for (const sink of sinks) {
    const path = sink.slice('return.'.length).split('.');
    const property = findSinkExpression(returnExpression, path);

    if (property.kind === 'missing') {
      errors.push(flowNotProven(context, sink, 'missing-sink'));
      continue;
    }

    if (property.kind === 'unsupported') {
      errors.push(unsupportedPattern(context, sink, 'unsupported-pattern'));
      continue;
    }

    const flow = expressionFlow(property.expression, env);
    if (flow.trust === 'trusted') continue;
    const expressionDetails = sourceExpressionDetails(context.sourceFile, property.expression);
    errors.push(
      flow.trust === 'unsupported'
        ? unsupportedPattern(context, sink, flow.reason ?? 'unsupported-pattern', {
            nodeKind: flow.nodeKind,
            ...expressionDetails,
          })
        : flowNotProven(context, sink, 'untrusted-value', {
            nodeKind: flow.nodeKind,
            ...expressionDetails,
          }),
    );
  }

  return errors;
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
