import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DriftContractsIndex, DriftIndexedContract } from '../types.js';
import type { DriftIndexStore } from './index-file.js';
import { normalizePath } from './files.js';

/* @drift
version: 1
id: core.helper-summaries
scope: file
stability: draft

intent: >
  Build the global helper summary context used by SSOT flow checks while
  preserving current extracted contracts over committed index entries.

llm:
  must_not_change:
    - Helper summaries must use the full index, not the Git-scoped index.
    - Current extracted contracts must override committed index entries.
*/
export function buildHelperContracts(index: DriftContractsIndex | undefined, current: DriftIndexedContract[]): DriftIndexedContract[] {
  const byId = new Map<string, DriftIndexedContract>();
  for (const contract of index?.contracts ?? []) byId.set(contract.id, contract);
  for (const contract of current) byId.set(contract.id, contract);
  return [...byId.values()];
}

export async function buildHelperContractsFromStore(
  root: string,
  store: DriftIndexStore | undefined,
  current: DriftIndexedContract[],
  files?: string[],
): Promise<DriftIndexedContract[]> {
  if (!store) return buildHelperContracts(undefined, current);
  if (!files) return buildHelperContracts(await store.materializeIndex(), current);

  const helperFiles = new Set<string>();
  for (const file of files) {
    let source: string;
    try {
      source = await readFile(path.resolve(root, file), 'utf8');
    } catch {
      continue;
    }
    for (const candidate of helperImportFileCandidates(file, source)) helperFiles.add(candidate);
  }

  const lookup = await store.getContractIdsForFiles([...helperFiles], { includeHelperCandidates: true });
  const helpers = await store.getContractsByIds(lookup.helperCandidateContractIds);
  return buildHelperContracts({ version: 1, contracts: helpers }, current);
}

function helperImportFileCandidates(currentFile: string, source: string): string[] {
  const candidates = new Set<string>();
  for (const moduleSpecifier of importModuleSpecifiers(source)) {
    if (moduleSpecifier.startsWith('.')) {
      addFileCandidates(candidates, normalizePath(path.posix.join(path.posix.dirname(currentFile), moduleSpecifier)));
    } else {
      addFileCandidates(candidates, normalizePath(moduleSpecifier));
      addFileCandidates(candidates, stripModulePrefix(normalizePath(moduleSpecifier)));
    }
  }
  return [...candidates].filter((candidate) => candidate.length > 0);
}

function importModuleSpecifiers(source: string): string[] {
  const modules = new Set<string>();
  const pattern = /\bimport\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (match[1]) modules.add(match[1]);
  }
  return [...modules];
}

function addFileCandidates(candidates: Set<string>, value: string): void {
  const normalized = normalizePath(value).replace(/^\.\//, '');
  if (!normalized) return;
  candidates.add(normalized);
  const extensionless = normalized.replace(/\.(tsx|ts|jsx|js)$/, '');
  candidates.add(extensionless);
  candidates.add(`${extensionless}.ts`);
  candidates.add(`${extensionless}.tsx`);
  candidates.add(`${extensionless}.js`);
  candidates.add(`${extensionless}.jsx`);
}

function stripModulePrefix(value: string): string {
  return value.replace(/^(@\/|~\/|\.\/|\/)/, '');
}
