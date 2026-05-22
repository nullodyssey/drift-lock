import { extractContractsFromSource } from '@drift-lock/core';
import { getRuleOptions, relativeFilename, reportDriftError } from '../utils.js';

/* @drift
version: 1
id: eslint.valid-contract-rule
scope: file
stability: locked

intent: >
  Report Drift contract syntax, schema, and anchoring errors through ESLint for
  the file currently being linted.

ssot:
  core: "@drift-lock/core"
  utils: "../utils.ts"

invariants:
  - id: reports-core-extraction-errors
    enforce: drift/ssot-usage
    ssot: core
  - id: uses-shared-eslint-reporter
    enforce: drift/ssot-usage
    ssot: utils

llm:
  must_not_change:
    - The rule must report every extractor error for the current file.
    - Filenames must be normalized relative to the configured root.
*/
export const validContractRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Validate @drift contract syntax, schema, and anchoring.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          root: { type: 'string' },
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
        const text = context.sourceCode.getText();
        const result = extractContractsFromSource(file, text);

        for (const error of result.errors) {
          reportDriftError(context, error);
        }
      },
    };
  },
};
