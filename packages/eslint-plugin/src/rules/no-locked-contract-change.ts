import { readFileSync } from 'node:fs';
import path from 'node:path';
import { checkLockedChangesForFile, type DriftContractsIndex, extractContractsFromSource, validateIndexObject } from '@drift-lock/core';
import { getRuleOptions, relativeFilename, reportDriftError } from '../utils.js';

/* @drift
version: 1
id: eslint.no-locked-contract-change-rule
scope: file
stability: locked

intent: >
  Report silent edits to locked Drift contracts by comparing the current file
  against the committed Drift index during ESLint runs.

ssot:
  core: "@drift-lock/core"
  utils: "../utils.ts"

invariants:
  - id: delegates-locked-checks-to-core
    enforce: drift/ssot-usage
    ssot: core
  - id: uses-shared-eslint-reporter
    enforce: drift/ssot-usage
    ssot: utils

llm:
  must_not_change:
    - Missing indexes must be ignored so projects can lint before extraction.
    - Invalid indexes must be reported as lint failures.
    - Locked-change checks must stay scoped to the linted file.
*/
type IndexReadResult =
  | { status: 'missing' }
  | { status: 'loaded'; index: DriftContractsIndex }
  | { status: 'invalid'; message: string };

const indexCache = new Map<string, IndexReadResult>();

export const noLockedContractChangeRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent silent changes to locked @drift contracts from the committed index.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          root: { type: 'string' },
          indexPath: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context: any) {
    return {
      Program() {
        const options = getRuleOptions(context);
        const indexResult = readIndexSync(options.root, options.indexPath);
        if (indexResult.status === 'missing') return;
        if (indexResult.status === 'invalid') {
          context.report({
            loc: { line: 1, column: 0 },
            message: indexResult.message,
          });
          return;
        }

        const file = relativeFilename(options.root, context.getFilename());
        const text = context.sourceCode.getText();
        const result = extractContractsFromSource(file, text);
        const errors = checkLockedChangesForFile(options.root, file, result.contracts, indexResult.index);

        for (const error of errors) {
          reportDriftError(context, error);
        }
      },
    };
  },
};

function readIndexSync(root: string, indexPath: string): IndexReadResult {
  const absoluteIndexPath = path.resolve(root, indexPath);
  const cached = indexCache.get(absoluteIndexPath);
  if (cached) return cached;

  try {
    const parsed = JSON.parse(readFileSync(absoluteIndexPath, 'utf8')) as unknown;
    const index = validateIndexObject(parsed, indexPath);
    const result: IndexReadResult = { status: 'loaded', index };
    indexCache.set(absoluteIndexPath, result);
    return result;
  } catch (error) {
    if (isMissingFileError(error)) {
      const result: IndexReadResult = { status: 'missing' };
      indexCache.set(absoluteIndexPath, result);
      return result;
    }

    const result: IndexReadResult = {
      status: 'invalid',
      message: `DRIFT_INDEX_INVALID: Invalid Drift contracts index at "${indexPath}".`,
    };
    indexCache.set(absoluteIndexPath, result);
    return result;
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}
