import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildCommentBody,
  buildProofArgs,
  COMMENT_MARKER,
  createOrUpdatePrComment,
  outputsForReport,
  parseCommandInvocation,
  resolveGitBase,
  runAction,
  splitCommandLine,
} from '../src/index.js';

const proofReport = {
  version: 1,
  gitBase: 'base-sha',
  changedFiles: ['src/billing.ts'],
  summary: {
    protectedContractsTouched: 2,
    contractChanges: {
      added: 0,
      changed: 1,
      removed: 0,
      accepted: 0,
      unresolved: 1,
    },
    currentViolations: 1,
    intentPreservationRate: 0.5,
  },
  outcomes: [],
  diagnostics: [],
  coverage: {
    requiredFilesCovered: 1,
    requiredFilesUncovered: 0,
  },
};

test('parses command invocations without shell execution', () => {
  assert.deepEqual(parseCommandInvocation('pnpm exec drift-lock', '').args, ['exec', 'drift-lock']);
  assert.deepEqual(parseCommandInvocation('npx', '--yes @drift-lock/cli').args, ['--yes', '@drift-lock/cli']);
  assert.deepEqual(splitCommandLine('pnpm exec "drift lock"'), ['pnpm', 'exec', 'drift lock']);
});

test('builds proof CLI arguments from action inputs', () => {
  assert.deepEqual(
    buildProofArgs({
      root: '/repo',
      source: 'src',
      index: '.drift/contracts.generated.index',
      gitBase: 'origin/main',
      format: 'json',
    }),
    [
      'proof',
      '--root',
      '/repo',
      '--git-base',
      'origin/main',
      '--format',
      'json',
      '--source',
      'src',
      '--index',
      '.drift/contracts.generated.index',
    ],
  );
});

test('uses explicit git-base before pull request context', () => {
  assert.equal(resolveGitBase('HEAD~1', { pullRequestBaseSha: 'base-sha' }), 'HEAD~1');
  assert.equal(resolveGitBase('', { pullRequestBaseSha: 'base-sha' }), 'base-sha');
});

test('maps proof report summary to GitHub outputs', () => {
  assert.deepEqual(outputsForReport(proofReport, '/tmp/report.json', '/tmp/report.md'), {
    'protected-contracts-touched': '2',
    unresolved: '1',
    accepted: '0',
    'current-violations': '1',
    'intent-preservation-rate': '0.5',
    'report-json-path': '/tmp/report.json',
    'report-markdown-path': '/tmp/report.md',
  });
});

test('writes proof reports, step summary, and outputs', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drift-proof-action-'));
  const outputFile = path.join(tempDir, 'github-output');
  const summaryFile = path.join(tempDir, 'summary');
  const calls = [];

  await runAction({
    cwd: tempDir,
    env: {
      GITHUB_WORKSPACE: tempDir,
      GITHUB_OUTPUT: outputFile,
      GITHUB_STEP_SUMMARY: summaryFile,
      INPUT_GIT_BASE: 'base-sha',
      INPUT_DRIFT_COMMAND: 'pnpm',
      INPUT_DRIFT_COMMAND_ARGS: 'exec drift-lock',
    },
    runCommand: async (tool, args) => {
      calls.push({ tool, args });
      return args.includes('json') ? JSON.stringify(proofReport) : '## DriftLock Proof Report\n';
    },
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args.slice(0, 3), ['exec', 'drift-lock', 'proof']);
  assert.match(await fs.readFile(path.join(tempDir, '.drift/proof-report/proof-report.json'), 'utf8'), /"protectedContractsTouched": 2/);
  assert.match(await fs.readFile(path.join(tempDir, '.drift/proof-report/proof-report.md'), 'utf8'), /DriftLock Proof Report/);
  assert.match(await fs.readFile(summaryFile, 'utf8'), /DriftLock Proof Report/);
  assert.match(await fs.readFile(outputFile, 'utf8'), /unresolved<<drift_lock_/);
});

test('fails after writing reports when unresolved policy is enabled', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drift-proof-policy-'));
  await assert.rejects(
    runAction({
      cwd: tempDir,
      env: {
        GITHUB_WORKSPACE: tempDir,
        INPUT_GIT_BASE: 'base-sha',
        INPUT_FAIL_ON_UNRESOLVED: 'true',
      },
      runCommand: async (_tool, args) => (args.includes('json') ? JSON.stringify(proofReport) : '## Report\n'),
    }),
    /Unresolved DriftLock contract changes: 1/,
  );
  assert.match(await fs.readFile(path.join(tempDir, '.drift/proof-report/proof-report.json'), 'utf8'), /"unresolved": 1/);
});

test('updates an existing pull request proof comment', async () => {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init });
    if (String(url).includes('?per_page=100')) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ url: 'https://api.github.test/comment/1', body: `${COMMENT_MARKER}\nold` }],
      };
    }
    return { ok: true, status: 200 };
  };

  await createOrUpdatePrComment({
    env: { GITHUB_API_URL: 'https://api.github.test' },
    context: { owner: 'nullodyssey', repo: 'drift-lock', pullRequestNumber: 42 },
    token: 'token',
    markdown: '## Report',
    fetchImpl,
    warn: () => {},
  });

  assert.equal(requests[1].init.method, 'PATCH');
  assert.match(JSON.parse(requests[1].init.body).body, /<!-- drift-lock-proof-report -->/);
});

test('builds a bounded comment body', () => {
  const body = buildCommentBody('x'.repeat(70000));
  assert.ok(body.startsWith(COMMENT_MARKER));
  assert.ok(body.length < 61000);
  assert.match(body, /Report truncated/);
});
