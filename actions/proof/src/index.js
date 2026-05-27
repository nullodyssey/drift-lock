import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const COMMENT_MARKER = '<!-- drift-lock-proof-report -->';

const COMMENT_MAX_LENGTH = 60000;

export class ActionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ActionError';
  }
}

export async function runAction(options = {}) {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const fileSystem = options.fs ?? fs;
  const runCommand = options.runCommand ?? runProcess;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const inputs = readInputs(env);
  const workspace = env.GITHUB_WORKSPACE || cwd;
  const root = path.resolve(workspace, inputs.root);
  const context = await readGitHubContext(env, fileSystem);
  const gitBase = resolveGitBase(inputs.gitBase, context);

  if (!gitBase) {
    throw new ActionError('Missing git-base. Provide the git-base input or run this action on a pull_request event.');
  }

  const command = parseCommandInvocation(inputs.driftCommand, inputs.driftCommandArgs);
  const jsonArgs = [...command.args, ...buildProofArgs({ ...inputs, root, gitBase, format: 'json' })];
  const markdownArgs = [...command.args, ...buildProofArgs({ ...inputs, root, gitBase, format: 'md' })];
  const outputDir = path.resolve(root, inputs.outputDir);
  const jsonPath = path.join(outputDir, 'proof-report.json');
  const markdownPath = path.join(outputDir, 'proof-report.md');

  const jsonOutput = await runProofCommand(runCommand, command.tool, jsonArgs, root, env);
  const report = parseProofJson(jsonOutput);
  const markdownOutput = await runProofCommand(runCommand, command.tool, markdownArgs, root, env);

  await fileSystem.mkdir(outputDir, { recursive: true });
  await fileSystem.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fileSystem.writeFile(markdownPath, `${markdownOutput.trimEnd()}\n`, 'utf8');
  await appendStepSummary(env, markdownOutput);

  const outputs = outputsForReport(report, jsonPath, markdownPath);
  await writeOutputs(env, outputs);

  if (inputs.comment) {
    await createOrUpdatePrComment({
      env,
      context,
      token: inputs.githubToken,
      markdown: markdownOutput,
      fetchImpl,
      warn: (message) => warning(message),
    });
  }

  const failures = [];
  if (inputs.failOnUnresolved && report.summary.contractChanges.unresolved > 0) {
    failures.push(`Unresolved DriftLock contract changes: ${report.summary.contractChanges.unresolved}`);
  }
  if (inputs.failOnViolations && report.summary.currentViolations > 0) {
    failures.push(`Current DriftLock violations: ${report.summary.currentViolations}`);
  }
  if (failures.length > 0) {
    throw new ActionError(failures.join('\n'));
  }

  return { report, outputs };
}

export function readInputs(env) {
  return {
    root: getInput(env, 'root', '.'),
    source: getInput(env, 'source'),
    index: getInput(env, 'index'),
    gitBase: getInput(env, 'git-base'),
    outputDir: getInput(env, 'output-dir', '.drift/proof-report'),
    comment: booleanInput(getInput(env, 'comment', 'false'), 'comment'),
    githubToken: getInput(env, 'github-token'),
    driftCommand: getInput(env, 'drift-command', 'npx'),
    driftCommandArgs: getInput(env, 'drift-command-args', '--yes @drift-lock/cli'),
    failOnUnresolved: booleanInput(getInput(env, 'fail-on-unresolved', 'false'), 'fail-on-unresolved'),
    failOnViolations: booleanInput(getInput(env, 'fail-on-violations', 'false'), 'fail-on-violations'),
  };
}

export function getInput(env, name, defaultValue = '') {
  const exactKey = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
  const underscoreKey = `INPUT_${name.replace(/[ -]/g, '_').toUpperCase()}`;
  const value = env[exactKey] ?? env[underscoreKey] ?? defaultValue;
  return typeof value === 'string' ? value.trim() : '';
}

export function booleanInput(value, name) {
  const normalized = value.trim().toLowerCase();
  if (['', 'false', '0', 'no', 'off'].includes(normalized)) return false;
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  throw new ActionError(`Invalid boolean input "${name}": ${value}`);
}

export async function readGitHubContext(env, fileSystem = fs) {
  let payload = {};
  if (env.GITHUB_EVENT_PATH) {
    try {
      payload = JSON.parse(await fileSystem.readFile(env.GITHUB_EVENT_PATH, 'utf8'));
    } catch (error) {
      throw new ActionError(`Unable to read GitHub event payload: ${error.message}`);
    }
  }

  const repository = payload.repository?.full_name ?? env.GITHUB_REPOSITORY ?? '';
  const [owner, repo] = repository.split('/');

  return {
    owner,
    repo,
    pullRequestNumber: payload.pull_request?.number,
    pullRequestBaseSha: payload.pull_request?.base?.sha,
  };
}

export function resolveGitBase(input, context) {
  return input || context.pullRequestBaseSha || '';
}

export function parseCommandInvocation(commandInput, argsInput) {
  const commandWords = splitCommandLine(commandInput);
  if (commandWords.length === 0) {
    throw new ActionError('drift-command cannot be empty.');
  }

  return {
    tool: commandWords[0],
    args: [...commandWords.slice(1), ...splitCommandLine(argsInput)],
  };
}

export function splitCommandLine(value) {
  const words = [];
  let current = '';
  let quote = '';
  let escaping = false;

  for (const char of value.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = '';
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        words.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaping) current += '\\';
  if (quote) throw new ActionError(`Unclosed quote in command input: ${value}`);
  if (current) words.push(current);
  return words;
}

export function buildProofArgs(inputs) {
  const args = ['proof', '--root', inputs.root, '--git-base', inputs.gitBase, '--format', inputs.format];
  if (inputs.source) args.push('--source', inputs.source);
  if (inputs.index) args.push('--index', inputs.index);
  return args;
}

export async function runProofCommand(runCommand, tool, args, cwd, env) {
  try {
    return await runCommand(tool, args, { cwd, env });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ActionError(`${message}\n\nIf the Git base cannot be resolved in CI, use actions/checkout with fetch-depth: 0.`);
  }
}

export async function runProcess(tool, args, options) {
  return await new Promise((resolve, reject) => {
    const child = spawn(tool, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new ActionError(`Command failed (${code}): ${tool} ${args.join(' ')}\n${stderr.trim()}`));
    });
  });
}

export function parseProofJson(output) {
  try {
    const report = JSON.parse(output);
    validateProofReport(report);
    return report;
  } catch (error) {
    throw new ActionError(`Unable to parse drift-lock proof JSON output: ${error.message}`);
  }
}

export function validateProofReport(report) {
  const summary = report?.summary;
  if (
    !summary ||
    typeof summary.protectedContractsTouched !== 'number' ||
    typeof summary.contractChanges?.unresolved !== 'number' ||
    typeof summary.contractChanges?.accepted !== 'number' ||
    typeof summary.currentViolations !== 'number' ||
    typeof summary.intentPreservationRate !== 'number'
  ) {
    throw new ActionError('Invalid DriftLock proof report shape.');
  }
}

export function outputsForReport(report, jsonPath, markdownPath) {
  return {
    'protected-contracts-touched': String(report.summary.protectedContractsTouched),
    unresolved: String(report.summary.contractChanges.unresolved),
    accepted: String(report.summary.contractChanges.accepted),
    'current-violations': String(report.summary.currentViolations),
    'intent-preservation-rate': String(report.summary.intentPreservationRate),
    'report-json-path': jsonPath,
    'report-markdown-path': markdownPath,
  };
}

export async function writeOutputs(env, outputs) {
  if (!env.GITHUB_OUTPUT) return;
  const lines = [];
  for (const [name, value] of Object.entries(outputs)) {
    const delimiter = `drift_lock_${randomUUID().replace(/-/g, '')}`;
    lines.push(`${name}<<${delimiter}`, value, delimiter);
  }
  await fs.appendFile(env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, 'utf8');
}

export async function appendStepSummary(env, markdown) {
  if (!env.GITHUB_STEP_SUMMARY) return;
  await fs.appendFile(env.GITHUB_STEP_SUMMARY, `${markdown.trimEnd()}\n`, 'utf8');
}

export async function createOrUpdatePrComment({ env, context, token, markdown, fetchImpl, warn }) {
  if (!token) {
    throw new ActionError('comment is enabled but github-token is empty.');
  }
  if (!context.owner || !context.repo || !context.pullRequestNumber) {
    throw new ActionError('comment is enabled but this run is not associated with a pull request.');
  }
  if (!fetchImpl) {
    throw new ActionError('comment is enabled but fetch is unavailable in this Node.js runtime.');
  }

  const apiUrl = env.GITHUB_API_URL || 'https://api.github.com';
  const commentsUrl = `${apiUrl}/repos/${context.owner}/${context.repo}/issues/${context.pullRequestNumber}/comments`;
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28',
  };
  const body = buildCommentBody(markdown);
  const listResponse = await fetchImpl(`${commentsUrl}?per_page=100`, { headers });

  if (listResponse.status === 403 || listResponse.status === 404) {
    warn(`Unable to list pull request comments (${listResponse.status}). The proof report is still available in the job summary.`);
    return;
  }
  if (!listResponse.ok) {
    throw new ActionError(`Unable to list pull request comments: HTTP ${listResponse.status}`);
  }

  const comments = await listResponse.json();
  const existing = Array.isArray(comments) ? comments.find((comment) => comment.body?.includes(COMMENT_MARKER)) : undefined;
  const response = existing
    ? await fetchImpl(existing.url, { method: 'PATCH', headers, body: JSON.stringify({ body }) })
    : await fetchImpl(commentsUrl, { method: 'POST', headers, body: JSON.stringify({ body }) });

  if (response.status === 403 || response.status === 404) {
    warn(`Unable to write pull request comment (${response.status}). The proof report is still available in the job summary.`);
    return;
  }
  if (!response.ok) {
    throw new ActionError(`Unable to write pull request comment: HTTP ${response.status}`);
  }
}

export function buildCommentBody(markdown) {
  const body = `${COMMENT_MARKER}\n${markdown.trimEnd()}`;
  if (body.length <= COMMENT_MAX_LENGTH) return body;
  return `${body.slice(0, COMMENT_MAX_LENGTH)}\n\n_Report truncated. See the workflow job summary for the full proof report._`;
}

export function error(message) {
  process.stderr.write(`::error::${escapeCommandValue(message)}\n`);
}

export function warning(message) {
  process.stderr.write(`::warning::${escapeCommandValue(message)}\n`);
}

export function escapeCommandValue(value) {
  return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAction().catch((runError) => {
    error(runError instanceof Error ? runError.message : String(runError));
    process.exitCode = 1;
  });
}
