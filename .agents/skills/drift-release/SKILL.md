---
name: drift-release
description: Prepare releases for this DriftLock repository. Use when the user asks to bump versions, prepare a release commit, create an annotated release tag, list push commands, or follow docs/release.md for this repo's npm/GitHub release flow.
---

# Drift Release

Use this repo-local skill to prepare a DriftLock release. The goal is to leave the repository ready for CI publishing: package versions bumped, lockfile refreshed, release commit created, annotated tag created, and push commands listed.

## Workflow

1. Read `docs/release.md` and `references/release-checklist.md` before changing files.
2. Ask for the target version if it is not explicit. Use SemVer prerelease syntax like `0.1.4-alpha`, not `0.1.4.alpha`.
3. Check state with `git status --short` and `git branch --show-current`. Preserve unrelated user changes.
4. Bump versions in:
   - `package.json`
   - `packages/core/package.json`
   - `packages/cli/package.json`
   - `packages/eslint-plugin/package.json`
5. Refresh `pnpm-lock.yaml` with `pnpm install --lockfile-only`.
6. Run the verification commands from the checklist unless the user asks for a dry run.
7. Stage only intentional release files, then create `chore: release v<VERSION>`.
8. Create an annotated tag: `git tag -a v<VERSION> -m "v<VERSION>"`.
9. Final response must include the commit hash, tag name, checks run, and push commands.

## Push Commands

Always list these commands, adjusted for the current branch and version:

```bash
git push origin <branch>
git push origin v<VERSION>
```

Mention that the GitHub Actions workflow named `Release` should be run after pushing when publishing through CI.

## Guardrails

```txt
- Do not run npm publish unless explicitly requested.
- Do not create or move files under packages/cli/skills for this repo-local release helper.
- Keep one Git tag per npm publish.
- Published packages are @drift-lock/core, @drift-lock/cli, and @drift-lock/eslint-plugin.
- If publishing is requested, publish in dependency order: core, CLI, ESLint plugin.
```
