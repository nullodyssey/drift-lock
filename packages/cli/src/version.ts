import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* @drift
version: 1
id: cli.version-source
scope: file
stability: locked

intent: >
  Resolve the public drift-lock CLI version from the package manifest so release
  diagnostics, source execution, built dist output, and npm tarballs report the
  same @drift-lock/cli version.

ssot:
  package-manifest: "../package.json"

invariants:
  - id: cli-version-uses-package-manifest
    enforce: drift/ssot-usage
    ssot: package-manifest

llm:
  must_not_change:
    - CLI_VERSION must be derived from the package manifest, not hardcoded.
    - Source, dist, and packed npm layouts must resolve the same package.json.
    - Missing or invalid package version metadata must fail loudly.
*/
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.resolve(currentDir, '../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };

if (typeof packageJson.version !== 'string') {
  throw new Error('Unable to resolve @drift-lock/cli package version.');
}

export const CLI_VERSION = packageJson.version;
