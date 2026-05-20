import { checkSsotFlow, extractContractsFromSource } from '@drift-core/core';
import { getRuleOptions, relativeFilename, reportDriftError } from '../utils.js';

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
