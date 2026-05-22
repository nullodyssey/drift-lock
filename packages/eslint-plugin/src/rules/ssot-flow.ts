import { checkSsotFlow, extractContractsFromSource } from '@drift-lock/core';
import { getRuleOptions, relativeFilename, reportDriftError } from '../utils.js';

/* @drift
version: 1
id: eslint.ssot-flow-rule
scope: file
stability: locked

intent: >
  Report Drift SSOT flow violations through ESLint for contracts extracted from
  the file currently being linted.

ssot:
  core: "@drift-lock/core"
  utils: "../utils.ts"

invariants:
  - id: delegates-flow-checks-to-core
    enforce: drift/ssot-usage
    ssot: core
  - id: uses-shared-eslint-reporter
    enforce: drift/ssot-usage
    ssot: utils

llm:
  must_not_change:
    - The rule must only evaluate contracts extracted from the current file.
    - Every SSOT flow error must be forwarded through the shared reporter.
*/
export const ssotFlowRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure declared return sinks derive from required SSOT paths.',
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
          for (const error of checkSsotFlow(contract, text)) {
            reportDriftError(context, error);
          }
        }
      },
    };
  },
};
