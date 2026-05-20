#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cli = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/cli.js');

if (!existsSync(cli)) {
  console.error('drift-lock CLI is not built. Run: pnpm --filter @drift-core/cli build');
  process.exit(1);
}

await import(pathToFileURL(cli).href);
