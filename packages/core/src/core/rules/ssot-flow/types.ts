import type ts from 'typescript';
import type { DriftError, DriftExtractedContract, DriftIndexedContract, DriftInvariant } from '../../../types.js';

/* @drift
version: 1
id: core.ssot-flow.types
scope: file
stability: draft

intent: >
  Define internal SSOT flow engine types shared by provenance, control-flow,
  sink resolution, and diagnostics modules.

llm:
  must_not_change:
    - Flow reason strings must stay stable because explain and agents consume them.
    - Flow trust states must distinguish untrusted values from unsupported patterns.
*/
export type FlowTrust = 'trusted' | 'untrusted' | 'unsupported';

export type FlowReason =
  | 'missing-sink'
  | 'untrusted-value'
  | 'unsupported-call'
  | 'unverified-helper-call'
  | 'unsupported-return'
  | 'unsupported-spread'
  | 'unsupported-mutation'
  | 'implicit-fallthrough'
  | 'unsupported-switch-fallthrough'
  | 'unsupported-pattern';

export type FlowObjectSummary = {
  returns: string[];
  path: string[];
};

export type FlowHelperSummary = {
  returns: string[];
};

export type FlowImportResolution = {
  values: Set<string>;
  namespaces: Set<string>;
};

export type FlowValue = {
  trust: FlowTrust;
  reason?: FlowReason;
  nodeKind?: string;
  objectSummary?: FlowObjectSummary;
  helperSummary?: FlowHelperSummary;
  namespaceImport?: true;
};

export type FlowEnv = Map<string, FlowValue>;

export type FlowHelperImports = Map<string, FlowHelperSummary | undefined>;

export type FlowOptions = {
  helperContracts?: DriftIndexedContract[];
};

export type FlowContext = {
  sourceFile: ts.SourceFile;
  contract: DriftExtractedContract;
  invariant: DriftInvariant;
};

export type FlowCheckResult = {
  errors: DriftError[];
  completed: boolean;
  breaks: boolean;
  fallsThrough: boolean;
};

export type FlowErrorDetails = {
  nodeKind?: string;
  foundExpression?: string;
  foundNodeKind?: string;
};

export type FunctionLikeWithBody = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

export type SinkPathSegment = {
  name: string;
  collection: boolean;
};

export type SinkResolution =
  | { kind: 'found'; expression: ts.Expression }
  | { kind: 'collection'; expression: ts.Expression; itemPath: SinkPathSegment[] }
  | { kind: 'missing' }
  | { kind: 'unsupported' };

export const untrusted: FlowValue = { trust: 'untrusted' };
export const trusted: FlowValue = { trust: 'trusted' };
export const unsupported: FlowValue = { trust: 'unsupported', reason: 'unsupported-pattern' };
