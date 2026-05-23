import ts from 'typescript';
import type { DriftError, DriftExtractedContract } from '../../../types.js';
import { driftError } from '../../errors.js';
import { moduleSpecifierCandidates } from '../../module-specifier.js';

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
export function checkSsotUsage(contract: DriftExtractedContract, text: string): DriftError[] {
  const errors: DriftError[] = [];
  const invariants = contract.invariants ?? [];
  const ssot = contract.ssot ?? {};

  for (const invariant of invariants) {
    if (invariant.enforce !== 'drift/ssot-usage' || !invariant.ssot) continue;
    const ssotPath = ssot[invariant.ssot];
    if (!ssotPath) continue;
    if (!usesSsot(text, contract, ssotPath)) {
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

function usesSsot(text: string, contract: DriftExtractedContract, ssotPath: string): boolean {
  const anchoredText = text.slice(contract.bodyStart, contract.bodyEnd);
  const ssotCandidates = moduleSpecifierCandidates(ssotPath);
  if (ssotCandidates.some((candidate) => anchoredText.includes(candidate))) return true;

  // V1 treats imports as sufficient SSOT usage. This is intentionally shallow:
  // the goal is catching obvious local replacements, not proving data flow.
  const sourceFile = ts.createSourceFile(contract.file, text, ts.ScriptTarget.Latest, true);
  return sourceFile.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
    const importedPath = statement.moduleSpecifier.text;
    return ssotCandidates.includes(importedPath);
  });
}
