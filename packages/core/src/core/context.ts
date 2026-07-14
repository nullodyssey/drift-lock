import path from 'node:path';
import type { DriftError } from '../types.js';
import { extractContracts } from './extractor.js';

/* @drift
version: 1
id: core.context-renderer
scope: file
stability: locked

intent: >
  Render concise Drift contract context for a target file so agents can plan edits
  against the constraints actually declared on the code they are about to change.

ssot:
  extractor: "./extractor.ts"

invariants:
  - id: context-from-extracted-contracts
    enforce: drift/ssot-usage
    ssot: extractor

llm:
  must_not_change:
    - File context must stay scoped to the requested file.
    - Context must never be predicted from a task prompt; it is derived only from the requested file.
*/
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
