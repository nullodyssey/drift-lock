/* @drift
version: 1
id: core.types
scope: file
stability: locked

intent: >
  Define the shared DriftLock schema, diagnostic, diff, and explanation types
  used across core, CLI, and ESLint packages.

llm:
  must_not_change:
    - Drift schema version 1 types must remain strict and explicit.
    - Diagnostic codes must stay stable for CLI, ESLint, and agent workflows.
    - Indexed contracts must omit runtime-only extraction fields.
*/
export type DriftContractId = string;

export type DriftSource = string | string[];

export type DriftScope = 'file' | 'declaration';

export type DriftStability = 'draft' | 'locked';

export type DriftAdoptionMode = 'audit' | 'warn' | 'enforce';

export type DriftDiagnosticSeverity = 'info' | 'warning' | 'error';

export type DriftSsotMap = Record<string, string>;

export type DriftInvariant = {
  id: string;
  enforce: 'drift/ssot-usage' | 'drift/ssot-flow';
  ssot?: string;
  sinks?: string[];
};

export type DriftLlm = {
  must_not_change?: string[];
};

export type DriftContract = {
  version: 1;
  id: DriftContractId;
  scope: DriftScope;
  stability: DriftStability;
  intent: string;
  ssot?: DriftSsotMap;
  invariants?: DriftInvariant[];
  llm?: DriftLlm;
};

export type DriftAnchor =
  | { type: 'file' }
  | { type: 'function'; name: string }
  | { type: 'const'; name: string };

export type DriftExtractedContract = DriftContract & {
  file: string;
  anchor: DriftAnchor;
  contentHash: string;
  bodyHash: string;
  line: number;
  column: number;
  raw: string;
  bodyStart: number;
  bodyEnd: number;
};

export type DriftContractsIndex = {
  version: 1;
  contracts: DriftIndexedContract[];
};

export type DriftSsotFlowSummary = {
  ssotPath: string;
  returns: string[];
};

export type DriftContractSummaries = {
  ssotFlow?: DriftSsotFlowSummary[];
};

export type DriftIndexedContract = Omit<DriftExtractedContract, 'raw' | 'bodyStart' | 'bodyEnd' | 'line' | 'column'> & {
  summaries?: DriftContractSummaries;
};

export type DriftContractChangeKind = 'added' | 'changed' | 'removed';

export type DriftContractChangeField = 'intent' | 'stability' | 'scope' | 'anchor' | 'ssot' | 'invariants' | 'llm' | 'file' | 'summaries' | 'body';

export type DriftInvariantChangeKind = 'added' | 'changed' | 'removed' | 'reordered';

export type DriftInvariantChangeField = 'enforce' | 'ssot' | 'sinks';

export type DriftInvariantChange = {
  id: string;
  kind: DriftInvariantChangeKind;
  enforce?: DriftInvariant['enforce'];
  fields: DriftInvariantChangeField[];
  previous?: DriftInvariant;
  current?: DriftInvariant;
  sinksAdded?: string[];
  sinksRemoved?: string[];
  previousOrder?: string[];
  currentOrder?: string[];
};

export type DriftContractChange = {
  id: string;
  kind: DriftContractChangeKind;
  file: string;
  stability?: DriftStability;
  fields: DriftContractChangeField[];
  invariantChanges?: DriftInvariantChange[];
  previous?: DriftIndexedContract;
  current?: DriftIndexedContract;
};

export type DriftContractDiff = {
  changes: DriftContractChange[];
};

export type DriftErrorCode =
  | 'DRIFT001_INVALID_YAML'
  | 'DRIFT002_UNKNOWN_FIELD'
  | 'DRIFT003_MISSING_REQUIRED_FIELD'
  | 'DRIFT004_INVALID_FIELD_VALUE'
  | 'DRIFT005_DUPLICATE_CONTRACT_ID'
  | 'DRIFT006_UNANCHORED_CONTRACT'
  | 'DRIFT007_UNSUPPORTED_SCOPE'
  | 'DRIFT008_UNSUPPORTED_INVARIANT'
  | 'DRIFT009_UNKNOWN_SSOT_REFERENCE'
  | 'DRIFT010_SSOT_NOT_USED'
  | 'DRIFT011_LOCKED_CONTRACT_CHANGED'
  | 'DRIFT012_INVALID_ACCEPTANCE_FILE'
  | 'DRIFT013_SSOT_FLOW_NOT_PROVEN'
  | 'DRIFT014_UNSUPPORTED_FLOW_PATTERN'
  | 'DRIFT015_REQUIRED_CONTRACT_MISSING';

export type DriftError = {
  code: DriftErrorCode;
  message: string;
  file: string;
  contractId?: string;
  line?: number;
  column?: number;
  details?: Record<string, unknown>;
};

export type DriftDiagnostic = DriftError & {
  severity: DriftDiagnosticSeverity;
};

export type DriftExplanation = {
  code: DriftErrorCode;
  message: string;
  file: string;
  line?: number;
  column?: number;
  contractId?: string;
  contract?: {
    id: string;
    file: string;
    stability: DriftStability;
  };
  invariantId?: string;
  sink?: string;
  ssot?: string;
  reason?: string;
  foundExpression?: string;
  foundNodeKind?: string;
  expected: string;
  found: string;
  suggestedFix: string;
};

export type DriftResult<T> = {
  value?: T;
  errors: DriftError[];
};
