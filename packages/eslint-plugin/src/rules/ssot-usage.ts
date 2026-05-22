import { checkSsotUsage, extractContractsFromSource } from '@drift-lock/core';
import { getRuleOptions, relativeFilename, reportDriftError } from '../utils.js';

/* @drift
version: 1
id: eslint.ssot-usage-rule
scope: file
stability: locked

intent: >
  Report Drift SSOT usage violations through ESLint for contracts extracted from
  the file currently being linted.

llm:
  must_not_change:
    - The rule must only evaluate contracts extracted from the current file.
    - Every SSOT usage error must be forwarded through the shared reporter.
*/
export const ssotUsageRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure code references SSOT paths required by @drift invariants.',
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

        for (const contract of result.contracts) {
          for (const error of checkSsotUsage(contract, text)) {
            reportDriftError(context, error);
          }
        }
      },
    };
  },
};
