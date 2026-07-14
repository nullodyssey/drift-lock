import path from 'node:path';
import type { DriftError, DriftExtractedContract, DriftSource } from '../types.js';
import { extractContracts } from './extractor.js';
import { moduleFileCandidates } from './contract-paths.js';

/* @drift
version: 1
id: core.context-renderer
scope: file
stability: locked

intent: >
  Render the Drift contract context for a target file: the contracts anchored on it
  and the contracts that declare it as a source of truth, so an agent sees everything
  a change to that file can break — derived from the file, never predicted.

ssot:
  extractor: "./extractor.ts"
  contract-paths: "./contract-paths.ts"

invariants:
  - id: context-from-extracted-contracts
    enforce: drift/ssot-usage
    ssot: extractor
  - id: context-expands-ssot-candidates
    enforce: drift/ssot-usage
    ssot: contract-paths

llm:
  must_not_change:
    - File context must cover the contracts anchored on the requested file AND the contracts that declare it as an SSOT.
    - Context must never be predicted from a task prompt; it is derived only from the requested file.
    - SSOT candidate resolution must reuse contract-paths, never a local re-implementation.
*/
export async function renderContext(root: string, file: string, sourceDir?: DriftSource): Promise<{ output: string; errors: DriftError[] }> {
  const relativeFile = path.relative(path.resolve(root), path.resolve(root, file)).split(path.sep).join('/');

  // Anchored: the contracts written on this file. Extracted from the file itself so a
  // target outside the configured source dirs still renders.
  const anchoredExtract = await extractContracts({ root, files: [relativeFile] });
  if (anchoredExtract.errors.length > 0) return { output: '', errors: anchoredExtract.errors };
  const anchored = anchoredExtract.contracts.filter((contract) => contract.file === relativeFile);

  // Impacted: contracts anchored ELSEWHERE that declare this file as a source of truth.
  // Editing an SSOT can break the contract that depends on it, so the necessary set for a
  // file is not only the contracts written on it. Resolution reuses the same candidate
  // rule the index and the git scope use — never a local re-implementation.
  const corpus = await extractContracts({ root, sourceDir });
  if (corpus.errors.length > 0) return { output: '', errors: corpus.errors };
  const impacted = corpus.contracts.filter(
    (contract) => contract.file !== relativeFile && declaresSsotFile(contract, relativeFile, sourceDir),
  );

  if (anchored.length === 0 && impacted.length === 0) {
    return { output: `Relevant Drift Contracts\n\nNo @drift contracts found for ${relativeFile}.`, errors: [] };
  }

  const lines = ['Relevant Drift Contracts', ''];

  for (const contract of anchored) {
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

  if (impacted.length > 0) {
    if (anchored.length > 0) lines.push('');
    lines.push(`Contracts that declare ${relativeFile} as a source of truth (changing it can break them):`, '');
    for (const contract of impacted) {
      lines.push(`- ${contract.id}`);
      lines.push(`  file: ${contract.file}`);
      lines.push(`  stability: ${contract.stability}`);
      lines.push(`  intent: ${contract.intent}`);
      const keys = ssotKeysFor(contract, relativeFile, sourceDir);
      if (keys.length > 0) lines.push(`  depends on this file as: ${keys.join(', ')}`);
      const enforced = (contract.invariants ?? []).filter((invariant) => invariant.ssot && keys.includes(invariant.ssot));
      if (enforced.length > 0) {
        lines.push('  enforced invariants:');
        for (const invariant of enforced) lines.push(`    - ${invariant.id}: ${invariant.enforce}`);
      }
      if (contract.llm?.must_not_change?.length) {
        lines.push('  must_not_change:');
        for (const item of contract.llm.must_not_change) {
          lines.push(`    - ${item}`);
        }
      }
    }
  }

  return { output: lines.join('\n'), errors: [] };
}

/** The ssot keys under which the contract declares the target file. */
function ssotKeysFor(contract: DriftExtractedContract, targetFile: string, sourceDir?: DriftSource): string[] {
  return Object.entries(contract.ssot ?? {})
    .filter(([, ssotPath]) => moduleFileCandidates(ssotPath, { currentFile: contract.file, sourceDir }).includes(targetFile))
    .map(([key]) => key);
}

function declaresSsotFile(contract: DriftExtractedContract, targetFile: string, sourceDir?: DriftSource): boolean {
  return ssotKeysFor(contract, targetFile, sourceDir).length > 0;
}
