import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { parseDocument } from 'yaml';
import type { DriftAnchor, DriftError, DriftExtractedContract } from '../types.js';
import { driftError } from './errors.js';
import { discoverSourceFiles, normalizePath } from './files.js';
import { bodyHash, contentHash } from './hash.js';
import { validateContractObject } from './validator.js';

type ContractBlock = {
  body: string;
  raw: string;
  start: number;
  end: number;
  line: number;
  column: number;
};

export type ExtractOptions = {
  root: string;
  sourceDir?: string;
  files?: string[];
};

export async function extractContracts(options: ExtractOptions): Promise<{
  contracts: DriftExtractedContract[];
  errors: DriftError[];
}> {
  const root = path.resolve(options.root);
  const files = options.files ?? (await discoverSourceFiles(root, options.sourceDir));
  const contracts: DriftExtractedContract[] = [];
  const errors: DriftError[] = [];

  // Extraction is best-effort per file: collect every contract/error first, then
  // report duplicate IDs after all files are known.
  for (const file of files) {
    const absoluteFile = path.resolve(root, file);
    const relativeFile = normalizePath(path.relative(root, absoluteFile));
    const text = await readFile(absoluteFile, 'utf8');
    const extracted = extractContractsFromSource(relativeFile, text);
    contracts.push(...extracted.contracts);
    errors.push(...extracted.errors);
  }

  errors.push(...findDuplicateIds(contracts));
  contracts.sort((a, b) => (a.file === b.file ? a.id.localeCompare(b.id) : a.file.localeCompare(b.file)));

  return { contracts, errors };
}

export function extractContractsFromSource(
  file: string,
  text: string,
): { contracts: DriftExtractedContract[]; errors: DriftError[] } {
  const contracts: DriftExtractedContract[] = [];
  const errors: DriftError[] = [];
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  // The source pipeline mirrors the spec order: raw block -> YAML object ->
  // schema-valid contract -> AST anchor -> extracted contract metadata.
  for (const block of findContractBlocks(text)) {
    const parsedDocument = parseDocument(block.body);
    if (parsedDocument.errors.length > 0) {
      errors.push(driftError('DRIFT001_INVALID_YAML', file, {}, { line: block.line, column: block.column }));
      continue;
    }

    const parsed = parsedDocument.toJS();
    const validated = validateContractObject(parsed, file, { line: block.line, column: block.column });
    errors.push(...validated.errors);
    if (!validated.contract) continue;

    const anchor = anchorContract(validated.contract.scope, sourceFile, text, block);
    if (!anchor.anchor) {
      errors.push(
        driftError(
          'DRIFT006_UNANCHORED_CONTRACT',
          file,
          { id: validated.contract.id },
          { line: block.line, column: block.column },
        ),
      );
      continue;
    }

    contracts.push({
      ...validated.contract,
      file,
      anchor: anchor.anchor,
      contentHash: contentHash(validated.contract),
      bodyHash: bodyHash(text.slice(anchor.bodyStart, anchor.bodyEnd)),
      line: block.line,
      column: block.column,
      raw: block.raw,
      bodyStart: anchor.bodyStart,
      bodyEnd: anchor.bodyEnd,
    });
  }

  return { contracts, errors };
}

function findContractBlocks(text: string): ContractBlock[] {
  const blocks: ContractBlock[] = [];
  // The strict opening marker avoids accidentally treating generic comments or
  // JSDoc as contracts. CRLF is accepted so Windows checkouts do not hide them.
  const pattern = /\/\* @drift\r?\n([\s\S]*?)\*\//g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    const raw = match[0];
    const start = match.index;
    const end = start + raw.length;
    const position = lineColumnAt(text, start);
    blocks.push({
      body: match[1] ?? '',
      raw,
      start,
      end,
      line: position.line,
      column: position.column,
    });
  }

  return blocks;
}

function anchorContract(
  scope: 'file' | 'declaration',
  sourceFile: ts.SourceFile,
  text: string,
  block: ContractBlock,
): { anchor?: DriftAnchor; bodyStart: number; bodyEnd: number } {
  if (scope === 'file') {
    if (!isFileHeaderContract(sourceFile, block.start)) return { bodyStart: 0, bodyEnd: text.length };
    return { anchor: { type: 'file' }, bodyStart: 0, bodyEnd: text.length };
  }

  const statement = sourceFile.statements.find((candidate) => candidate.getStart(sourceFile) >= block.end);
  if (!statement) return { bodyStart: block.end, bodyEnd: block.end };

  // Declaration contracts must be adjacent to their declaration. Plain comments
  // and blank lines are harmless, but executable text means the contract floats.
  const between = text.slice(block.end, statement.getStart(sourceFile));
  if (between.includes('@drift') || stripComments(between).trim().length > 0) {
    return { bodyStart: statement.getStart(sourceFile), bodyEnd: statement.end };
  }

  const anchor = anchorForStatement(statement);
  if (!anchor) return { bodyStart: statement.getStart(sourceFile), bodyEnd: statement.end };

  return { anchor, bodyStart: statement.getStart(sourceFile), bodyEnd: statement.end };
}

function anchorForStatement(statement: ts.Statement): DriftAnchor | undefined {
  // V1 deliberately supports only named functions and const declarations. If a
  // region needs a contract, it must first be named in code.
  if (ts.isFunctionDeclaration(statement) && statement.name) {
    return { type: 'function', name: statement.name.text };
  }

  if (ts.isVariableStatement(statement)) {
    const declaration = statement.declarationList.declarations[0];
    if ((statement.declarationList.flags & ts.NodeFlags.Const) !== 0 && declaration && ts.isIdentifier(declaration.name)) {
      return { type: 'const', name: declaration.name.text };
    }
  }

  return undefined;
}

function isFileHeaderContract(sourceFile: ts.SourceFile, contractStart: number): boolean {
  // File contracts live in the module header. Imports and Next.js directives can
  // appear before them because they do not change the local implementation body.
  for (const statement of sourceFile.statements) {
    if (statement.getStart(sourceFile) >= contractStart) return true;
    if (ts.isImportDeclaration(statement)) continue;
    if (isUseDirective(statement)) continue;
    return false;
  }
  return true;
}

function isUseDirective(statement: ts.Statement): boolean {
  return (
    ts.isExpressionStatement(statement) &&
    ts.isStringLiteral(statement.expression) &&
    (statement.expression.text === 'use server' || statement.expression.text === 'use client')
  );
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function lineColumnAt(text: string, offset: number): { line: number; column: number } {
  const prefix = text.slice(0, offset);
  const lines = prefix.split('\n');
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function findDuplicateIds(contracts: DriftExtractedContract[]): DriftError[] {
  const seen = new Map<string, DriftExtractedContract>();
  const errors: DriftError[] = [];

  // Report both locations so the user does not have to search for the other copy.
  for (const contract of contracts) {
    const existing = seen.get(contract.id);
    if (existing) {
      errors.push(
        driftError(
          'DRIFT005_DUPLICATE_CONTRACT_ID',
          contract.file,
          { id: contract.id },
          { line: contract.line, column: contract.column },
        ),
      );
      errors.push(
        driftError(
          'DRIFT005_DUPLICATE_CONTRACT_ID',
          existing.file,
          { id: existing.id },
          { line: existing.line, column: existing.column },
        ),
      );
    } else {
      seen.set(contract.id, contract);
    }
  }

  return errors;
}
