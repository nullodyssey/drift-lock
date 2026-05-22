import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizePath } from './files.js';

/* @drift
version: 1
id: core.disable-directives
scope: file
stability: draft

intent: >
  Scan local DriftLock disable directives so temporary adoption exceptions stay
  visible in coverage reporting.

llm:
  must_not_change:
    - Disable directives must be reporting-only until enforcement is explicit.
    - Malformed and expired directives must stay visible in coverage.
    - File paths must be normalized before directive scanning.
*/
export type DriftDisableDirectiveKind = 'next-line' | 'file';

export type DriftDisableDirective = {
  file: string;
  line: number;
  kind: DriftDisableDirectiveKind;
  rule?: string;
  reason?: string;
  expires?: string;
  expired: boolean;
  malformed: boolean;
  message?: string;
};

export type DriftDisableDirectiveCoverage = {
  total: number;
  malformed: number;
  expired: number;
  items: DriftDisableDirective[];
};

export async function scanDisableDirectives(root: string, files: string[]): Promise<DriftDisableDirectiveCoverage> {
  const items = (await Promise.all(files.map((file) => scanFile(root, file)))).flat().sort(compareDirectives);
  return {
    total: items.length,
    malformed: items.filter((item) => item.malformed).length,
    expired: items.filter((item) => item.expired).length,
    items,
  };
}

async function scanFile(root: string, file: string): Promise<DriftDisableDirective[]> {
  const normalizedFile = normalizePath(file);
  const text = await readFile(path.resolve(root, normalizedFile), 'utf8');
  return text
    .split(/\r?\n/)
    .map((line, index) => parseDirectiveLine(normalizedFile, index + 1, line))
    .filter((directive): directive is DriftDisableDirective => directive !== undefined);
}

function parseDirectiveLine(file: string, line: number, text: string): DriftDisableDirective | undefined {
  const match = text.match(/^\s*\/\/\s*(drift-lock-disable-next-line|drift-lock-disable-file)\b(.*)$/);
  if (!match) return undefined;

  const command = match[1];
  const rest = (match[2] ?? '').trim();
  const separatorIndex = rest.indexOf('--');
  const rule = (separatorIndex >= 0 ? rest.slice(0, separatorIndex) : rest).trim() || undefined;
  const metadata = separatorIndex >= 0 ? rest.slice(separatorIndex + 2).trim() : '';
  const messages: string[] = [];
  let reason: string | undefined;
  let expires: string | undefined;

  if (!rule) messages.push('missing rule');
  if (!metadata.startsWith('reason:')) {
    messages.push('missing reason');
  } else {
    const parsed = parseReasonMetadata(metadata.slice('reason:'.length).trim());
    reason = parsed.reason;
    expires = parsed.expires;
    messages.push(...parsed.messages);
  }

  const expired = expires ? isExpired(expires) : false;
  return {
    file,
    line,
    kind: command === 'drift-lock-disable-next-line' ? 'next-line' : 'file',
    rule,
    reason,
    expires,
    expired,
    malformed: messages.length > 0,
    message: messages.length > 0 ? messages.join('; ') : undefined,
  };
}

function parseReasonMetadata(value: string): { reason?: string; expires?: string; messages: string[] } {
  const messages: string[] = [];
  const expiresMatch = /,\s*expires:\s*/.exec(value);
  const reason = (expiresMatch ? value.slice(0, expiresMatch.index) : value).trim() || undefined;
  const expires = expiresMatch ? value.slice(expiresMatch.index + expiresMatch[0].length).trim() || undefined : undefined;

  if (!reason) messages.push('missing reason');
  if (expiresMatch && (!expires || !isValidDate(expires))) messages.push('invalid expires');
  return { reason, expires, messages };
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
  return date.getUTCFullYear() === year && date.getUTCMonth() === (month ?? 0) - 1 && date.getUTCDate() === day;
}

function isExpired(value: string): boolean {
  if (!isValidDate(value)) return false;
  return value < todayLocalDate();
}

function todayLocalDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function compareDirectives(left: DriftDisableDirective, right: DriftDisableDirective): number {
  if (left.file !== right.file) return left.file.localeCompare(right.file);
  return left.line - right.line;
}
