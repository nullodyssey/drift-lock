import { extractContractsFromSource } from '@drift-lock/core';
import { getRuleOptions, relativeFilename, reportDriftError } from '../utils.js';

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
