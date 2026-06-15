# Release Procedure

This document describes how to publish the DriftLock npm packages.

Published packages:

```txt
@drift-lock/core
@drift-lock/cli
@drift-lock/eslint-plugin
```

The public CLI binary is:

```txt
drift-lock
```

Use Node 22 or newer. The GitHub release workflow installs `npm@^11.10.0` for
Trusted Publishing, so local release machines should use npm 11.10.0 or newer:

```bash
nvm use
node --version
npm --version
```

## P1 - First Publish

Use this procedure when publishing the packages manually for the first time.

### 1. Prepare npm

Requirements:

```txt
- npm account with 2FA enabled
- access to the @drift-lock npm organization/scope
- npm login completed locally
```

Check authentication:

```bash
npm whoami
```

### 2. Verify the repo

The working tree must be clean and the release tag must point to the intended
commit. Use `<VERSION>` below for the package version being published, for
example `0.1.4-alpha`.

```bash
git status
git log -1 --oneline
git tag -n --list 'v<VERSION>'
```

Run the full checks:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @drift-lock/cli exec drift-lock --version
pnpm check
pnpm test
pnpm --filter next-v1 lint
pnpm --filter next-v1 drift-lock:check
```

The CLI version printed by `drift-lock --version` must match
`packages/cli/package.json`.

### 3. Pack and inspect

Create local tarballs:

```bash
mkdir -p /tmp/drift-lock-packs
pnpm --filter @drift-lock/core pack --pack-destination /tmp/drift-lock-packs
pnpm --filter @drift-lock/cli pack --pack-destination /tmp/drift-lock-packs
pnpm --filter @drift-lock/eslint-plugin pack --pack-destination /tmp/drift-lock-packs
```

Inspect internal dependency conversion:

```bash
tar -xOf /tmp/drift-lock-packs/drift-lock-cli-<VERSION>.tgz package/package.json
tar -xOf /tmp/drift-lock-packs/drift-lock-eslint-plugin-<VERSION>.tgz package/package.json
```

Expected dependency:

```json
"@drift-lock/core": "<VERSION>"
```

### 4. Publish in dependency order

For an alpha release, publish with the `alpha` npm dist-tag.
Local publishes must explicitly disable provenance because automatic npm
provenance generation only works from supported CI providers such as GitHub
Actions. The CI release workflow enables provenance explicitly.

```bash
npm publish /tmp/drift-lock-packs/drift-lock-core-<VERSION>.tgz --access public --tag alpha --provenance=false
npm publish /tmp/drift-lock-packs/drift-lock-cli-<VERSION>.tgz --access public --tag alpha --provenance=false
npm publish /tmp/drift-lock-packs/drift-lock-eslint-plugin-<VERSION>.tgz --access public --tag alpha --provenance=false
```

### 5. Verify npm

```bash
npm view @drift-lock/core version dist-tags
npm view @drift-lock/cli version dist-tags
npm view @drift-lock/eslint-plugin version dist-tags
```

Smoke test:

```bash
npx --yes @drift-lock/cli@latest --help
npx --yes @drift-lock/cli@latest skills list
npx --yes @drift-lock/cli@latest install --source src --dry-run
```

## P2 - CI Release

Use this procedure after the first publish path is validated and npm Trusted Publishing is configured.

### 1. Configure Trusted Publishing

Configure npm Trusted Publishing for each package:

```txt
@drift-lock/core
@drift-lock/cli
@drift-lock/eslint-plugin
```

Trusted publisher settings:

```txt
Repository owner: nullodyssey
Repository name: drift-lock
Workflow filename: release.yml
Environment: none
```

The workflow uses:

```yaml
permissions:
  contents: read
  id-token: write
```

### 2. Prepare the release commit and tag

Bump package versions before publishing. Example:

```bash
pnpm --filter @drift-lock/core version <VERSION> --no-git-tag-version
pnpm --filter @drift-lock/cli version <VERSION> --no-git-tag-version
pnpm --filter @drift-lock/eslint-plugin version <VERSION> --no-git-tag-version
```

Update the root workspace version if desired, then verify:

```bash
pnpm install --lockfile-only
pnpm build
pnpm check
pnpm test
```

Commit and tag:

```bash
git add .
git commit -m "chore: release v<VERSION>"
git tag -a v<VERSION> -m "v<VERSION>"
git push origin main
git push origin v<VERSION>
```

### 3. Run the GitHub workflow

Open GitHub Actions and run:

```txt
Release
```

The workflow:

```txt
1. installs dependencies
2. builds the workspace
3. runs typecheck and tests
4. packs the three packages
5. derives the npm dist-tag from the version suffix
6. publishes the tarballs with npm provenance
```

### 4. Verify after CI publish

```bash
npm view @drift-lock/core version dist-tags
npm view @drift-lock/cli version dist-tags
npm view @drift-lock/eslint-plugin version dist-tags
```

Smoke test:

```bash
npx --yes @drift-lock/cli@latest --help
npx --yes @drift-lock/cli@latest skills list
```

## Notes

- Create one Git tag per npm publish.
- Use SemVer prerelease syntax: `0.1.4-alpha`, not `0.1.4.alpha`.
- Use the `alpha` npm dist-tag for prereleases.
- Publish order matters: core first, then CLI and ESLint plugin.
- Keep provenance explicit in the release path: disabled for local P1 publishes,
  enabled with `--provenance` in the CI workflow.
- Do not configure a long-lived `NPM_TOKEN` if Trusted Publishing is enabled.
