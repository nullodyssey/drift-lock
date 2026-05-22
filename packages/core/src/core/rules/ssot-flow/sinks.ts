import ts from 'typescript';
import type { SinkResolution } from './types.js';

/* @drift
version: 1
id: core.ssot-flow.sinks
scope: file
stability: draft

intent: >
  Resolve explicit return sink paths inside supported object literal return
  expressions for SSOT flow checks.

llm:
  must_not_change:
    - Missing sinks must stay distinguishable from unsupported sink patterns.
    - Spread assignments must remain unsupported until resolvable spread support exists.
    - Sink path behavior must stay compatible with schema-v1 return.<path> sinks.
*/
export function findSinkExpression(expression: ts.ObjectLiteralExpression, path: string[]): SinkResolution {
  const [name, ...rest] = path;
  if (!name) return { kind: 'found', expression };

  for (const property of expression.properties) {
    if (ts.isPropertyAssignment(property) && propertyNameText(property.name) === name) {
      if (rest.length === 0) return { kind: 'found', expression: property.initializer };
      if (!ts.isObjectLiteralExpression(property.initializer)) return { kind: 'unsupported' };
      if (property.initializer.properties.some(ts.isSpreadAssignment)) return { kind: 'unsupported' };
      return findSinkExpression(property.initializer, rest);
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) {
      return rest.length === 0 ? { kind: 'found', expression: property.name } : { kind: 'unsupported' };
    }
    if (ts.isMethodDeclaration(property) && propertyNameText(property.name) === name) {
      return { kind: 'unsupported' };
    }
  }

  return { kind: 'missing' };
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}
