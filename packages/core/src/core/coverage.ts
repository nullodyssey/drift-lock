import path from 'node:path';
import type { DriftError, DriftExtractedContract } from '../types.js';
import { scanDisableDirectives, type DriftDisableDirectiveCoverage, type DriftDisableDirective } from './disable-directives.js';
import { extractContracts, type ExtractOptions } from './extractor.js';
import { discoverSourceFiles, normalizePath } from './files.js';

export type DriftCoverageOptions = ExtractOptions & {
  requireContracts?: string[];
};

export type DriftCoverage = {
  contracts: {
    total: number;
    locked: number;
    draft: number;
  };
  files: {
    source: number;
    withContracts: number;
    requiringContracts: number;
    requiredCovered: number;
    requiredUncovered: number;
    requiredUncoveredFiles: string[];
  };
  invariants: {
    total: number;
    executable: number;
  };
  disableDirectives: DriftDisableDirectiveCoverage;
};

export async function getCoverage(options: DriftCoverageOptions): Promise<{
  coverage: DriftCoverage;
  contracts: DriftExtractedContract[];
  errors: DriftError[];
}> {
  const root = path.resolve(options.root);
  const sourceFiles = options.files ?? (await discoverSourceFiles(root, options.sourceDir));
  const extracted = await extractContracts({ ...options, files: sourceFiles });
  const contracts = extracted.contracts;
  const requireContracts = options.requireContracts ?? [];
  const filesWithContracts = new Set(contracts.map((contract) => contract.file));
  const requiredFiles = filesMatchingRequireContractPatterns(sourceFiles, requireContracts);
  const requiredUncoveredFiles = requiredFiles.filter((file) => !filesWithContracts.has(file));
  const invariants = contracts.flatMap((contract) => contract.invariants ?? []);
  const disableDirectives = await scanDisableDirectives(root, sourceFiles);

  return {
    coverage: {
      contracts: {
        total: contracts.length,
        locked: contracts.filter((contract) => contract.stability === 'locked').length,
        draft: contracts.filter((contract) => contract.stability === 'draft').length,
      },
      files: {
        source: sourceFiles.length,
        withContracts: filesWithContracts.size,
        requiringContracts: requiredFiles.length,
        requiredCovered: requiredFiles.length - requiredUncoveredFiles.length,
        requiredUncovered: requiredUncoveredFiles.length,
        requiredUncoveredFiles,
      },
      invariants: {
        total: invariants.length,
        executable: invariants.filter((invariant) => invariant.enforce === 'drift/ssot-usage' || invariant.enforce === 'drift/ssot-flow').length,
      },
      disableDirectives,
    },
    contracts,
    errors: extracted.errors,
  };
}

export function formatCoverageSummary(coverage: DriftCoverage): string {
  const lines = [
    'Drift Coverage',
    '',
    'Contracts:',
    `- total: ${coverage.contracts.total}`,
    `- locked: ${coverage.contracts.locked}`,
    `- draft: ${coverage.contracts.draft}`,
    '',
    'Files:',
    `- source files: ${coverage.files.source}`,
    `- files with contracts: ${coverage.files.withContracts}`,
    `- files requiring contracts: ${coverage.files.requiringContracts}`,
    `- required files covered: ${coverage.files.requiredCovered}`,
    `- required files uncovered: ${coverage.files.requiredUncovered}`,
    '',
    'Invariants:',
    `- total: ${coverage.invariants.total}`,
    `- executable enforcement: ${coverage.invariants.executable}`,
    '',
    'Disable directives:',
    `- total: ${coverage.disableDirectives.total}`,
    `- malformed: ${coverage.disableDirectives.malformed}`,
    `- expired: ${coverage.disableDirectives.expired}`,
  ];

  if (coverage.files.requiredUncoveredFiles.length > 0) {
    lines.push('', 'Required files without contracts:');
    for (const file of coverage.files.requiredUncoveredFiles) lines.push(`- ${file}`);
  }

  if (coverage.disableDirectives.items.length > 0) {
    lines.push('', 'Drift disable directives:');
    for (const directive of coverage.disableDirectives.items) lines.push(formatDisableDirective(directive));
  }

  return lines.join('\n');
}

function formatDisableDirective(directive: DriftDisableDirective): string {
  const command = directive.kind === 'next-line' ? 'drift-lock-disable-next-line' : 'drift-lock-disable-file';
  const details = [
    directive.rule ?? 'unknown-rule',
    directive.reason ? `reason="${directive.reason}"` : undefined,
    directive.expires ? `expires=${directive.expires}` : undefined,
    directive.expired ? 'expired' : undefined,
    directive.malformed ? `malformed ${directive.message ?? 'invalid directive'}` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  return `- ${directive.file}:${directive.line} ${command} ${details}`;
}

export function filesMatchingRequireContractPatterns(files: string[], patterns: string[]): string[] {
  if (patterns.length === 0) return [];
  const normalizedPatterns = patterns.map(normalizePattern);
  return files
    .map(normalizePath)
    .filter((file) => normalizedPatterns.some((pattern) => matchesGlob(file, pattern)))
    .sort();
}

export function firstMatchingRequireContractPattern(file: string, patterns: string[]): string | undefined {
  const normalizedFile = normalizePath(file);
  return patterns.find((pattern) => matchesGlob(normalizedFile, normalizePattern(pattern)));
}

function normalizePattern(pattern: string): string {
  return normalizePath(pattern).replace(/^\.\//, '');
}

function matchesGlob(file: string, pattern: string): boolean {
  return globSegments(file.split('/'), pattern.split('/'));
}

function globSegments(fileSegments: string[], patternSegments: string[]): boolean {
  if (patternSegments.length === 0) return fileSegments.length === 0;
  const [patternSegment, ...restPattern] = patternSegments;

  if (patternSegment === '**') {
    if (globSegments(fileSegments, restPattern)) return true;
    return fileSegments.length > 0 && globSegments(fileSegments.slice(1), patternSegments);
  }

  if (fileSegments.length === 0) return false;
  if (!matchesSegment(fileSegments[0] ?? '', patternSegment ?? '')) return false;
  return globSegments(fileSegments.slice(1), restPattern);
}

function matchesSegment(fileSegment: string, patternSegment: string): boolean {
  if (patternSegment === '*') return true;
  if (!patternSegment.includes('*')) return fileSegment === patternSegment;
  const escaped = patternSegment.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`).test(fileSegment);
}
