import path from 'node:path';
import type { DriftError, DriftExtractedContract, DriftInvariant, DriftSource } from '../types.js';
import { extractContracts } from './extractor.js';
import { normalizePath } from './files.js';

/* @drift
version: 1
id: core.context-renderer
scope: file
stability: locked

intent: >
  Render concise Drift contract context for a target file or task so agents can
  plan edits against declared constraints.

llm:
  must_not_change:
    - File context must stay scoped to the requested file.
    - Task context must rank contracts from ids, files, intents, SSOT, invariants, and LLM notes.
    - Planning notes must continue telling agents to run diff and check after edits.
*/
export type RenderTaskContextOptions = {
  root: string;
  sourceDir?: DriftSource;
  task: string;
};

export async function renderContext(root: string, file: string): Promise<{ output: string; errors: DriftError[] }> {
  const relativeFile = path.relative(path.resolve(root), path.resolve(root, file)).split(path.sep).join('/');
  // Context is intentionally scoped to the requested file in V1. Cross-file graph
  // expansion belongs to later versions once product/domain contracts exist.
  const extracted = await extractContracts({ root, files: [relativeFile] });
  if (extracted.errors.length > 0) return { output: '', errors: extracted.errors };

  const contracts = extracted.contracts.filter((contract) => contract.file === relativeFile);
  if (contracts.length === 0) {
    return { output: `Relevant Drift Contracts\n\nNo @drift contracts found for ${relativeFile}.`, errors: [] };
  }

  const lines = ['Relevant Drift Contracts', ''];
  for (const contract of contracts) {
    lines.push(`- ${contract.id}`);
    lines.push(`  scope: ${contract.scope}`);
    lines.push(`  stability: ${contract.stability}`);
    lines.push(`  intent: ${contract.intent}`);
    if (contract.ssot) {
      lines.push('  ssot:');
      for (const [key, value] of Object.entries(contract.ssot)) {
        lines.push(`    ${key}: ${value}`);
      }
    }
    if (contract.llm?.must_not_change?.length) {
      lines.push('  must_not_change:');
      for (const item of contract.llm.must_not_change) {
        lines.push(`    - ${item}`);
      }
    }
  }

  return { output: lines.join('\n'), errors: [] };
}

export async function renderTaskContext(options: RenderTaskContextOptions): Promise<{ output: string; errors: DriftError[] }> {
  const extracted = await extractContracts({ root: options.root, sourceDir: options.sourceDir });
  if (extracted.errors.length > 0) return { output: '', errors: extracted.errors };

  const rankedContracts = extracted.contracts
    .map((contract) => ({ contract, score: scoreContractForTask(contract, options.task) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.contract.id.localeCompare(b.contract.id));

  const lines = ['Drift Context For Task', '', 'Task:', options.task, '', 'Relevant Drift Contracts:'];
  if (rankedContracts.length === 0) {
    lines.push('No relevant @drift contracts found for this task.');
  } else {
    for (const { contract } of rankedContracts) {
      lines.push(...formatTaskContract(contract));
    }
  }

  lines.push('', 'Relevant Files:');
  const relevantFiles = relevantTaskFiles(rankedContracts.map((item) => item.contract));
  if (relevantFiles.length === 0) {
    lines.push('No relevant files found.');
  } else {
    for (const file of relevantFiles) lines.push(`- ${file}`);
  }

  lines.push(
    '',
    'Planning Notes:',
    '- Update declared SSOT files before changing derived behavior.',
    '- Respect locked contracts and listed invariants while planning.',
    '- Run drift-lock diff --summary after implementation.',
    '- Run drift-lock check after implementation.',
  );

  return { output: lines.join('\n'), errors: [] };
}

function scoreContractForTask(contract: DriftExtractedContract, task: string): number {
  const tokens = tokenize(task);
  if (tokens.length === 0) return 0;

  let score = 0;
  score += scoreText(tokens, contract.id, 6);
  score += scoreText(tokens, contract.file, 6);
  score += scoreText(tokens, contract.intent, 3);

  if (contract.ssot) {
    for (const [key, value] of Object.entries(contract.ssot)) {
      score += scoreText(tokens, key, 6);
      score += scoreText(tokens, value, 6);
    }
  }

  for (const invariant of contract.invariants ?? []) {
    score += scoreText(tokens, invariant.id, 3);
    score += scoreText(tokens, invariant.enforce, 2);
    if (invariant.ssot) score += scoreText(tokens, invariant.ssot, 6);
    for (const sink of invariant.sinks ?? []) {
      score += scoreText(tokens, sink, 2);
    }
  }

  for (const item of contract.llm?.must_not_change ?? []) {
    score += scoreText(tokens, item, 2);
  }

  if (score > 0 && contract.stability === 'locked') score += 1;
  return score;
}

function scoreText(taskTokens: string[], value: string, weight: number): number {
  const valueTokens = new Set(tokenize(value));
  let matches = 0;
  for (const token of taskTokens) {
    if (valueTokens.has(token)) matches += 1;
  }
  return matches * weight;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3);
}

function formatTaskContract(contract: DriftExtractedContract): string[] {
  const lines = [`- ${contract.id}`, `  file: ${contract.file}`, `  stability: ${contract.stability}`, `  intent: ${contract.intent}`];
  if (contract.ssot) {
    lines.push('  ssot:');
    for (const [key, value] of Object.entries(contract.ssot).sort(([left], [right]) => left.localeCompare(right))) {
      lines.push(`    ${key}: ${value}`);
    }
  }
  if (contract.invariants?.length) {
    lines.push('  invariants:');
    for (const invariant of contract.invariants) {
      lines.push(`    - ${formatTaskInvariant(invariant)}`);
    }
  }
  if (contract.llm?.must_not_change?.length) {
    lines.push('  must_not_change:');
    for (const item of contract.llm.must_not_change) lines.push(`    - ${item}`);
  }
  return lines;
}

function formatTaskInvariant(invariant: DriftInvariant): string {
  const details = [`${invariant.id}: ${invariant.enforce}`];
  if (invariant.ssot) details.push(`ssot=${invariant.ssot}`);
  if (invariant.sinks?.length) details.push(`sinks=${invariant.sinks.join(', ')}`);
  return details.join(' ');
}

function relevantTaskFiles(contracts: DriftExtractedContract[]): string[] {
  const files = new Set<string>();
  for (const contract of contracts) {
    files.add(contract.file);
    for (const value of Object.values(contract.ssot ?? {})) {
      files.add(resolveTaskSsotFile(contract.file, value));
    }
  }
  return [...files].sort((a, b) => a.localeCompare(b));
}

function resolveTaskSsotFile(contractFile: string, ssotPath: string): string {
  const normalized = normalizePath(ssotPath);
  if (normalized.startsWith('./') || normalized.startsWith('../')) {
    return normalizePath(path.posix.join(path.posix.dirname(contractFile), normalized));
  }
  return normalized;
}
