# Goal

`drift-lock context --task <prompt>` no longer exists. Contract context is obtained only by the deterministic, file-scoped path (`drift-lock context <file>`), which returns the requested file's **contract neighbourhood** — the contracts anchored on it **and** the contracts that declare it as a source of truth. No prediction, no noise, no misses: measured end-to-end over 15 real commits, it returns **exactly the necessary set** (precision 100%, recall 100%, 15/15 exact, median 3 contracts vs 45 with `--task`). Agent skills teach the per-file discipline instead of the task-level prediction, and enforcement (`@drift-lock/eslint-plugin`, `drift-lock check`) remains the real safety net.

Rationale (measured on this repo, 15 commits touching contracted source, task prompt = commit subject; ground truth = contracts anchored on the files each commit actually changed):

- precision **10%** (48 relevant / 473 injected) — 90% of injected contracts are noise
- recall **89%** (48 / 54) — it still misses needed contracts
- median **45 contracts injected for 2 necessary**; **0/15** runs were exactly necessary
- the repo holds **48 contracts in total**, so a broad task returned **all 48** and a narrow one 36 — `--task` was not scoping, it was dumping the whole corpus
- cost **6–8k tokens per task** (30 798 chars broad / 24 652 narrow)

The recall is bought by volume, not relevance: the three worst-recall runs (67%, 40%) are precisely those where the predicted set was *small*. A top-k or score threshold therefore cannot fix it — it would cut recall exactly where it is already fragile. The lexical keyword-overlap signal in `scoreContractForTask` is structurally misaligned with the true necessary set, which is only well-defined relative to the files a change actually touches. Worse than the cost: `--task` manufactures the illusion of a complete invariant set, so an agent that trusts it and skips per-file context edits more blindly than one with no tool at all.

# References

- `packages/core/src/core/context.ts` — `renderTaskContext` + `scoreContractForTask` (the code being removed); carries the **locked** `core.context-renderer` contract whose `must_not_change` includes "Task context must rank contracts from ids, files, intents, SSOT, invariants, and LLM notes"
- `packages/core/src/index.ts` — exports `renderTaskContext`; carries the **locked** `core.public-api` contract ("Existing CLI and ESLint plugin engine imports must remain reachable through the package root")
- `packages/cli/src/cli.ts` — the `context` command definition (the `--task <prompt>` option); the CLI surface is pinned by the locked `cli.command-surface` contract
- `packages/cli/skills/{drift-dev,drift-tech-writer,drift-architect,drift-ux-designer,drift-cm}/` — SKILL.md + `references/{checklist,examples}.md`, all of which instruct agents to run `context --task "<user prompt>"`
- `packages/cli/tests/skills.test.ts` — asserts the generated skill content contains `context --task "<user prompt>"`
- `README.md` (~L461–501) and `docs/` — user-facing examples using `context --task`
- `.drift/accepted-contract-changes/` — where an intentional locked-contract change must be justified (`drift-lock accept <id> --reason "<reason>"`)
- Evaluation script producing the numbers above: task = commit subject, necessary = union of `context <file>` over the commit's changed source files, predicted = `context --task "<subject>"`

# Done when

- [ ] `grep -rn 'context --task' packages/ README.md CLAUDE.md docs/commands/` returns nothing (source, skills, and the docs that *teach* the command). `docs/v2.md`, `docs/website-prd.md`, `docs/drift-skills-direction.md` and `docs/drift-proof.md` are historical design/PRD records and are deliberately left untouched
- [ ] `grep -rn 'renderTaskContext\|scoreContractForTask\|RenderTaskContextOptions' packages/` returns nothing
- [ ] `drift-lock context --task "x"` exits non-zero with an unknown-option error (the flag is gone from the CLI surface)
- [ ] `drift-lock context <file>` returns the file's **contract neighbourhood**: the contracts anchored on it **and** the contracts that declare it as an SSOT (with the ssot key and the invariants enforcing it)
- [ ] Measured over the 15 evaluation commits, the union of `drift-lock context <file>` over each task's touched files returns **exactly the necessary set**: precision 100%, recall 100%, 15/15 exact (necessary = contracts anchored on the changed files ∪ contracts declaring one of them as an SSOT)
- [ ] SSOT candidate resolution reuses `contract-paths` (`moduleFileCandidates`) — the same rule `buildFileRecords` and the git scope apply — with no local re-implementation
- [ ] The `core.context-renderer` contract no longer carries the task-ranking invariant nor the planning-notes invariant, and its `intent` is narrowed to file context
- [ ] Every locked contract that `pnpm drift-lock:diff` reports as changed has a justified entry under `.drift/accepted-contract-changes/` (expected: `core.context-renderer` only — `cli.command-surface` does not pin `--task`, and `core.public-api`'s contract block is unchanged by dropping an export), and `pnpm drift-lock:check` is green with those entries committed
- [ ] The five bundled skill families instruct agents to pull `context <file>` before editing each file they touch, and no longer mention a task-level prediction
- [ ] `pnpm build`, `pnpm check`, `pnpm test`, `pnpm lint` and `pnpm drift-lock:check` all pass
- [ ] `pnpm drift-lock:extract` leaves `.drift/contracts.generated.index` clean (`git status --porcelain -- .drift/contracts.generated.index` is empty), i.e. the committed index is regenerated and matches
- [ ] README documents the per-file discipline (pull contract context for the files you touch) and no longer advertises task-level context

# Never touch

- `.github/workflows/release.yml` and the npm publish path
- `drift-lock check`, `diff`, `explain`, `coverage`, `proof`, `accept`, `install`, `skills` — command behaviour is out of scope
- The `@drift-lock/eslint-plugin` rules and `drift-lock check` semantics — enforcement must keep working exactly as today (it is the safety net that makes this removal safe)
- ~~`renderContext` (the file-scoped path) and the `core.context-renderer` invariant "File context must stay scoped to the requested file" — it stays~~ — **guardrail deliberately lifted by owner decision (2026-07-14), on evidence.** Measuring the replacement showed anchored-only context had 100% precision but only **67% recall** (28 ssot-impacted contracts missed over the same 15 commits; 7/15 tasks complete): a contract anchored elsewhere can be broken by editing the file it declares as its SSOT, and nothing warned the agent. Shipping the removal while leaving that hole would have reproduced the very defect being removed — false confidence. `renderContext` therefore now returns the file's **contract neighbourhood** (anchored ∪ SSOT-consumers), still derived from the file and never predicted. The invariant is restated accordingly and re-accepted. See the extra Done-when below.
- The `@drift` contract format itself (`.drift/config.json` schema, contract syntax)
- Hand-editing any file under `.drift/contracts.generated.index/` — it is regenerated via `drift-lock extract`, never patched

# Stop if

- Removing the `renderTaskContext` export from the package root breaks a consumer other than the CLI (an unexpected import surfaces during `pnpm check`)
- `drift-lock accept` cannot record either locked-contract change, or `drift-lock check` still fails after the accepted-contract-change entries are written
- Removing `--task` turns out to break `install`, `skills` scaffolding, or the demo app's scripts in a way not listed above
- The skills rewrite would require changing what the skills *enforce* (their checklists' assertions about `check` / `diff` / `proof`), rather than only how contract context is obtained
- Any existing test unrelated to task context starts failing
