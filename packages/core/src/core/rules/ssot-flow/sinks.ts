import ts from 'typescript';
import type { SinkPathSegment, SinkResolution } from './types.js';

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
export function parseReturnSinkPath(sink: string): SinkPathSegment[] | undefined {
  if (!sink.startsWith('return.')) return undefined;
  const rawSegments = sink.slice('return.'.length).split('.');
  const segments: SinkPathSegment[] = [];

  for (const rawSegment of rawSegments) {
    const collection = rawSegment.endsWith('[]');
    const name = collection ? rawSegment.slice(0, -2) : rawSegment;
    if (!isIdentifierName(name)) return undefined;
    segments.push({ name, collection });
  }

  const collectionCount = segments.filter((segment) => segment.collection).length;
  if (collectionCount > 1) return undefined;
  const collectionIndex = segments.findIndex((segment) => segment.collection);
  if (collectionIndex === segments.length - 1) return undefined;
  return segments;
}

export function findSinkExpression(expression: ts.ObjectLiteralExpression, path: SinkPathSegment[]): SinkResolution {
  const [segment, ...rest] = path;
  if (!segment) return { kind: 'found', expression };

  for (const property of expression.properties) {
    if (ts.isPropertyAssignment(property) && propertyNameText(property.name) === segment.name) {
      if (segment.collection) return { kind: 'collection', expression: property.initializer, itemPath: rest };
      if (rest.length === 0) return { kind: 'found', expression: property.initializer };
      if (!ts.isObjectLiteralExpression(property.initializer)) return { kind: 'unsupported' };
      if (property.initializer.properties.some(ts.isSpreadAssignment)) return { kind: 'unsupported' };
      return findSinkExpression(property.initializer, rest);
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === segment.name) {
      if (segment.collection) return { kind: 'collection', expression: property.name, itemPath: rest };
      return rest.length === 0 ? { kind: 'found', expression: property.name } : { kind: 'unsupported' };
    }
    if (ts.isMethodDeclaration(property) && propertyNameText(property.name) === segment.name) {
      return { kind: 'unsupported' };
    }
  }

  return { kind: 'missing' };
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function isIdentifierName(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value);
}
