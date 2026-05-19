import { readFileSync } from 'node:fs';
import path from 'node:path';
import { checkLockedChangesForFile, type DriftContractsIndex, extractContractsFromSource } from '@drift/core';
import { getRuleOptions, relativeFilename, reportDriftError } from '../utils.js';

const indexCache = new Map<string, DriftContractsIndex | undefined>();

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
        const index = readIndexSync(options.root, options.indexPath);
        if (!index) return;

        const file = relativeFilename(options.root, context.getFilename());
        const text = context.sourceCode.getText();
        const result = extractContractsFromSource(file, text);
        const errors = checkLockedChangesForFile(options.root, file, result.contracts, index);

        for (const error of errors) {
          reportDriftError(context, error);
        }
      },
    };
  },
};

function readIndexSync(root: string, indexPath: string): DriftContractsIndex | undefined {
  const absoluteIndexPath = path.resolve(root, indexPath);
  if (indexCache.has(absoluteIndexPath)) return indexCache.get(absoluteIndexPath);

  try {
    const index = JSON.parse(readFileSync(absoluteIndexPath, 'utf8')) as DriftContractsIndex;
    indexCache.set(absoluteIndexPath, index);
    return index;
  } catch {
    indexCache.set(absoluteIndexPath, undefined);
    return undefined;
  }
}
