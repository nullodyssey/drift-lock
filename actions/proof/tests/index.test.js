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
  optionalRatioInput,
  outputsForReport,
  parseCommandInvocation,
  proofPolicyFailures,
  resolveGitBase,
  runAction,
  sanitizeProofEnv,
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
  generatedIndex: {
    status: 'dirty',
    changedPaths: ['.drift/contracts.generated.index/manifest.json'],
  },
};

test('parses command invocations without shell execution', () => {
  assert.deepEqual(parseCommandInvocation('pnpm exec drift-lock', '').args, ['exec', 'drift-lock']);
  assert.deepEqual(parseCommandInvocation('npx', '--yes @drift-lock/cli@latest').args, ['--yes', '@drift-lock/cli@latest']);
  assert.deepEqual(splitCommandLine('pnpm exec "drift lock"'), ['pnpm', 'exec', 'drift lock']);
});

test('scrubs GitHub tokens before spawning drift-lock proof', () => {
  assert.deepEqual(
    sanitizeProofEnv(
      {
        PATH: '/usr/bin',
        'INPUT_GITHUB-TOKEN': 'secret-token',
        INPUT_GITHUB_TOKEN: 'secret-token',
        GITHUB_TOKEN: 'secret-token',
        GH_TOKEN: 'secret-token',
        TOKEN_COPY: 'secret-token',
        DRIFT_SAFE_VALUE: 'keep-me',
      },
      'secret-token',
    ),
    {
      PATH: '/usr/bin',
      DRIFT_SAFE_VALUE: 'keep-me',
    },
  );
});

test('builds proof CLI arguments from action inputs', () => {
  assert.deepEqual(
    buildProofArgs({
      root: '/repo',
      source: 'src',
      index: '.drift/contracts.generated.index',
      gitBase: 'origin/main',
      format: 'json',
      failOnUnresolved: true,
      failOnViolations: true,
      failOnDirtyIndex: true,
      minPreservationRate: 0.95,
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

test('parses optional preservation rate inputs', () => {
  assert.equal(optionalRatioInput('', 'min-preservation-rate'), undefined);
  assert.equal(optionalRatioInput('0.95', 'min-preservation-rate'), 0.95);
  assert.throws(() => optionalRatioInput('1.5', 'min-preservation-rate'), /Invalid ratio input/);
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

test('does not pass github-token inputs to proof command env', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drift-proof-scrub-'));
  const seenEnvs = [];

  await runAction({
    cwd: tempDir,
    env: {
      GITHUB_WORKSPACE: tempDir,
      INPUT_GIT_BASE: 'base-sha',
      'INPUT_GITHUB-TOKEN': 'secret-token',
      INPUT_GITHUB_TOKEN: 'secret-token',
      GITHUB_TOKEN: 'secret-token',
      GH_TOKEN: 'secret-token',
      TOKEN_COPY: 'secret-token',
      DRIFT_SAFE_VALUE: 'keep-me',
    },
    runCommand: async (_tool, args, options) => {
      seenEnvs.push(options.env);
      return args.includes('json') ? JSON.stringify(proofReport) : '## DriftLock Proof Report\n';
    },
  });

  assert.equal(seenEnvs.length, 2);
  for (const env of seenEnvs) {
    assert.equal(env['INPUT_GITHUB-TOKEN'], undefined);
    assert.equal(env.INPUT_GITHUB_TOKEN, undefined);
    assert.equal(env.GITHUB_TOKEN, undefined);
    assert.equal(env.GH_TOKEN, undefined);
    assert.equal(env.TOKEN_COPY, undefined);
    assert.equal(env.DRIFT_SAFE_VALUE, 'keep-me');
  }
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

test('fails policy on preservation rate and dirty generated index after reports are available', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drift-proof-policy-index-'));

  await assert.rejects(
    runAction({
      cwd: tempDir,
      env: {
        GITHUB_WORKSPACE: tempDir,
        INPUT_GIT_BASE: 'base-sha',
        INPUT_MIN_PRESERVATION_RATE: '0.75',
        INPUT_FAIL_ON_DIRTY_INDEX: 'true',
      },
      runCommand: async (_tool, args) => (args.includes('json') ? JSON.stringify(proofReport) : '## Report\n'),
    }),
    /Intent preservation rate 0.5 is below minimum 0.75[\s\S]*Generated DriftLock index is dirty/,
  );
  assert.match(await fs.readFile(path.join(tempDir, '.drift/proof-report/proof-report.md'), 'utf8'), /## Report/);
});

test('computes proof policy failures without requiring CLI strict flags', () => {
  assert.deepEqual(
    proofPolicyFailures(proofReport, {
      failOnUnresolved: true,
      failOnViolations: true,
      minPreservationRate: 0.75,
      failOnDirtyIndex: true,
    }),
    [
      'Unresolved DriftLock contract changes: 1',
      'Current DriftLock violations: 1',
      'Intent preservation rate 0.5 is below minimum 0.75',
      'Generated DriftLock index is dirty: .drift/contracts.generated.index/manifest.json',
    ],
  );
});

test('updates an existing pull request proof comment', async () => {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init });
    if (String(url).includes('?per_page=100&page=1')) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ url: 'https://api.github.test/comment/1', body: `${COMMENT_MARKER}\nCommit: old-sha\nold` }],
      };
    }
    return { ok: true, status: 200 };
  };

  await createOrUpdatePrComment({
    env: { GITHUB_API_URL: 'https://api.github.test' },
    context: { owner: 'nullodyssey', repo: 'drift-lock', pullRequestNumber: 42 },
    token: 'token',
    markdown: '## Report',
    metadata: {
      headSha: 'new-sha',
      baseSha: 'base-sha',
      generatedAt: '2026-06-15T10:00:00.000Z',
      policy: 'strict',
      policyResult: 'passed',
      runUrl: 'https://github.test/nullodyssey/drift-lock/actions/runs/1',
    },
    fetchImpl,
    warn: () => {},
  });

  assert.equal(requests[1].init.method, 'PATCH');
  const body = JSON.parse(requests[1].init.body).body;
  assert.match(body, /<!-- drift-lock-proof-report -->/);
  assert.match(body, /Commit: new-sha/);
  assert.match(body, /Base: base-sha/);
  assert.match(body, /Policy: strict/);
  assert.match(body, /Proof policy passed for this commit/);
  assert.doesNotMatch(body, /old-sha/);
});

test('updates an existing pull request proof comment on later pages', async () => {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init });
    if (String(url).includes('&page=1')) {
      return {
        ok: true,
        status: 200,
        json: async () => Array.from({ length: 100 }, (_, index) => ({ url: `https://api.github.test/comment/${index}`, body: 'other' })),
      };
    }
    if (String(url).includes('&page=2')) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ url: 'https://api.github.test/comment/200', body: `${COMMENT_MARKER}\nold` }],
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

  assert.equal(requests.length, 3);
  assert.equal(requests[2].url, 'https://api.github.test/comment/200');
  assert.equal(requests[2].init.method, 'PATCH');
});

test('creates a pull request proof comment after all pages are checked', async () => {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init });
    if (String(url).includes('&page=1')) {
      return {
        ok: true,
        status: 200,
        json: async () => Array.from({ length: 100 }, (_, index) => ({ url: `https://api.github.test/comment/${index}`, body: 'other' })),
      };
    }
    if (String(url).includes('&page=2')) {
      return {
        ok: true,
        status: 200,
        json: async () => [],
      };
    }
    return { ok: true, status: 201 };
  };

  await createOrUpdatePrComment({
    env: { GITHUB_API_URL: 'https://api.github.test' },
    context: { owner: 'nullodyssey', repo: 'drift-lock', pullRequestNumber: 42 },
    token: 'token',
    markdown: '## Report',
    fetchImpl,
    warn: () => {},
  });

  assert.equal(requests.length, 3);
  assert.equal(requests[2].url, 'https://api.github.test/repos/nullodyssey/drift-lock/issues/42/comments');
  assert.equal(requests[2].init.method, 'POST');
});

test('skips pull request comment writes when comment listing is unavailable', async () => {
  const requests = [];
  const warnings = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init });
    return {
      ok: false,
      status: 403,
      json: async () => [],
    };
  };

  await createOrUpdatePrComment({
    env: { GITHUB_API_URL: 'https://api.github.test' },
    context: { owner: 'nullodyssey', repo: 'drift-lock', pullRequestNumber: 42 },
    token: 'token',
    markdown: '## Report',
    fetchImpl,
    warn: (message) => warnings.push(message),
  });

  assert.equal(requests.length, 1);
  assert.match(warnings[0], /Unable to list pull request comments/);
});

test('builds a bounded comment body', () => {
  const body = buildCommentBody('x'.repeat(70000));
  assert.ok(body.startsWith(COMMENT_MARKER));
  assert.ok(body.length < 61000);
  assert.match(body, /Report truncated/);
});
