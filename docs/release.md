# Release Procedure

This document describes how to publish the DriftLock npm packages.

Published packages:

```txt
@drift-core/core
@drift-core/cli
@drift-core/eslint-plugin
```

The public CLI binary is:

```txt
drift-lock
```

Use Node 24 or newer:

```bash
nvm use
node --version
```

## P1 - First Publish

Use this procedure when publishing the packages manually for the first time.

### 1. Prepare npm

Requirements:

```txt
- npm account with 2FA enabled
- access to the @drift-core npm organization/scope
- npm login completed locally
```

Check authentication:

```bash
npm whoami
```

### 2. Verify the repo

The working tree must be clean and the release tag must point to the intended commit.

```bash
git status
git log -1 --oneline
git tag -n --list 'v0.1.1-alpha'
```

Run the full checks:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm test
pnpm --filter next-v1 lint
pnpm --filter next-v1 drift-lock:check
```

### 3. Pack and inspect

Create local tarballs:

```bash
mkdir -p /tmp/drift-core-packs
pnpm --filter @drift-core/core pack --pack-destination /tmp/drift-core-packs
pnpm --filter @drift-core/cli pack --pack-destination /tmp/drift-core-packs
pnpm --filter @drift-core/eslint-plugin pack --pack-destination /tmp/drift-core-packs
```

Inspect internal dependency conversion:

```bash
tar -xOf /tmp/drift-core-packs/drift-core-cli-0.1.1-alpha.tgz package/package.json
tar -xOf /tmp/drift-core-packs/drift-core-eslint-plugin-0.1.1-alpha.tgz package/package.json
```

Expected dependency:

```json
"@drift-core/core": "0.1.1-alpha"
```

### 4. Publish in dependency order

For an alpha release, publish with the `alpha` npm dist-tag.

```bash
npm publish /tmp/drift-core-packs/drift-core-core-0.1.1-alpha.tgz --access public --tag alpha
npm publish /tmp/drift-core-packs/drift-core-cli-0.1.1-alpha.tgz --access public --tag alpha
npm publish /tmp/drift-core-packs/drift-core-eslint-plugin-0.1.1-alpha.tgz --access public --tag alpha
```

### 5. Verify npm

```bash
npm view @drift-core/core version dist-tags
npm view @drift-core/cli version dist-tags
npm view @drift-core/eslint-plugin version dist-tags
```

Smoke test:

```bash
npx --yes @drift-core/cli --help
npx --yes @drift-core/cli skills list
npx --yes @drift-core/cli install --dry-run
```

## P2 - CI Release

Use this procedure after the first publish path is validated and npm Trusted Publishing is configured.

### 1. Configure Trusted Publishing

Configure npm Trusted Publishing for each package:

```txt
@drift-core/core
@drift-core/cli
@drift-core/eslint-plugin
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
pnpm --filter @drift-core/core version 0.1.1-alpha --no-git-tag-version
pnpm --filter @drift-core/cli version 0.1.1-alpha --no-git-tag-version
pnpm --filter @drift-core/eslint-plugin version 0.1.1-alpha --no-git-tag-version
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
git commit -m "chore: release v0.1.1-alpha"
git tag -a v0.1.1-alpha -m "v0.1.1-alpha"
git push origin main
git push origin v0.1.1-alpha
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
5. publishes the tarballs with npm provenance
```

### 4. Verify after CI publish

```bash
npm view @drift-core/core version dist-tags
npm view @drift-core/cli version dist-tags
npm view @drift-core/eslint-plugin version dist-tags
```

Smoke test:

```bash
npx --yes @drift-core/cli --help
npx --yes @drift-core/cli skills list
```

## Notes

- Create one Git tag per npm publish.
- Use SemVer prerelease syntax: `0.1.1-alpha`, not `0.1.1.alpha`.
- Use the `alpha` npm dist-tag for prereleases.
- Publish order matters: core first, then CLI and ESLint plugin.
- Do not configure a long-lived `NPM_TOKEN` if Trusted Publishing is enabled.
