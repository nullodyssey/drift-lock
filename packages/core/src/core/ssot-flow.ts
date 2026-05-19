import ts from 'typescript';
import type { DriftError, DriftExtractedContract, DriftInvariant } from '../types.js';
import { driftError } from './errors.js';
import { moduleSpecifierCandidates } from './module-specifier.js';

type FlowValue = {
  trusted: boolean;
  unsupported: boolean;
};

const untrusted: FlowValue = { trusted: false, unsupported: false };
const trusted: FlowValue = { trusted: true, unsupported: false };
const unsupported: FlowValue = { trusted: false, unsupported: true };

export function checkSsotFlow(contract: DriftExtractedContract, text: string): DriftError[] {
  const errors: DriftError[] = [];
  const invariants = contract.invariants ?? [];
  const ssot = contract.ssot ?? {};
  const flowInvariants = invariants.filter((invariant) => invariant.enforce === 'drift/ssot-flow' && invariant.ssot);
  if (flowInvariants.length === 0) return errors;

  const sourceFile = ts.createSourceFile(contract.file, text, ts.ScriptTarget.Latest, true, scriptKind(contract.file));
  const functionNode = findAnchoredFunction(sourceFile, contract);

  for (const invariant of flowInvariants) {
    const sinks = invariant.sinks ?? [];
    const ssotPath = ssot[invariant.ssot as string];
    if (!ssotPath) continue;

    if (!functionNode?.body) {
      errors.push(...unsupportedForSinks(contract, invariant, sinks));
      continue;
    }

    errors.push(...checkFunctionFlow(sourceFile, contract, functionNode.body, invariant, ssotPath));
  }

  return errors;
}

function checkFunctionFlow(
  sourceFile: ts.SourceFile,
  contract: DriftExtractedContract,
  body: ts.Block,
  invariant: DriftInvariant,
  ssotPath: string,
): DriftError[] {
  const errors: DriftError[] = [];
  const sinks = invariant.sinks ?? [];
  const trustedImports = findTrustedImports(sourceFile, ssotPath);

  if (trustedImports.size === 0) {
    return sinks.map((sink) => flowNotProven(contract, invariant, sink));
  }

  if (hasUnsupportedMutation(body)) {
    return unsupportedForSinks(contract, invariant, sinks);
  }

  if (hasNestedReturn(body)) {
    return unsupportedForSinks(contract, invariant, sinks);
  }

  const env = new Map<string, FlowValue>();
  for (const name of trustedImports) env.set(name, trusted);

  let sawReturn = false;
  for (const statement of body.statements) {
    if (ts.isVariableStatement(statement)) {
      applyVariableStatement(statement, env);
      continue;
    }

    if (ts.isReturnStatement(statement)) {
      sawReturn = true;
      errors.push(...checkReturnStatement(contract, invariant, statement, env));
    }
  }

  if (!sawReturn) {
    errors.push(...unsupportedForSinks(contract, invariant, sinks));
  }

  return errors;
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

function checkReturnStatement(
  contract: DriftExtractedContract,
  invariant: DriftInvariant,
  statement: ts.ReturnStatement,
  env: Map<string, FlowValue>,
): DriftError[] {
  const errors: DriftError[] = [];
  const sinks = invariant.sinks ?? [];

  if (!statement.expression || !ts.isObjectLiteralExpression(statement.expression)) {
    return unsupportedForSinks(contract, invariant, sinks);
  }

  if (statement.expression.properties.some(ts.isSpreadAssignment)) {
    return unsupportedForSinks(contract, invariant, sinks);
  }

  for (const sink of sinks) {
    const propertyName = sink.slice('return.'.length);
    const property = findObjectProperty(statement.expression, propertyName);

    if (!property) {
      errors.push(flowNotProven(contract, invariant, sink));
      continue;
    }

    if (property.unsupported || !property.expression) {
      errors.push(unsupportedPattern(contract, invariant, sink));
      continue;
    }

    const flow = expressionFlow(property.expression, env);
    if (flow.trusted) continue;
    errors.push(flow.unsupported ? unsupportedPattern(contract, invariant, sink) : flowNotProven(contract, invariant, sink));
  }

  return errors;
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
    return unsupported;
  }

  return unsupported;
}

function combineDerived(values: FlowValue[]): FlowValue {
  const hasTrusted = values.some((value) => value.trusted);
  if (hasTrusted) return trusted;
  return values.length > 0 && values.every((value) => value.unsupported) ? unsupported : untrusted;
}

function findObjectProperty(
  expression: ts.ObjectLiteralExpression,
  name: string,
): { expression?: ts.Expression; unsupported: boolean } | undefined {
  for (const property of expression.properties) {
    if (ts.isPropertyAssignment(property) && propertyNameText(property.name) === name) {
      return { expression: property.initializer, unsupported: false };
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) {
      return { expression: property.name, unsupported: false };
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

function findAnchoredFunction(sourceFile: ts.SourceFile, contract: DriftExtractedContract): ts.FunctionDeclaration | undefined {
  if (contract.anchor.type !== 'function') return undefined;
  const anchorName = contract.anchor.name;
  return sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === anchorName,
  );
}

function scriptKind(file: string): ts.ScriptKind {
  return file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function hasUnsupportedMutation(body: ts.Block): boolean {
  let found = false;

  const visit = (node: ts.Node): void => {
    if (found) return;
    if (node !== body && ts.isFunctionLike(node)) return;
    if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
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

function hasNestedReturn(body: ts.Block): boolean {
  let found = false;

  const visit = (node: ts.Node): void => {
    if (found) return;
    if (node !== body && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && !body.statements.includes(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(body);
  return found;
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => {
    if (ts.isOmittedExpression(element)) return [];
    return bindingNames(element.name);
  });
}

function unsupportedForSinks(contract: DriftExtractedContract, invariant: DriftInvariant, sinks: string[]): DriftError[] {
  return sinks.map((sink) => unsupportedPattern(contract, invariant, sink));
}

function flowNotProven(contract: DriftExtractedContract, invariant: DriftInvariant, sink: string): DriftError {
  return driftError(
    'DRIFT013_SSOT_FLOW_NOT_PROVEN',
    contract.file,
    { id: contract.id, invariantId: invariant.id, ssotKey: invariant.ssot, sink },
    { line: contract.line, column: contract.column },
  );
}

function unsupportedPattern(contract: DriftExtractedContract, invariant: DriftInvariant, sink: string): DriftError {
  return driftError(
    'DRIFT014_UNSUPPORTED_FLOW_PATTERN',
    contract.file,
    { id: contract.id, invariantId: invariant.id, ssotKey: invariant.ssot, sink },
    { line: contract.line, column: contract.column },
  );
}
