import { checkLockedChangesForFile, extractContractsFromSource, readIndexContractsForFileSync } from '@drift-lock/core';
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
        const file = relativeFilename(options.root, context.getFilename());
        const indexResult = readIndexContractsForFileSync(options.root, options.indexPath, file);
        if (indexResult.status === 'missing') return;
        if (indexResult.status === 'invalid') {
          context.report({
            loc: { line: 1, column: 0 },
            message: indexResult.message,
          });
          return;
        }

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
