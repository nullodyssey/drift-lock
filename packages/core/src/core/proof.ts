import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  DriftAdoptionMode,
  DriftContractChange,
  DriftDiagnostic,
  DriftError,
  DriftContractsIndex,
  DriftIndexedContract,
  DriftProofAcceptanceStatus,
  DriftProofContractOutcome,
  DriftProofReport,
  DriftProofResolution,
  DriftSource,
} from '../types.js';
import { checkContracts } from './checker.js';
import { diffContracts, diffContractSets } from './contract-diff.js';
import { getCoverage } from './coverage.js';
import { filterIndexByFiles, resolveGitFileScope } from './git-scope.js';
import { defaultIndexPath, readIndex, toIndex, validateIndexObject } from './index-file.js';
import { getAcceptanceStatus } from './locked-contracts.js';

/* @drift
version: 1
id: core.proof-report
scope: file
stability: draft

intent: >
  Compose existing DriftLock check, diff, coverage, and Git scope signals into
  a stateless pull request proof report.

ssot:
  checker: "./checker.ts"
  contract-diff: "./contract-diff.ts"
  coverage: "./coverage.ts"
  git-scope: "./git-scope.ts"
  locked-contracts: "./locked-contracts.ts"

invariants:
  - id: proof-runs-checks
    enforce: drift/ssot-usage
    ssot: checker
  - id: proof-uses-contract-diff
    enforce: drift/ssot-usage
    ssot: contract-diff
  - id: proof-uses-coverage
    enforce: drift/ssot-usage
    ssot: coverage
  - id: proof-reuses-git-scope
    enforce: drift/ssot-usage
    ssot: git-scope
  - id: proof-reuses-acceptance-status
    enforce: drift/ssot-usage
    ssot: locked-contracts

llm:
  must_not_change:
    - Proof must compose existing Drift checks instead of creating a second verifier.
    - Stateless proof must not claim counterfactual regressions were prevented.
    - Unresolved drift must stay report-only in the MVP.
*/
export type ProofReportOptions = {
  root: string;
  sourceDir?: DriftSource;
  indexPath?: string;
  gitBase: string;
  requireContracts?: string[];
  adoptionMode?: DriftAdoptionMode;
};

const execFileAsync = promisify(execFile);
const gitIndexMaxBufferBytes = 64 * 1024 * 1024;

export async function getProofReport(options: ProofReportOptions): Promise<{
  report: DriftProofReport;
  errors: DriftError[];
}> {
  const root = path.resolve(options.root);
  const index = await readIndex(root, options.indexPath);
  const gitScope = await resolveGitFileScope(root, options.gitBase, options.sourceDir, index);
  const baseIndex = await readIndexAtGitBase(root, options.gitBase, options.indexPath);
  const diff = await diffContracts({
    root,
    sourceDir: options.sourceDir,
    indexPath: options.indexPath,
    gitBase: options.gitBase,
  });
  const scopedBaseIndex = baseIndex ? filterIndexByFiles(baseIndex, gitScope.contractFiles) : undefined;
  const proofDiff = diffContractSets(toIndex(diff.contracts).contracts, scopedBaseIndex?.contracts ?? []);
  const check = await checkContracts({
    root,
    sourceDir: options.sourceDir,
    indexPath: options.indexPath,
    changedOnly: true,
    gitBase: options.gitBase,
    requireContracts: options.requireContracts,
    adoptionMode: options.adoptionMode,
  });
  const coverage = await getCoverage({
    root,
    sourceDir: options.sourceDir,
    requireContracts: options.requireContracts,
  });

  const diagnostics = check.diagnostics;
  const outcomes = buildOutcomes(root, diff.contracts, proofDiff.changes, diagnostics);
  const unresolved = outcomes.filter((outcome) => outcome.resolution === 'unresolved').length;
  const accepted = outcomes.filter((outcome) => outcome.acceptance.status === 'valid').length;
  const preserved = outcomes.filter((outcome) => outcome.resolution === 'preserved').length;
  const explicit = outcomes.filter((outcome) => outcome.resolution === 'explicit_change').length;
  const protectedContractsTouched = outcomes.length;

  return {
    report: {
      version: 1,
      gitBase: options.gitBase,
      changedFiles: gitScope.changedFiles,
      summary: {
        protectedContractsTouched,
        contractChanges: {
          added: proofDiff.changes.filter((change) => change.kind === 'added').length,
          changed: proofDiff.changes.filter((change) => change.kind === 'changed').length,
          removed: proofDiff.changes.filter((change) => change.kind === 'removed').length,
          accepted,
          unresolved,
        },
        currentViolations: diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length,
        intentPreservationRate: protectedContractsTouched === 0 ? 1 : (preserved + explicit) / protectedContractsTouched,
      },
      outcomes,
      diagnostics,
      coverage: {
        requiredFilesCovered: coverage.coverage.files.requiredCovered,
        requiredFilesUncovered: coverage.coverage.files.requiredUncovered,
      },
    },
    errors: [],
  };
}

export function formatProofReportMarkdown(report: DriftProofReport): string {
  const preserved = report.outcomes.filter((outcome) => outcome.resolution === 'preserved').length;
  const explicit = report.outcomes.filter((outcome) => outcome.resolution === 'explicit_change').length;
  const unresolved = report.summary.contractChanges.unresolved;
  const lines = [
    '## DriftLock Proof Report',
    '',
    `Protected contracts touched: ${report.summary.protectedContractsTouched}`,
    `Contract changes: ${report.summary.contractChanges.accepted} accepted, ${report.summary.contractChanges.unresolved} unresolved`,
    `Current violations: ${report.summary.currentViolations}`,
    `Intent preservation: ${Math.round(report.summary.intentPreservationRate * 100)}%`,
    '',
    'Outcome:',
    `- ${preserved} protected ${plural(preserved, 'zone')} preserved.`,
    `- ${explicit} contract ${plural(explicit, 'change')} explicit.`,
    `- ${unresolved} unresolved drift before merge.`,
    '',
    'Touched contracts:',
  ];

  if (report.outcomes.length === 0) {
    lines.push('- none');
  } else {
    for (const outcome of report.outcomes) {
      lines.push(`- ${outcome.contractId}: ${outcome.resolution}`);
    }
  }

  lines.push('', 'Impact:');
  if (unresolved > 0) {
    lines.push('- Unresolved drift remains in final PR state.');
  } else {
    lines.push('- No unresolved drift detected in final PR state.');
  }
  if (report.summary.contractChanges.accepted > 0) {
    lines.push(`- Converted ${report.summary.contractChanges.accepted} protected ${plural(report.summary.contractChanges.accepted, 'behavior change')} into an explicit decision.`);
  } else if (report.summary.protectedContractsTouched > 0) {
    lines.push('- Protected intent remained explicit for touched contracts.');
  } else {
    lines.push('- No protected contracts touched by this PR.');
  }

  return lines.join('\n');
}

export function formatProofReportJson(report: DriftProofReport): DriftProofReport {
  return report;
}

function buildOutcomes(
  root: string,
  currentContracts: DriftIndexedContract[],
  changes: DriftContractChange[],
  diagnostics: DriftDiagnostic[],
): DriftProofContractOutcome[] {
  const currentById = new Map(currentContracts.map((contract) => [contract.id, contract]));
  const changeById = new Map(changes.map((change) => [change.id, change]));
  const ids = new Set([...currentById.keys(), ...changeById.keys()]);
  const outcomes: DriftProofContractOutcome[] = [];

  for (const id of ids) {
    const change = changeById.get(id);
    const contract = currentById.get(id) ?? change?.current ?? change?.previous;
    if (!contract) continue;

    const contractDiagnostics = diagnostics.filter((diagnostic) => diagnostic.contractId === id);
    const acceptance = acceptanceForChange(root, change);
    outcomes.push({
      contractId: id,
      file: contract.file,
      resolution: resolutionFor(change, contractDiagnostics, acceptance.status),
      changeKind: change?.kind,
      fields: change?.fields,
      acceptance,
      diagnostics: contractDiagnostics,
    });
  }

  return outcomes.sort((left, right) => (left.file === right.file ? left.contractId.localeCompare(right.contractId) : left.file.localeCompare(right.file)));
}

function acceptanceForChange(
  root: string,
  change: DriftContractChange | undefined,
): DriftProofContractOutcome['acceptance'] {
  if (!change || !requiresAcceptance(change)) return { status: 'not_required' };
  const acceptance = getAcceptanceStatus(root, change.id);
  return {
    status: acceptance.status as DriftProofAcceptanceStatus,
    path: acceptance.path,
    issue: acceptance.issue,
  };
}

function requiresAcceptance(change: DriftContractChange): boolean {
  if (change.previous?.stability !== 'locked') return false;
  if (!change.current) return true;
  return change.current.contentHash !== change.previous.contentHash;
}

function resolutionFor(
  change: DriftContractChange | undefined,
  diagnostics: DriftDiagnostic[],
  acceptanceStatus: DriftProofAcceptanceStatus,
): DriftProofResolution {
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return 'unresolved';
  if (acceptanceStatus === 'missing' || acceptanceStatus === 'invalid') return 'unresolved';
  if (!change) return 'preserved';
  if (change.kind !== 'changed') return 'explicit_change';
  return change.fields.some((field) => field !== 'body') ? 'explicit_change' : 'preserved';
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

async function readIndexAtGitBase(root: string, gitBase: string, indexPath = defaultIndexPath): Promise<DriftContractsIndex | undefined> {
  const relativeIndexPath = normalizeGitIndexPath(root, indexPath);
  const objectRef = `${gitBase}:${relativeIndexPath}`;

  await verifyGitBase(root, gitBase);
  if (!(await gitObjectExists(root, objectRef))) return undefined;

  try {
    const { stdout } = await execFileAsync('git', ['cat-file', 'blob', objectRef], {
      cwd: root,
      maxBuffer: gitIndexMaxBufferBytes,
    });
    return validateIndexObject(parseIndexJson(stdout, objectRef), objectRef);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid Drift contracts index')) throw error;
    throw new Error(`Unable to read Drift index at "${objectRef}": ${errorMessage(error)}`);
  }
}

async function verifyGitBase(root: string, gitBase: string): Promise<void> {
  try {
    await execFileAsync('git', ['rev-parse', '--verify', `${gitBase}^{commit}`], { cwd: root });
  } catch (error) {
    throw new Error(`Unable to verify Git base "${gitBase}": ${errorMessage(error)}`);
  }
}

async function gitObjectExists(root: string, objectRef: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['cat-file', '-e', objectRef], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

function parseIndexJson(value: string, file: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`Invalid Drift contracts index at "${file}".`);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return String(error);
}

function normalizeGitIndexPath(root: string, indexPath: string): string {
  const relative = path.isAbsolute(indexPath) ? path.relative(root, indexPath) : indexPath;
  return relative.split(path.sep).join('/');
}
