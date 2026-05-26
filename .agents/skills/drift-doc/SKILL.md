---
name: drift-doc
description: Audit and align DriftLock documentation and READMEs with the current implementation. Use when the user asks to verify, audit, realign, or update README.md, docs/*.md, package READMEs, CLI documentation, feature docs, install/release docs, or agent skill docs against recent code, tests, contracts, package scripts, CI workflows, public APIs, CLI commands, diagnostics, or latest implementation changes in this repository.
---

# Drift Doc

Use this repo-local skill to keep DriftLock documentation honest against the
code that actually ships. The goal is to catch stale docs, missing feature
coverage, overstated promises, wrong command examples, and README drift after
implementation work.

## Workflow

1. Check `git status --short` and preserve unrelated user changes.
2. Determine the requested mode:
   - report-only when the user asks to verify, audit, review, or check docs;
   - edit mode only when the user asks to update, fix, rewrite, or realign docs.
3. Identify the implementation truth before reading docs:
   - recent working tree changes with `git diff` and `git diff --cached`;
   - committed changes with `git log --oneline`, `git show --stat --patch HEAD`, or `git diff HEAD~1..HEAD`;
   - when the user mentions a commit/range or the worktree is clean, inspect the committed patch, not only the commit subject;
   - source and tests under `packages/core`, `packages/cli`, and `packages/eslint-plugin`;
   - package scripts and exports in `package.json` and `packages/*/package.json`;
   - `.drift/config.json`, `.drift/contracts.generated.json`, and CI workflows.
4. Inventory the documentation surface:
   - root `README.md`;
   - `docs/*.md`;
   - `packages/*/README.md`;
   - `apps/*/README.md`;
   - bundled CLI skills under `packages/cli/skills/**`;
   - repo-local Codex skills under `.agents/skills/**`.
5. Read `references/doc-alignment-checklist.md` for the comparison checklist.
6. Compare docs against implementation and classify gaps as:
   - `false`: documented behavior is not implemented;
   - `stale`: implementation changed but docs still describe old behavior;
   - `missing`: implemented behavior lacks expected documentation;
   - `ambiguous`: wording can mislead agents, CI users, or package consumers.
7. If editing docs, keep changes minimal and factual. Update examples, command
   names, counts, options, and capability lists only after verifying them from
   source or tests.
8. Run the smallest relevant verification after edits, then a broader docs-safe
   check when practical.

## Commands To Consider

Use these for grounding and verification:

```bash
git status --short
git log --oneline -n 20
git show --stat --patch HEAD
git diff HEAD~1..HEAD
git diff --stat
git diff -- README.md docs packages
pnpm check
pnpm test
pnpm drift-lock:check
pnpm drift-lock:coverage
```

Use package-specific tests when a doc claim depends on one package. Do not run
`pnpm drift-lock:extract` unless the task intentionally changes `@drift`
contracts or the generated index.

## Output Rules

For report-only audits, lead with findings ordered by severity and include the
file or section to update. Do not rewrite docs unless asked.

For edit mode, report:

```txt
Action:
Docs changed:
Implementation sources checked:
Remaining doc risks:
Checks:
```

If docs are already aligned, say that clearly and mention the implementation
surfaces checked.
