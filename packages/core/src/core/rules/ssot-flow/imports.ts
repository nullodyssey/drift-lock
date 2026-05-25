import ts from 'typescript';
import { moduleSpecifierCandidates } from '../../module-specifier.js';
import type { FlowImportResolution } from './types.js';

/* @drift
version: 1
id: core.ssot-flow.imports
scope: file
stability: draft

intent: >
  Resolve trusted local identifiers imported from a declared SSOT module for
  SSOT flow provenance checks.

ssot:
  module-specifier: "../../module-specifier.ts"

invariants:
  - id: imports-use-module-specifier-candidates
    enforce: drift/ssot-usage
    ssot: module-specifier

llm:
  must_not_change:
    - Type-only imports must not create trusted runtime values.
    - NodeNext module specifier alternatives must remain supported.
*/
export function findTrustedImports(sourceFile: ts.SourceFile, ssotPath: string): FlowImportResolution {
  const candidates = moduleSpecifierCandidates(ssotPath);
  const imports: FlowImportResolution = {
    values: new Set<string>(),
    namespaces: new Set<string>(),
  };

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!candidates.includes(statement.moduleSpecifier.text)) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;

    const bindings = clause.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) {
      imports.namespaces.add(bindings.name.text);
      continue;
    }

    for (const specifier of bindings.elements) {
      if (specifier.isTypeOnly) continue;
      imports.values.add(specifier.name.text);
    }
  }

  return imports;
}
