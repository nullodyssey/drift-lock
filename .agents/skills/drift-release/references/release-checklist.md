# Release Checklist

This checklist is based on `docs/release.md` for this repository.

## Required Environment

```bash
nvm use
node --version
```

Use Node 22 or newer for release publishing. The CI Trusted Publishing path
installs `npm@^11.10.0`; local release machines should use npm 11.10.0 or newer.

## Version Bump

For `<VERSION>`, update the three published packages:

```bash
pnpm --filter @drift-lock/core version <VERSION> --no-git-tag-version
pnpm --filter @drift-lock/cli version <VERSION> --no-git-tag-version
pnpm --filter @drift-lock/eslint-plugin version <VERSION> --no-git-tag-version
```

Also update the root `package.json` version, then refresh the lockfile:

```bash
pnpm install --lockfile-only
```

## Verification Before Commit

Run:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm test
pnpm --filter next-v1 lint
pnpm --filter next-v1 drift-lock:check
```

If contract files may have changed:

```bash
pnpm --filter next-v1 drift-lock:extract
git diff --exit-code -- apps/next-v1/.drift/contracts.generated.json
```

## Commit And Tag

Use this shape:

```bash
git add package.json packages/core/package.json packages/cli/package.json packages/eslint-plugin/package.json pnpm-lock.yaml
git commit -m "chore: release v<VERSION>"
git tag -a v<VERSION> -m "v<VERSION>"
```

If other release files changed intentionally, stage them explicitly and explain why.

## Push Commands To Report

List these commands in the final answer:

```bash
git push origin <branch>
git push origin v<VERSION>
```

After pushing, run the GitHub Actions workflow named `Release`.

## Publishing Notes

- Use `alpha` for `*-alpha`, `beta` for `*-beta`, `rc` for `*-rc`, and `latest` for stable versions.
- CI release uses npm provenance through Trusted Publishing.
- Local first publish requires `npm whoami`, npm 2FA, and access to the `@drift-lock` scope.
- Local npm publish commands must include `--provenance=false`.
- Verify published packages with `npm view @drift-lock/core version dist-tags`, plus the equivalent CLI and ESLint plugin commands.
