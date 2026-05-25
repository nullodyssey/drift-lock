import ts from 'typescript';
import type { FlowEnv, FlowHelperImports, FlowImportResolution, FlowReason, FlowValue } from './types.js';
import { trusted, untrusted, unsupported } from './types.js';

/* @drift
version: 1
id: core.ssot-flow.env
scope: file
stability: draft

intent: >
  Track local SSOT flow provenance through trusted imports, parameters, const
  aliases, and supported derived expressions.

llm:
  must_not_change:
    - Unsupported expression dependencies must not be treated as trusted.
    - Function names must not downgrade arbitrary calls into proven provenance.
    - Parameters must shadow trusted imports as untrusted local values.
    - Only supported immutable local patterns may propagate provenance.
*/
export function createInitialEnv(
  trustedImports: FlowImportResolution,
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
  helperImports: FlowHelperImports = new Map(),
): FlowEnv {
  const env = new Map<string, FlowValue>();
  for (const [name, helperSummary] of helperImports) {
    env.set(name, helperSummary ? { trust: 'unsupported', reason: 'unverified-helper-call', helperSummary } : { ...unsupported, reason: 'unverified-helper-call' });
  }
  for (const name of trustedImports.values) env.set(name, trusted);
  for (const name of trustedImports.namespaces) env.set(name, { ...unsupported, namespaceImport: true });
  for (const parameter of parameters) {
    for (const name of bindingNames(parameter.name)) env.set(name, untrusted);
  }
  return env;
}

export function cloneEnv(env: FlowEnv): FlowEnv {
  return new Map(env);
}

export function applyVariableStatement(statement: ts.VariableStatement, env: FlowEnv): void {
  const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;

  for (const declaration of statement.declarationList.declarations) {
    applyVariableDeclaration(declaration, isConst, env);
  }
}

export function expressionFlow(expression: ts.Expression, env: FlowEnv): FlowValue {
  if (ts.isIdentifier(expression)) {
    return env.get(expression.text) ?? untrusted;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    const base = expressionFlow(expression.expression, env);
    return flowForProperty(base, expression.name.text, expression, { allowNamespace: true });
  }

  if (ts.isElementAccessExpression(expression)) {
    const base = expressionFlow(expression.expression, env);
    if (base.namespaceImport) return unsupportedFlow('unsupported-pattern', expression);
    if (base.objectSummary) return unsupportedFlow('unverified-helper-call', expression);
    return base;
  }

  if (ts.isParenthesizedExpression(expression) || ts.isNonNullExpression(expression)) {
    return expressionFlow(expression.expression, env);
  }

  if (ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isSatisfiesExpression(expression)) {
    return expressionFlow(expression.expression, env);
  }

  if (ts.isBinaryExpression(expression)) {
    if (!isDerivedBinaryOperator(expression.operatorToken.kind)) return unsupportedFlow('unsupported-pattern', expression);
    return combineDerived([expressionFlow(expression.left, env), expressionFlow(expression.right, env)]);
  }

  if (ts.isTemplateExpression(expression)) {
    return combineDerived(expression.templateSpans.map((span) => expressionFlow(span.expression, env)));
  }

  if (ts.isNoSubstitutionTemplateLiteral(expression) || ts.isStringLiteral(expression) || ts.isNumericLiteral(expression)) {
    return untrusted;
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword || expression.kind === ts.SyntaxKind.NullKeyword) {
    return untrusted;
  }

  if (ts.isObjectLiteralExpression(expression) || ts.isArrayLiteralExpression(expression)) {
    return untrusted;
  }

  if (ts.isCallExpression(expression)) {
    const helper = calledHelper(expression, env);
    if (helper?.helperSummary) return { trust: 'untrusted', objectSummary: { returns: helper.helperSummary.returns, path: [] } };
    if (helper) return unsupportedFlow('unverified-helper-call', expression);
    return unsupportedFlow('unsupported-call', expression);
  }

  if (ts.isNewExpression(expression) || ts.isAwaitExpression(expression)) {
    return unsupportedFlow('unsupported-call', expression);
  }

  return unsupportedFlow('unsupported-pattern', expression);
}

export function combineDerived(values: FlowValue[]): FlowValue {
  const unsupportedValue = values.find((value) => value.trust === 'unsupported');
  if (unsupportedValue) return unsupportedValue;
  if (values.some((value) => value.trust === 'trusted')) return trusted;
  return untrusted;
}

function flowForSummaryPath(value: FlowValue, segment: string, node: ts.Node): FlowValue {
  const summary = value.objectSummary;
  if (!summary) return value;
  const path = [...summary.path, segment];
  const returnPath = `return.${path.join('.')}`;
  if (summary.returns.includes(returnPath)) return trusted;
  if (summary.returns.some((candidate) => candidate.startsWith(`${returnPath}.`))) {
    return { trust: 'untrusted', objectSummary: { returns: summary.returns, path } };
  }
  return unsupportedFlow('unverified-helper-call', node);
}

function flowForProperty(
  value: FlowValue,
  segment: string,
  node: ts.Node,
  options: { allowNamespace?: boolean } = {},
): FlowValue {
  if (value.namespaceImport) return options.allowNamespace ? trusted : unsupportedFlow('unsupported-pattern', node);
  if (value.objectSummary) return flowForSummaryPath(value, segment, node);
  return value;
}

function applyVariableDeclaration(declaration: ts.VariableDeclaration, isConst: boolean, env: FlowEnv): void {
  if (ts.isIdentifier(declaration.name)) {
    env.set(declaration.name.text, isConst && declaration.initializer ? expressionFlow(declaration.initializer, env) : unsupported);
    return;
  }

  if (!isConst || !declaration.initializer || !ts.isObjectBindingPattern(declaration.name)) {
    markBindings(declaration.name, unsupported, env);
    return;
  }

  applyObjectBindingPattern(declaration.name, declaration.initializer, env);
}

function applyObjectBindingPattern(pattern: ts.ObjectBindingPattern, initializer: ts.Expression, env: FlowEnv): void {
  if (!isSupportedObjectBindingPattern(pattern)) {
    markBindings(pattern, unsupported, env);
    return;
  }

  const base = expressionFlow(initializer, env);
  for (const element of pattern.elements) {
    if (!ts.isIdentifier(element.name)) continue;
    const segment = element.propertyName ? propertyNameText(element.propertyName) : element.name.text;
    if (!segment) {
      env.set(element.name.text, unsupported);
      continue;
    }
    env.set(element.name.text, flowForProperty(base, segment, element));
  }
}

function isSupportedObjectBindingPattern(pattern: ts.ObjectBindingPattern): boolean {
  return pattern.elements.every((element) => {
    if (element.dotDotDotToken || element.initializer) return false;
    if (!ts.isIdentifier(element.name)) return false;
    return !element.propertyName || propertyNameText(element.propertyName) !== undefined;
  });
}

function markBindings(name: ts.BindingName, value: FlowValue, env: FlowEnv): void {
  for (const binding of bindingNames(name)) env.set(binding, value);
}

function calledHelper(expression: ts.CallExpression, env: FlowEnv): FlowValue | undefined {
  const callee = expression.expression;
  if (!ts.isIdentifier(callee)) return undefined;
  const value = env.get(callee.text);
  return value?.helperSummary || value?.reason === 'unverified-helper-call' ? value : undefined;
}

function unsupportedFlow(reason: FlowReason, node: ts.Node): FlowValue {
  return { trust: 'unsupported', reason, nodeKind: ts.SyntaxKind[node.kind] };
}

function isDerivedBinaryOperator(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.AsteriskToken ||
    kind === ts.SyntaxKind.AsteriskAsteriskToken ||
    kind === ts.SyntaxKind.SlashToken ||
    kind === ts.SyntaxKind.PercentToken ||
    kind === ts.SyntaxKind.PlusToken ||
    kind === ts.SyntaxKind.MinusToken
  );
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => {
    if (ts.isOmittedExpression(element)) return [];
    return bindingNames(element.name);
  });
}
