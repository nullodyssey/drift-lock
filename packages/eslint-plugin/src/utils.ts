import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { DriftError } from '@drift-lock/core';

/* @drift
version: 1
id: eslint.utils
scope: file
stability: locked

intent: >
  Share ESLint rule helpers for DriftLock root resolution, config index lookup,
  normalized filenames, and diagnostic reporting.

ssot:
  core: "@drift-lock/core"

invariants:
  - id: reporter-uses-core-errors
    enforce: drift/ssot-usage
    ssot: core

llm:
  must_not_change:
    - Rules must normalize filenames relative to the configured root.
    - ESLint reporting must preserve Drift diagnostic messages and locations.
    - Missing config must keep the default generated index store path.
*/
export type RuleOptions = {
  root?: string;
  indexPath?: string;
};

export function getRuleOptions(context: any): Required<RuleOptions> {
  const options = (context.options?.[0] ?? {}) as RuleOptions;
  const root = path.resolve(options.root ?? process.cwd());
  const config = readConfigSync(root);
  return {
    root,
    indexPath: options.indexPath ?? config.index,
  };
}

export function relativeFilename(root: string, filename: string): string {
  if (!filename || filename === '<input>') return filename;
  const absoluteFilename = path.isAbsolute(filename) ? filename : path.resolve(root, filename);
  return path.relative(root, absoluteFilename).split(path.sep).join('/');
}

export function reportDriftError(context: any, error: DriftError): void {
  context.report({
    loc: {
      line: error.line ?? 1,
      column: Math.max((error.column ?? 1) - 1, 0),
    },
    message: error.message,
  });
}

function readConfigSync(root: string): { index: string } {
  try {
    const parsed = JSON.parse(readFileSync(path.join(root, '.drift/config.json'), 'utf8')) as { index?: unknown };
    if (typeof parsed.index === 'string' && parsed.index.trim()) return { index: parsed.index };
  } catch {
    // ESLint rules should keep the historical default when config is absent.
  }
  return { index: '.drift/contracts.generated.index' };
}
