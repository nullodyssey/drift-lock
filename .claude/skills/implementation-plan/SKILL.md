---
name: implementation-plan
description: Produce an implementation-plan.md file — the sequenced execution plan that pairs with a goal.md contract. Use this skill whenever the user wants to plan the implementation of a task, feature, issue, or goal — especially when they mention "implementation plan", "plan d'implémentation", "implementation-plan.md", "how should we build this", "découpe la tâche", "steps to implement", or when a goal.md exists (or was just produced) and the next step is planning the build. Also use it inside automated planning pipelines (e.g. Automator) right after the goal-definition skill has produced goal.md. If the user asks to "plan" work that already has a defined goal, this skill is the answer — do not produce a free-form plan.
---

# Implementation Plan

Turn a defined goal into an `implementation-plan.md` file — a sequenced, reviewable execution plan. Where `goal.md` (produced by the `goal-definition` skill) is the **contract** (what will be true, how to verify it, what must not change), `implementation-plan.md` is the **route** (in what order, touching which files, proven by which tests).

The value of an implementation plan is not describing the work — it's making the execution **reviewable before it starts** and **drift-detectable while it runs**. A reviewer should be able to reject a bad approach from the plan alone; an executor (human or AI agent) that deviates from `Files touched` should treat the deviation itself as a signal to stop and reassess.

## Relationship with goal.md — the pairing rule

`implementation-plan.md` NEVER duplicates `goal.md`. It references it.

| Lives in goal.md | Lives in implementation-plan.md |
|---|---|
| The outcome (Goal) | The strategy to reach it (Approach) |
| Verifiable success criteria (Done when) | Which test/command proves each criterion (Test strategy) |
| Forbidden zones (Never touch) | The exhaustive list of files that WILL change (Files touched) |
| Halt conditions (Stop if) | Known risks that could trigger them (Risks & unknowns) |

**Prerequisite**: a `goal.md` must exist for the task. If it doesn't, never write an implementation plan against an undefined goal — that's how scope drift starts. In interactive use, tell the user it's missing and offer to produce it first with the `goal-definition` skill (or let them point to an existing contract). In non-interactive contexts (automated pipelines, headless runs), default to producing `goal.md` first via `goal-definition`, then continue with the plan.

## Output format

ALWAYS write `implementation-plan.md` using this exact template, with these exact section headings, in this exact order. Never add, remove, rename, or reorder sections:

```markdown
# Implementation plan — {task identifier}

# Approach
...

# Steps
...

# Files touched
...

# Test strategy
...

# Risks & unknowns
...
```

Write the *content* in the language the user (or the source issue) is using. Keep the section headings exactly as above, in English — they act as a stable machine-readable contract.

The task identifier matches the goal.md's task (e.g. `issue #142`). File location: next to the task's `goal.md` (in an Automator-managed repo: `.automator/tasks/issue-{n}/implementation-plan.md`). If no convention exists, ask — don't invent a location silently.

## Workflow

### 1. Read the contract and the terrain

Before drafting a single step:

- **Read `goal.md` in full.** Every section of the plan is derived from it. In particular, memorize `Never touch` — it constrains `Files touched` absolutely — and `Done when` — it dictates `Test strategy`.
- **Explore the code the plan will touch.** Open the actual files, follow the actual call sites, check the actual test layout. A plan written from imagined file paths is worse than no plan: it gives false confidence. Every path in the plan must exist or be explicitly marked `(new)`.
- **Check project conventions**: README, CLAUDE.md, ADRs, existing plans in `.automator/tasks/` (pipeline-produced) and `docs/tasks/` (human-authored campaigns). The Approach must fit the house architecture, not fight it.

### 2. Choose ONE approach

If two strategies are genuinely viable, pick one and record the rejected one in a single line inside Approach ("Alternative X rejected: reason"). A plan that hedges between two approaches is not executable. If the choice genuinely requires the owner's judgment (cost, product trade-off), stop and ask — that's a planning-time `Stop if`.

### 3. Write each section well

**# Approach** — 2-4 sentences: the strategy and why it fits. Name the key design decision (pattern, layer, mechanism), not the task list. If an obvious alternative was rejected, one line says why.

- Weak: "Implement the feature as described in the issue, following best practices."
- Strong: "Add rollback as a compensating `RevertMatchResult` command replaying inverse Elo deltas, rather than mutating stored ratings — keeps the event log append-only (ADR-007). Alternative (soft-delete + recompute) rejected: O(n) recompute on every rollback."

**# Steps** — an ordered list where **each step is a committable increment**: after it, the code compiles and existing tests pass. Format each step as:

```
1. [zone] What this step delivers — files: `path/one.php`, `tests/path/OneTest.php`
```

- The `[zone]` tag is a short area label (`[domain]`, `[api]`, `[migration]`, `[tests]`...). Consistent tags make plans comparable across tasks.
- Order steps so the riskiest/most-unknown step comes as early as dependency order allows — fail fast, before sunk cost.
- 3-9 steps. Fewer than 3: the task may not need a plan. More than 9: propose splitting the goal itself.
- No step may touch a `Never touch` path. Check each one.

**# Files touched** — the exhaustive expected change list, in three groups: **Created**, **Modified**, **Deleted**. One file per line, real paths. This section is machine-consumed:

- Drift detection: an executor whose actual diff significantly exceeds this list must stop, not improvise.
- Context recall: the listed areas feed memory queries about relevant conventions and past decisions.

Rules: every file named in Steps appears here; nothing here intersects `Never touch`; the `(new)` marker applies in Steps — in Files touched, the **Created** group already carries that information, don't repeat the marker; if a file *might* change ("possibly `config/services.yaml`"), decide now — a maybe-list defeats drift detection.

**# Test strategy** — a mapping, not an essay. For EVERY `Done when` item in goal.md, name the proof:

```
- Done when #1 (429 on rate limit) → new functional test `tests/Api/RateLimitTest.php::testExceedingLimitReturns429`
- Done when #2 (existing behavior unchanged) → existing suite `composer test` (no new skips)
- Done when #3 (env-configurable) → unit test on the config VO + assertion in the functional test
```

If a `Done when` item has no possible automated proof, say so explicitly and name the manual verification. An unmapped criterion means either the plan is incomplete or the goal.md needs amending — flag it, don't paper over it.

**# Risks & unknowns** — the honest list of what could go wrong or is not yet known, each with its consequence. Where a risk maps to a `Stop if` condition in goal.md, reference it explicitly ("→ Stop if: schema change required"). This section arms the executor's judgment: an agent hitting a listed risk knows it was anticipated and what to do; hitting an *unlisted* wall of similar magnitude is itself a stop signal.

**Owner-approval artifacts (mandatory)**: anything the plan introduces that requires the owner's sign-off beyond the plan itself — a new migration, a new dependency, configuration affecting other environments — MUST be listed here with an explicit approval-request line: "approval requested at plan review: new table `x`". Approving the plan then explicitly covers these artifacts. Conversely, an approval-requiring artifact that surfaces during execution without having been listed here is a stop signal, not something to improvise through.

- Weak: "Some edge cases may be tricky."
- Strong: "The Elo recompute touches `MatchResult` rows older than the UUID v7 migration (2025-11) — if any pre-migration rows exist in prod, ordering is not guaranteed → Stop if: pre-migration rows found."

### 4. Review pass before delivering

Reread the draft and check, in order:

- Every path in Steps and Files touched exists in the repo or is marked `(new)`.
- `Files touched` ∩ `Never touch` = ∅. This is a hard failure, not a style issue.
- Every `Done when` item from goal.md appears in Test strategy with a named proof.
- Every owner-approval artifact (new migration, new dependency, cross-env config) is listed in Risks & unknowns with its approval-request line.
- Each step is independently committable (compiles + green suite after it).
- Approach names one strategy; any alternative is rejected in one line, not left open.
- No section duplicates goal.md content — references only.

Then write the file at the target path and show the user (or return to the pipeline) its full content.

## Example

For a goal.md whose Goal is "Public endpoints `/api/v1/*` are protected by per-API-key rate limiting (100 req/min), returning 429 + Retry-After when exceeded":

```markdown
# Implementation plan — issue #87

# Approach
Use Symfony's built-in rate_limiter component with a Redis storage, keyed on the resolved API key, applied via a dedicated request listener — rather than middleware in the authenticator — so limiting stays decoupled from authentication (ADR-012 confines shared state to Redis). Alternative (decorating ApiKeyAuthenticator) rejected: couples two concerns and its public signature is a Never-touch.

# Steps
1. [config] Declare the `api` rate limiter (policy sliding_window, 100/min, Redis storage) — files: `config/packages/rate_limiter.yaml`, `config/packages/framework.yaml`
2. [infra] Request listener resolving the API key and consuming the limiter, 429 + Retry-After on rejection — files: `src/Infrastructure/Http/RateLimitListener.php` (new)
3. [config] Make the limit env-driven with a sane default — files: `config/packages/rate_limiter.yaml`, `.env`
4. [tests] Functional coverage: 429 case, under-limit unchanged behavior, header presence — files: `tests/Api/RateLimitTest.php` (new)

# Files touched
Created:
- `src/Infrastructure/Http/RateLimitListener.php`
- `tests/Api/RateLimitTest.php`
Modified:
- `config/packages/rate_limiter.yaml`
- `config/packages/framework.yaml`
- `.env`
Deleted:
- (none)

# Test strategy
- Done when #1 (429 + Retry-After over 100 req/min) → `tests/Api/RateLimitTest.php::testExceedingLimitReturns429WithRetryAfter`
- Done when #2 (under-limit behavior identical) → existing functional suite via `composer test`, no new skips
- Done when #3 (`API_RATE_LIMIT` env-configurable) → `tests/Api/RateLimitTest.php::testLimitIsEnvConfigurable`
- Done when #4 (functional test covers 429) → satisfied by #1 above

# Risks & unknowns
- Redis availability in the target env is assumed per ADR-012 — → Stop if: Redis unavailable in the target environment.
- Sliding window counters add one Redis round-trip per request; expected < 1 ms, unverified under load — acceptable for v1, note for the perf backlog.
- Clients behind a shared API key will share one bucket; confirmed acceptable in the issue thread.
```

Note what makes this good: the Approach records one decision and one rejection with reasons; every step is a green-suite commit; Files touched is exhaustive and definite; Test strategy maps every contract line to a named proof; each risk either references a Stop if or states its accepted consequence.
