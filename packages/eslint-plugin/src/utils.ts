import path from 'node:path';
import type { DriftError } from '@drift/core';

export type RuleOptions = {
  root?: string;
  indexPath?: string;
};

export function getRuleOptions(context: any): Required<RuleOptions> {
  const options = (context.options?.[0] ?? {}) as RuleOptions;
  return {
    root: path.resolve(options.root ?? process.cwd()),
    indexPath: options.indexPath ?? '.drift/contracts.generated.json',
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
