import ts from 'typescript';
import type { DriftError, DriftExtractedContract, DriftInvariant } from '../types.js';
import { driftError } from './errors.js';
import { moduleSpecifierCandidates } from './module-specifier.js';

type FlowValue = {
  trusted: boolean;
  unsupported: boolean;
  reason?: FlowReason;
  nodeKind?: string;
};

type FunctionLikeWithBody = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

type FlowCheckResult = {
  errors: DriftError[];
  completed: boolean;
  breaks: boolean;
  fallsThrough: boolean;
};

type FlowErrorDetails = {
  nodeKind?: string;
  foundExpression?: string;
  foundNodeKind?: string;
};

type FlowReason =
  | 'missing-sink'
  | 'untrusted-value'
  | 'unsupported-call'
  | 'unsupported-return'
  | 'unsupported-spread'
  | 'unsupported-mutation'
  | 'implicit-fallthrough'
  | 'unsupported-switch-fallthrough'
  | 'unsupported-pattern';

const untrusted: FlowValue = { trusted: false, unsupported: false };
const trusted: FlowValue = { trusted: true, unsupported: false };
const unsupported: FlowValue = { trusted: false, unsupported: true, reason: 'unsupported-pattern' };

export function checkSsotFlow(contract: DriftExtractedContract, text: string): DriftError[] {
  const errors: DriftError[] = [];
  const invariants = contract.invariants ?? [];
  const ssot = contract.ssot ?? {};
  const flowInvariants = invariants.filter((invariant) => invariant.enforce === 'drift/ssot-flow' && invariant.ssot);
  if (flowInvariants.length === 0) return errors;

  const sourceFile = ts.createSourceFile(contract.file, text, ts.ScriptTarget.Latest, true, scriptKind(contract.file));
  const functionNode = findAnchoredFunctionLike(sourceFile, contract);

  for (const invariant of flowInvariants) {
    const sinks = invariant.sinks ?? [];
    const ssotPath = ssot[invariant.ssot as string];
    if (!ssotPath) continue;

    if (!functionNode?.body) {
      errors.push(...unsupportedForSinks(contract, invariant, sinks, 'unsupported-return'));
      continue;
    }

    errors.push(...checkFunctionFlow(sourceFile, contract, functionNode, invariant, ssotPath));
  }

  return errors;
}

function checkFunctionFlow(
  sourceFile: ts.SourceFile,
  contract: DriftExtractedContract,
  functionNode: FunctionLikeWithBody,
  invariant: DriftInvariant,
  ssotPath: string,
): DriftError[] {
  const errors: DriftError[] = [];
  const sinks = invariant.sinks ?? [];
  const body = functionNode.body;
  if (!body) return unsupportedForSinks(contract, invariant, sinks, 'unsupported-return');
  const trustedImports = findTrustedImports(sourceFile, ssotPath);

  if (trustedImports.size === 0) {
    return sinks.map((sink) => flowNotProven(contract, invariant, sink));
  }

  if (hasUnsupportedMutation(body)) {
    return unsupportedForSinks(contract, invariant, sinks, 'unsupported-mutation');
  }

  const env = new Map<string, FlowValue>();
  for (const name of trustedImports) env.set(name, trusted);
  for (const parameter of functionNode.parameters) {
    for (const name of bindingNames(parameter.name)) env.set(name, untrusted);
  }

  if (ts.isBlock(body)) {
    const checked = checkStatements(sourceFile, contract, invariant, body.statements, env);
    errors.push(...checked.errors);
    if (!checked.completed || checked.breaks || checked.fallsThrough) {
      errors.push(...unsupportedForSinks(contract, invariant, sinks, 'implicit-fallthrough'));
    }
  } else {
    errors.push(...checkReturnExpression(sourceFile, contract, invariant, body, env));
  }

  return errors;
}

function checkStatements(
  sourceFile: ts.SourceFile,
  contract: DriftExtractedContract,
  invariant: DriftInvariant,
  statements: ts.NodeArray<ts.Statement>,
  env: Map<string, FlowValue>,
): FlowCheckResult {
  const errors: DriftError[] = [];
  let completed = false;
  let breaks = false;

  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      applyVariableStatement(statement, env);
      continue;
    }

    if (ts.isReturnStatement(statement)) {
      errors.push(...checkReturnStatement(sourceFile, contract, invariant, statement, env));
      return { errors, completed: true, breaks, fallsThrough: false };
    }

    if (ts.isThrowStatement(statement)) {
      return { errors, completed: true, breaks, fallsThrough: false };
    }

    if (ts.isBreakStatement(statement)) {
      return { errors, completed, breaks: true, fallsThrough: false };
    }

    if (ts.isIfStatement(statement)) {
      const checked = checkIfStatement(sourceFile, contract, invariant, statement, env);
      errors.push(...checked.errors);
      completed = checked.completed || completed;
      breaks = checked.breaks || breaks;
      if (!checked.fallsThrough) return { errors, completed, breaks, fallsThrough: false };
      continue;
    }

    if (ts.isSwitchStatement(statement)) {
      const checked = checkSwitchStatement(sourceFile, contract, invariant, statement, env);
      errors.push(...checked.errors);
      completed = checked.completed || completed;
      breaks = checked.breaks || breaks;
      if (!checked.fallsThrough) return { errors, completed, breaks, fallsThrough: false };
      continue;
    }

    if (hasReturnOutsideNestedFunction(statement)) {
      errors.push(...unsupportedForSinks(contract, invariant, invariant.sinks ?? [], 'unsupported-return'));
      return { errors, completed: true, breaks, fallsThrough: false };
    }
  }

  return { errors, completed, breaks, fallsThrough: true };
}

function checkIfStatement(
  sourceFile: ts.SourceFile,
  contract: DriftExtractedContract,
  invariant: DriftInvariant,
  statement: ts.IfStatement,
  env: Map<string, FlowValue>,
): FlowCheckResult {
  const thenChecked = checkStatementBranch(sourceFile, contract, invariant, statement.thenStatement, cloneEnv(env));
  const elseChecked = statement.elseStatement
    ? checkStatementBranch(sourceFile, contract, invariant, statement.elseStatement, cloneEnv(env))
    : { errors: [], completed: false, breaks: false, fallsThrough: true };

  return {
    errors: [...thenChecked.errors, ...elseChecked.errors],
    completed: thenChecked.completed || elseChecked.completed,
    breaks: thenChecked.breaks || elseChecked.breaks,
    fallsThrough: thenChecked.fallsThrough || elseChecked.fallsThrough,
  };
}

function checkSwitchStatement(
  sourceFile: ts.SourceFile,
  contract: DriftExtractedContract,
  invariant: DriftInvariant,
  statement: ts.SwitchStatement,
  env: Map<string, FlowValue>,
): FlowCheckResult {
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

    const checked = checkStatements(sourceFile, contract, invariant, clause.statements, cloneEnv(env));
    errors.push(...checked.errors);
    completed = checked.completed || completed;
    fallsThrough = checked.breaks || fallsThrough;

    if (checked.fallsThrough && index < clauses.length - 1) {
      errors.push(...unsupportedForSinks(contract, invariant, invariant.sinks ?? [], 'unsupported-switch-fallthrough'));
      continue;
    }

    if (checked.fallsThrough) fallsThrough = true;
  }

  return { errors, completed, breaks: false, fallsThrough: !hasDefault || fallsThrough };
}

function checkStatementBranch(
  sourceFile: ts.SourceFile,
  contract: DriftExtractedContract,
  invariant: DriftInvariant,
  statement: ts.Statement,
  env: Map<string, FlowValue>,
): FlowCheckResult {
  if (ts.isBlock(statement)) return checkStatements(sourceFile, contract, invariant, statement.statements, env);
  if (ts.isReturnStatement(statement)) {
    return { errors: checkReturnStatement(sourceFile, contract, invariant, statement, env), completed: true, breaks: false, fallsThrough: false };
  }
  if (ts.isThrowStatement(statement)) return { errors: [], completed: true, breaks: false, fallsThrough: false };
  if (ts.isBreakStatement(statement)) return { errors: [], completed: false, breaks: true, fallsThrough: false };
  if (ts.isIfStatement(statement)) return checkIfStatement(sourceFile, contract, invariant, statement, env);
  if (ts.isSwitchStatement(statement)) return checkSwitchStatement(sourceFile, contract, invariant, statement, env);
  if (ts.isVariableStatement(statement)) {
    applyVariableStatement(statement, env);
    return { errors: [], completed: false, breaks: false, fallsThrough: true };
  }

  if (hasReturnOutsideNestedFunction(statement)) {
    return {
      errors: unsupportedForSinks(contract, invariant, invariant.sinks ?? [], 'unsupported-return'),
      completed: true,
      breaks: false,
      fallsThrough: false,
    };
  }

  return { errors: [], completed: false, breaks: false, fallsThrough: true };
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

function cloneEnv(env: Map<string, FlowValue>): Map<string, FlowValue> {
  return new Map(env);
}

function checkReturnStatement(
  sourceFile: ts.SourceFile,
  contract: DriftExtractedContract,
  invariant: DriftInvariant,
  statement: ts.ReturnStatement,
  env: Map<string, FlowValue>,
): DriftError[] {
  const sinks = invariant.sinks ?? [];

  if (!statement.expression) {
    return unsupportedForSinks(contract, invariant, sinks, 'unsupported-return');
  }

  return checkReturnExpression(sourceFile, contract, invariant, statement.expression, env);
}

function findTrustedImports(sourceFile: ts.SourceFile, ssotPath: string): Set<string> {
  const candidates = moduleSpecifierCandidates(ssotPath);
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!candidates.includes(statement.moduleSpecifier.text)) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;

    if (clause.name) names.add(clause.name.text);

    const bindings = clause.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) {
      names.add(bindings.name.text);
      continue;
    }

    for (const specifier of bindings.elements) {
      if (specifier.isTypeOnly) continue;
      names.add(specifier.name.text);
    }
  }

  return names;
}

function applyVariableStatement(statement: ts.VariableStatement, env: Map<string, FlowValue>): void {
  const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;

  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name)) {
      for (const name of bindingNames(declaration.name)) env.set(name, unsupported);
      continue;
    }

    if (!isConst || !declaration.initializer) {
      env.set(declaration.name.text, unsupported);
      continue;
    }

    env.set(declaration.name.text, expressionFlow(declaration.initializer, env));
  }
}

function checkReturnExpression(
  sourceFile: ts.SourceFile,
  contract: DriftExtractedContract,
  invariant: DriftInvariant,
  expression: ts.Expression,
  env: Map<string, FlowValue>,
): DriftError[] {
  const errors: DriftError[] = [];
  const sinks = invariant.sinks ?? [];
  const returnExpression = unwrapReturnExpression(expression);

  if (!ts.isObjectLiteralExpression(returnExpression)) {
    return unsupportedForSinks(contract, invariant, sinks, 'unsupported-return', returnExpression);
  }

  if (returnExpression.properties.some(ts.isSpreadAssignment)) {
    return unsupportedForSinks(contract, invariant, sinks, 'unsupported-spread', returnExpression);
  }

  for (const sink of sinks) {
    const path = sink.slice('return.'.length).split('.');
    const property = findSinkExpression(returnExpression, path);

    if (!property) {
      errors.push(flowNotProven(contract, invariant, sink, 'missing-sink'));
      continue;
    }

    if (property.unsupported || !property.expression) {
      errors.push(unsupportedPattern(contract, invariant, sink, 'unsupported-pattern'));
      continue;
    }

    const flow = expressionFlow(property.expression, env);
    if (flow.trusted) continue;
    const expressionDetails = sourceExpressionDetails(sourceFile, property.expression);
    errors.push(
      flow.unsupported
        ? unsupportedPattern(contract, invariant, sink, flow.reason ?? 'unsupported-pattern', {
            nodeKind: flow.nodeKind,
            ...expressionDetails,
          })
        : flowNotProven(contract, invariant, sink, 'untrusted-value', {
            nodeKind: flow.nodeKind,
            ...expressionDetails,
          }),
    );
  }

  return errors;
}

function unwrapReturnExpression(expression: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(expression)) return unwrapReturnExpression(expression.expression);
  return expression;
}

function expressionFlow(expression: ts.Expression, env: Map<string, FlowValue>): FlowValue {
  if (ts.isIdentifier(expression)) {
    return env.get(expression.text) ?? untrusted;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expressionFlow(expression.expression, env);
  }

  if (ts.isElementAccessExpression(expression)) {
    return expressionFlow(expression.expression, env);
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

  if (ts.isCallExpression(expression) || ts.isNewExpression(expression) || ts.isAwaitExpression(expression)) {
    return unsupportedFlow('unsupported-call', expression);
  }

  return unsupportedFlow('unsupported-pattern', expression);
}

function combineDerived(values: FlowValue[]): FlowValue {
  const hasTrusted = values.some((value) => value.trusted);
  if (hasTrusted) return trusted;
  return values.length > 0 && values.every((value) => value.unsupported) ? unsupported : untrusted;
}

function unsupportedFlow(reason: FlowReason, node: ts.Node): FlowValue {
  return { trusted: false, unsupported: true, reason, nodeKind: ts.SyntaxKind[node.kind] };
}

function findSinkExpression(
  expression: ts.ObjectLiteralExpression,
  path: string[],
): { expression?: ts.Expression; unsupported: boolean } | undefined {
  const [name, ...rest] = path;
  if (!name) return { expression, unsupported: false };

  for (const property of expression.properties) {
    if (ts.isPropertyAssignment(property) && propertyNameText(property.name) === name) {
      if (rest.length === 0) return { expression: property.initializer, unsupported: false };
      if (!ts.isObjectLiteralExpression(property.initializer)) return { unsupported: true };
      if (property.initializer.properties.some(ts.isSpreadAssignment)) return { unsupported: true };
      return findSinkExpression(property.initializer, rest);
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) {
      return rest.length === 0 ? { expression: property.name, unsupported: false } : { unsupported: true };
    }
    if (ts.isMethodDeclaration(property) && propertyNameText(property.name) === name) {
      return { unsupported: true };
    }
  }

  return undefined;
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function findAnchoredFunctionLike(sourceFile: ts.SourceFile, contract: DriftExtractedContract): FunctionLikeWithBody | undefined {
  if (contract.anchor.type === 'function') {
    const anchorName = contract.anchor.name;
    return sourceFile.statements.find(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) && statement.name?.text === anchorName,
    );
  }

  if (contract.anchor.type !== 'const') return undefined;

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== contract.anchor.name) continue;
      if (declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
        return declaration.initializer;
      }
    }
  }

  return undefined;
}

function scriptKind(file: string): ts.ScriptKind {
  return file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function hasUnsupportedMutation(body: ts.ConciseBody): boolean {
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

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
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

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => {
    if (ts.isOmittedExpression(element)) return [];
    return bindingNames(element.name);
  });
}

function unsupportedForSinks(
  contract: DriftExtractedContract,
  invariant: DriftInvariant,
  sinks: string[],
  reason: FlowReason = 'unsupported-pattern',
  node?: ts.Node,
): DriftError[] {
  return sinks.map((sink) => unsupportedPattern(contract, invariant, sink, reason, { nodeKind: node ? ts.SyntaxKind[node.kind] : undefined }));
}

function flowNotProven(
  contract: DriftExtractedContract,
  invariant: DriftInvariant,
  sink: string,
  reason: FlowReason = 'untrusted-value',
  details: FlowErrorDetails = {},
): DriftError {
  return driftError(
    'DRIFT013_SSOT_FLOW_NOT_PROVEN',
    contract.file,
    { id: contract.id, invariantId: invariant.id, ssotKey: invariant.ssot, sink, reason, ...details },
    { line: contract.line, column: contract.column },
  );
}

function unsupportedPattern(
  contract: DriftExtractedContract,
  invariant: DriftInvariant,
  sink: string,
  reason: FlowReason = 'unsupported-pattern',
  details: FlowErrorDetails = {},
): DriftError {
  return driftError(
    'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
    contract.file,
    { id: contract.id, invariantId: invariant.id, ssotKey: invariant.ssot, sink, reason, ...details },
    { line: contract.line, column: contract.column },
  );
}

function sourceExpressionDetails(sourceFile: ts.SourceFile, expression: ts.Expression): FlowErrorDetails {
  return {
    foundExpression: expression.getText(sourceFile),
    foundNodeKind: ts.SyntaxKind[expression.kind],
  };
}
