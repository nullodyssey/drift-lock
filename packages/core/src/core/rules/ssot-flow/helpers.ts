import path from 'node:path';
import ts from 'typescript';
import type { DriftIndexedContract } from '../../../types.js';
import type { FlowHelperImports, FlowHelperSummary } from './types.js';

/* @drift
version: 1
id: core.ssot-flow.helpers
scope: file
stability: draft

intent: >
  Resolve first-iteration helper contract summaries for named imports consumed by
  SSOT flow checks without trusting function names or unsupported module shapes.

llm:
  must_not_change:
    - Helper summaries must be consumed only when they match the current SSOT path.
    - Unresolved helper imports must fail closed instead of becoming trusted.
    - V1 unsupported import shapes must stay explicit in code comments.
*/
export function findHelperImports(
  sourceFile: ts.SourceFile,
  currentFile: string,
  helperContracts: DriftIndexedContract[],
  ssotPath: string,
): FlowHelperImports {
  const imports: FlowHelperImports = new Map();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    const bindings = clause.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;

    const fileCandidates = importFileCandidates(currentFile, statement.moduleSpecifier.text);
    for (const specifier of bindings.elements) {
      if (specifier.isTypeOnly) continue;
      if (specifier.propertyName?.text === 'default') continue;
      const importedName = specifier.propertyName?.text ?? specifier.name.text;
      const summary = findMatchingSummary(helperContracts, fileCandidates, importedName, ssotPath);
      imports.set(specifier.name.text, summary);
    }
  }

  return imports;
}

function findMatchingSummary(
  helperContracts: DriftIndexedContract[],
  fileCandidates: Set<string>,
  importedName: string,
  ssotPath: string,
): FlowHelperSummary | undefined {
  const returns = new Set<string>();

  for (const contract of helperContracts) {
    if (!fileCandidates.has(contract.file)) continue;
    if (contract.anchor.type === 'file' || contract.anchor.name !== importedName) continue;
    for (const summary of contract.summaries?.ssotFlow ?? []) {
      if (summary.ssotPath !== ssotPath) continue;
      for (const returnPath of summary.returns) returns.add(returnPath);
    }
  }

  return returns.size > 0 ? { returns: [...returns].sort() } : undefined;
}

function importFileCandidates(currentFile: string, moduleSpecifier: string): Set<string> {
  const candidates = new Set<string>();
  if (moduleSpecifier.startsWith('.')) {
    const base = normalize(path.posix.join(path.posix.dirname(currentFile), moduleSpecifier));
    addFileCandidates(candidates, base);
    return candidates;
  }

  // V1 intentionally does not support re-exports, namespace imports, default
  // imports, full TSConfig alias resolution, or transitive helper-to-helper
  // propagation. Unsupported shapes fail closed as DRIFT014.
  addFileCandidates(candidates, normalize(moduleSpecifier));
  return candidates;
}

function addFileCandidates(candidates: Set<string>, base: string): void {
  candidates.add(base);
  const extensionless = base.replace(/\.(tsx|ts|jsx|js)$/, '');
  candidates.add(extensionless);
  candidates.add(`${extensionless}.ts`);
  candidates.add(`${extensionless}.tsx`);
  candidates.add(`${extensionless}.js`);
  candidates.add(`${extensionless}.jsx`);
}

function normalize(value: string): string {
  return value.split(path.sep).join('/').replace(/^\.\//, '');
}
