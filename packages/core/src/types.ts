export type DriftContractId = string;

export type DriftScope = 'file' | 'declaration';

export type DriftStability = 'draft' | 'locked';

export type DriftSsotMap = Record<string, string>;

export type DriftInvariant = {
  id: string;
  enforce: 'drift/ssot-usage';
  ssot?: string;
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
  line: number;
  column: number;
  raw: string;
  bodyStart: number;
  bodyEnd: number;
};

export type DriftContractsIndex = {
  version: 1;
  contracts: Array<Omit<DriftExtractedContract, 'raw' | 'bodyStart' | 'bodyEnd' | 'line' | 'column'>>;
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
  | 'DRIFT012_INVALID_ACCEPTANCE_FILE';

export type DriftError = {
  code: DriftErrorCode;
  message: string;
  file: string;
  contractId?: string;
  line?: number;
  column?: number;
  details?: Record<string, unknown>;
};

export type DriftResult<T> = {
  value?: T;
  errors: DriftError[];
};
