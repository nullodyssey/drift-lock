import ts from 'typescript';
import type { DriftError, DriftExtractedContract } from '../../../types.js';
import { checkReturnExpression, checkStatements, hasUnsupportedMutation } from './control.js';
import { flowNotProven, unsupportedForSinks } from './diagnostics.js';
import { createInitialEnv } from './env.js';
import { findHelperImports } from './helpers.js';
import { findTrustedImports } from './imports.js';
import type { FlowContext, FlowOptions, FunctionLikeWithBody } from './types.js';

/* @drift
version: 1
id: core.ssot-flow.rule
scope: file
stability: locked

intent: >
  Orchestrate the SSOT flow rule across trusted imports, local provenance,
  control-flow analysis, sink resolution, and diagnostics.

ssot:
  imports: "./imports.ts"
  control: "./control.ts"
  env: "./env.ts"
  diagnostics: "./diagnostics.ts"

invariants:
  - id: rule-uses-trusted-import-resolution
    enforce: drift/ssot-usage
    ssot: imports
  - id: rule-uses-control-flow-checks
    enforce: drift/ssot-usage
    ssot: control
  - id: rule-uses-flow-environment
    enforce: drift/ssot-usage
    ssot: env
  - id: rule-uses-flow-diagnostics
    enforce: drift/ssot-usage
    ssot: diagnostics

llm:
  must_not_change:
    - checkSsotFlow must remain the rule entrypoint consumed by checker and ESLint.
    - Unsupported functions or missing trusted imports must fail without silent success.
    - The public behavior must stay compatible except for stricter unsupported dependency handling.
*/
export type CheckSsotFlowOptions = FlowOptions;

export function checkSsotFlow(contract: DriftExtractedContract, text: string, options: CheckSsotFlowOptions = {}): DriftError[] {
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

    const context: FlowContext = { sourceFile, contract, invariant };
    if (!functionNode?.body) {
      errors.push(...unsupportedForSinks(context, sinks, 'unsupported-return'));
      continue;
    }

    errors.push(...checkFunctionFlow(context, functionNode, ssotPath, options));
  }

  return errors;
}

function checkFunctionFlow(context: FlowContext, functionNode: FunctionLikeWithBody, ssotPath: string, options: FlowOptions): DriftError[] {
  const errors: DriftError[] = [];
  const sinks = context.invariant.sinks ?? [];
  const body = functionNode.body;
  if (!body) return unsupportedForSinks(context, sinks, 'unsupported-return');
  const trustedImports = findTrustedImports(context.sourceFile, ssotPath);
  const helperImports = findHelperImports(context.sourceFile, context.contract.file, options.helperContracts ?? [], ssotPath);

  if (trustedImports.values.size === 0 && trustedImports.namespaces.size === 0 && helperImports.size === 0) {
    return sinks.map((sink) => flowNotProven(context, sink));
  }

  if (hasUnsupportedMutation(body)) {
    return unsupportedForSinks(context, sinks, 'unsupported-mutation');
  }

  const env = createInitialEnv(trustedImports, functionNode.parameters, helperImports);

  if (ts.isBlock(body)) {
    const checked = checkStatements(context, body.statements, env);
    errors.push(...checked.errors);
    if (!checked.completed || checked.breaks || checked.fallsThrough) {
      errors.push(...unsupportedForSinks(context, sinks, 'implicit-fallthrough'));
    }
  } else {
    errors.push(...checkReturnExpression(context, body, env));
  }

  return errors;
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
