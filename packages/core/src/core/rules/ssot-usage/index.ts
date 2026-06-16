import ts from 'typescript';
import type { DriftError, DriftExtractedContract } from '../../../types.js';
import { driftError } from '../../errors.js';
import { moduleSpecifierCandidates } from '../../module-specifier.js';
import { parseSourceInput, type ParsedSource, type SourceInput } from '../../source-cache.js';

/* @drift
version: 1
id: core.ssot-usage.rule
scope: file
stability: locked

intent: >
  Enforce drift/ssot-usage invariants by proving that anchored code references
  the declared source-of-truth module.

ssot:
  errors: "../../errors.ts"
  module-specifier: "../../module-specifier.ts"

invariants:
  - id: usage-reports-shared-diagnostics
    enforce: drift/ssot-usage
    ssot: errors
  - id: usage-supports-module-specifier-candidates
    enforce: drift/ssot-usage
    ssot: module-specifier

llm:
  must_not_change:
    - checkSsotUsage must remain the rule entrypoint consumed by checker and ESLint.
    - NodeNext TypeScript and emitted JavaScript module specifier alternatives must remain supported.
    - Missing SSOT references must report DRIFT010_SSOT_NOT_USED.
*/
export function checkSsotUsage(contract: DriftExtractedContract, source: SourceInput): DriftError[] {
  const errors: DriftError[] = [];
  const invariants = contract.invariants ?? [];
  const ssot = contract.ssot ?? {};
  const parsed = parseSourceInput(contract.file, source);

  for (const invariant of invariants) {
    if (invariant.enforce !== 'drift/ssot-usage' || !invariant.ssot) continue;
    const ssotPath = ssot[invariant.ssot];
    if (!ssotPath) continue;
    if (!usesSsot(parsed, contract, ssotPath)) {
      errors.push(
        driftError(
          'DRIFT010_SSOT_NOT_USED',
          contract.file,
          { id: contract.id, ssotKey: invariant.ssot, ssotPath },
          { line: contract.line, column: contract.column },
        ),
      );
    }
  }

  return errors;
}

function usesSsot(source: ParsedSource, contract: DriftExtractedContract, ssotPath: string): boolean {
  const ssotCandidates = moduleSpecifierCandidates(ssotPath);
  const ssotCandidateSet = new Set(ssotCandidates);
  if (hasSsotStringLiteralInAnchor(source.sourceFile, contract, ssotCandidateSet)) return true;

  // V1 treats imports as sufficient SSOT usage. This is intentionally shallow:
  // the goal is catching obvious local replacements, not proving data flow.
  return source.sourceFile.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
    const importedPath = statement.moduleSpecifier.text;
    return ssotCandidateSet.has(importedPath);
  });
}

function hasSsotStringLiteralInAnchor(
  sourceFile: ts.SourceFile,
  contract: DriftExtractedContract,
  ssotCandidates: Set<string>,
): boolean {
  let found = false;

  function visit(node: ts.Node): void {
    if (found) return;
    const start = node.getStart(sourceFile);
    const end = node.end;
    if (end < contract.bodyStart || start > contract.bodyEnd) return;

    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && ssotCandidates.has(node.text)) {
      found = true;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}
