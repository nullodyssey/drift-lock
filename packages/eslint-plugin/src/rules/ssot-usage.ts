import { checkSsotUsage, extractContractsFromSource } from '@drift/core';
import { getRuleOptions, relativeFilename, reportDriftError } from '../utils.js';

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
