import { describe, expect, it } from 'vitest';
import * as core from '@drift-lock/core';

describe('core public engine facade', () => {
  it('exports only the stable runtime surface used by official packages', () => {
    expect(Object.keys(core).sort()).toEqual([
      'checkContracts',
      'checkGeneratedIndex',
      'checkLockedChangesForFile',
      'checkSsotFlow',
      'checkSsotUsage',
      'defaultDriftConfig',
      'diffContracts',
      'explainContracts',
      'extractContracts',
      'extractContractsFromSource',
      'formatContractDiffSummary',
      'formatCoverageSummary',
      'formatDiagnostics',
      'formatErrors',
      'formatExplanations',
      'formatProofReportJson',
      'formatProofReportMarkdown',
      'getCoverage',
      'getProofReport',
      'openIndexStore',
      'readDriftConfig',
      'readIndexContractsForFileSync',
      'readIndexHelperContractsForFileSync',
      'renderContext',
      'toIndex',
      'writeAcceptanceFile',
      'writeIndexStore',
      'writeIndexStoreSync',
    ]);
  });
});
