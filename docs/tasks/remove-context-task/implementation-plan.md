# Implementation plan — remove-context-task

# Approach

Remove the prediction path outright rather than tune it: delete `renderTaskContext` and its eight task-only helpers from the engine, drop the `--task` option from the CLI, and let the already-exact file-scoped `renderContext` be the only way to obtain contract context. `renderContext` shares no helper with the task path (verified: it formats inline), so the excision is surgical. The five bundled skill families are rewritten to teach the per-file discipline — pull `context <file>` before editing each file you touch — with `@drift-lock/eslint-plugin` + `drift-lock check` remaining the enforcement net that makes the removal safe.

Removal order is CLI-first, then core: the CLI imports `renderTaskContext`, so dropping the consumer before the definition keeps every intermediate step compiling. Alternative (top-k / relevance threshold on `scoreContractForTask`) rejected: the measured recall is bought by volume — the worst-recall runs are exactly the ones with the *smallest* predicted set — so any cut degrades recall precisely where it is already failing.

# Steps

1. [cli] Drop `--task` from the `context` command: remove the option, the task branch, the both/neither validation and the `renderTaskContext` import; `<file>` becomes a required argument — files: `packages/cli/src/cli.ts`, `packages/cli/tests/context.test.ts`
2. [core] Remove `renderTaskContext`, `RenderTaskContextOptions` and the task-only helpers (`scoreContractForTask`, `scoreText`, `tokenize`, `formatTaskContract`, `formatTaskInvariant`, `relevantTaskFiles`, `resolveTaskSsotFile`); drop the root export — files: `packages/core/src/core/context.ts`, `packages/core/src/index.ts`, `packages/core/tests/context.test.ts`, `packages/core/tests/public-api.test.ts`
3. [contract] Amend the locked `core.context-renderer` contract — narrow `intent` to file context, drop the two task invariants ("Task context must rank contracts…", "Planning notes must continue telling agents…"); then run `pnpm drift-lock:diff` to see exactly which locked contracts changed, `drift-lock accept <id> --reason "<reason>"` for each, and `pnpm drift-lock:extract` to regenerate the committed index — files: `packages/core/src/core/context.ts`, `.drift/accepted-contract-changes/core.context-renderer.md` (new), `.drift/contracts.generated.index/**`
4. [skills] Rewrite the five skill families that teach the prediction: replace `context --task "<user prompt>"` with the per-file rule (pull `context <file>` for every file you are about to edit) — files: `packages/cli/skills/drift-dev/{SKILL.md,references/examples.md,references/pre-edit-checklist.md}`, `packages/cli/skills/drift-tech-writer/{SKILL.md,references/checklist.md,references/examples.md}`, `packages/cli/skills/drift-architect/{SKILL.md,references/checklist.md,references/examples.md}`, `packages/cli/skills/drift-ux-designer/{SKILL.md,references/checklist.md,references/examples.md}`, `packages/cli/skills/drift-cm/{SKILL.md,references/checklist.md,references/examples.md}`, `packages/cli/tests/skills.test.ts`, `packages/cli/tests/install.test.ts`
5. [docs] Update the surfaces that teach the tool to the per-file discipline — files: `README.md`, `packages/cli/README.md`, `CLAUDE.md`, `docs/commands/context.mdx`, `docs/commands/index.mdx`, `docs/commands/skills.mdx`, `docs/commands/10-minutes-to-value.mdx`
6. [verify] Full gate green and the committed index current: `pnpm build && pnpm check && pnpm test && pnpm lint && pnpm drift-lock:check`, then `pnpm drift-lock:extract` must leave `git status --porcelain -- .drift/contracts.generated.index` empty — files: (none)
7. [core] **Added after step 6, on evidence** — close the recall gap the replacement still had. Measuring `context <file>` showed 100% precision but only **67% recall** (28 SSOT-impacted contracts missed over the 15 evaluation commits): a contract anchored elsewhere is broken by editing the file it declares as its SSOT, and nothing surfaced it. `renderContext` now returns the file's contract neighbourhood (anchored ∪ SSOT-consumers), resolving candidates with `contract-paths` — the same rule `buildFileRecords` (index) and `git-scope` (check) already apply, so no new mechanism is invented. Re-accept the locked contract; re-verify end-to-end (result: precision 100%, recall 100%, 15/15 exact) — files: `packages/core/src/core/context.ts`, `packages/cli/src/cli.ts`, `packages/core/tests/context.test.ts`, `.drift/accepted-contract-changes/core.context-renderer.md`, `.drift/contracts.generated.index/**`

# Files touched

Created:
- `.drift/accepted-contract-changes/core.context-renderer.md`

Modified:
- `packages/cli/src/cli.ts`
- `packages/core/src/core/context.ts`
- `packages/core/src/index.ts`
- `packages/core/tests/context.test.ts`
- `packages/core/tests/public-api.test.ts`
- `packages/cli/tests/context.test.ts`
- `packages/cli/tests/skills.test.ts`
- `packages/cli/tests/install.test.ts`
- `packages/cli/skills/drift-dev/SKILL.md`
- `packages/cli/skills/drift-dev/references/examples.md`
- `packages/cli/skills/drift-dev/references/pre-edit-checklist.md`
- `packages/cli/skills/drift-tech-writer/SKILL.md`
- `packages/cli/skills/drift-tech-writer/references/checklist.md`
- `packages/cli/skills/drift-tech-writer/references/examples.md`
- `packages/cli/skills/drift-architect/SKILL.md`
- `packages/cli/skills/drift-architect/references/checklist.md`
- `packages/cli/skills/drift-architect/references/examples.md`
- `packages/cli/skills/drift-ux-designer/SKILL.md`
- `packages/cli/skills/drift-ux-designer/references/checklist.md`
- `packages/cli/skills/drift-ux-designer/references/examples.md`
- `packages/cli/skills/drift-cm/SKILL.md`
- `packages/cli/skills/drift-cm/references/checklist.md`
- `packages/cli/skills/drift-cm/references/examples.md`
- `README.md`
- `packages/cli/README.md`
- `CLAUDE.md`
- `docs/commands/context.mdx`
- `docs/commands/index.mdx`
- `docs/commands/skills.mdx`
- `docs/commands/10-minutes-to-value.mdx`
- `.drift/contracts.generated.index/**` (regenerated by `drift-lock extract` — never hand-edited)

Deleted:
- (none — code is excised from within files; no whole file is removed)

# Test strategy

- Done when #1 (no `context --task` left in the taught surfaces) → `grep -rn 'context --task' packages/ README.md CLAUDE.md docs/commands/` returns nothing. **Scope note**: `docs/v2.md`, `docs/website-prd.md`, `docs/drift-skills-direction.md`, `docs/drift-proof.md` are historical design/PRD records, intentionally left untouched — the goal's criterion is scoped to the surfaces that *teach* the command.
- Done when #2 (engine symbols gone) → `grep -rn 'renderTaskContext\|scoreContractForTask\|RenderTaskContextOptions' packages/` returns nothing (excluding `dist/`, rebuilt in step 6)
- Done when #3 (`--task` rejected by the CLI) → `packages/cli/tests/context.test.ts`: the flag now produces an unknown-option error; `drift-lock context --task "x"` exits non-zero
- Done when #4 (`context <file>` unchanged) → existing `packages/core/tests/context.test.ts` file-scoped cases and `packages/cli/tests/context.test.ts` stay green untouched — this is the regression guard for the path we keep
- Done when #5/#6 (locked-contract changes justified) → **amended**: rather than assuming which contracts change, `pnpm drift-lock:diff` names them and each gets an `accept` entry. Expected: `core.context-renderer` only — `cli.command-surface`'s `must_not_change` does not pin `--task` (it pins config-read, extract-only-writes, `--git-base`+`--changed`), and `core.public-api`'s contract block itself is unchanged by dropping an export (only `packages/core/tests/public-api.test.ts`'s export list moves). Proof: `pnpm drift-lock:check` green with the accepted-contract-change committed.
- Done when #7 (skills teach the per-file discipline) → `packages/cli/tests/skills.test.ts` asserts the generated skill content contains the per-file instruction and no longer contains `context --task`
- Done when #8 (full gate) → `pnpm build && pnpm check && pnpm test && pnpm lint && pnpm drift-lock:check`
- Done when #9 (committed index current) → `pnpm drift-lock:extract` then `git status --porcelain -- .drift/contracts.generated.index` is empty (this is exactly what CI asserts)
- Done when #10 (README documents the per-file discipline) → manual review of the README diff; no automated proof

# Risks & unknowns

- **Which locked contracts `drift-lock diff` actually reports is not fully known ahead of the edit.** The plan assumes `core.context-renderer` only. If `diff` also reports `core.public-api` or `cli.command-surface`, each gets its own justified `accept` entry — that is expected and handled, not a stop. → Stop if: `drift-lock accept` cannot record a change, or `drift-lock check` still fails once the entries are written (goal's Stop if).
- **Breaking change on a published package.** Removing `--task` and the `renderTaskContext` root export breaks any external consumer. Acceptable at `0.1.5-alpha`, and better excised now than carried. **Approval requested at plan review: a breaking CLI/API change shipped in the alpha line** (no semver major; release notes must call it out).
- **The safety of removal rests entirely on enforcement.** If an agent no longer receives a task-level contract dump, its only guard is the per-file pull plus ESLint/`check`. This is a deliberate trade: the measured `--task` gave 89% recall (it *already* missed contracts) while creating false confidence. Enforcement is unchanged by this plan and is listed as Never touch.
- **`packages/core/dist/index.d.ts` still lists `renderTaskContext`** — it is build output, regenerated by `pnpm build` in step 6; not hand-edited.
- **Historical docs keep stale `context --task` references** (`v2.md`, `website-prd.md`, `drift-skills-direction.md`, `drift-proof.md`). Accepted consequence: they are design records, not API documentation. Flagged rather than silently widened into scope.
- **The five skill families are published artifacts** installed into users' projects by `drift-lock skills install`; rewording them changes what every future install receives. Covered by `skills.test.ts` assertions, but the wording itself is a product decision surfaced here for review.
