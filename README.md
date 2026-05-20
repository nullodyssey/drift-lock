# DriftLock

DriftLock explores a simple idea: AI agents should not only receive prompts, they should receive local, executable intent from the codebase itself.

The long-term goal is to make critical product and engineering intent explicit enough that an agent can understand what must stay stable, and deterministic checks can fail when the implementation drifts away from that intent.

V1 deliberately keeps the scope small. It focuses on colocated `@drift` contracts, committed contract indexes, targeted agent context, locked invariants, and SSOT checks. This narrow surface is the proof that the final objective is possible: code can carry enforceable intent, and AI-assisted changes can be checked against it.

## Why

AI coding agents are fast, but they do not naturally know which local rules must not change. A small refactor can inline a price, bypass a schema, weaken a checkout flow, or keep an import around while the actual returned value no longer comes from the intended source.

DriftLock makes those constraints explicit in the codebase:

- `@drift` contracts describe local intent and sources of truth.
- `drift-lock context` gives agents the relevant contract before they edit.
- `drift-lock check` validates supported invariants in CI.
- ESLint rules bring DriftLock feedback into the normal developer loop.
- `drift/ssot-flow` verifies that declared return fields actually derive from the expected SSOT, not just that an import exists.
- Agent skills can install workflow guidance for OpenAI Codex, Claude, and Cursor.

The goal is not to replace tests or code review. The goal is to make critical intent machine-readable enough that AI-assisted changes cannot silently bypass it.

## Goal

The final goal is for an AI agent to enter a codebase and immediately understand the local rules that matter: what a feature is supposed to preserve, which sources of truth are authoritative, which outputs are critical, and which changes require explicit product or engineering approval.

The "wow" moment is simple: ask an agent to change critical code, and before it edits, it can explain the relevant contracts, identify the risk, use the right source of truth, and prove afterward that the implementation still respects the declared intent.

In future versions, this could become a task-level workflow:

```bash
drift-lock task "add X feature"
```

Instead of sending a raw prompt directly to an agent, DriftLock would translate the request into contract-aware context: impacted contracts, authoritative sources of truth, locked constraints, likely drift risks, safe implementation boundaries, and required checks.

DriftLock should make the codebase feel self-defending. Not because the agent is trusted to remember every rule, but because the rules live next to the code and can be extracted, shared, and checked.

## DriftLock and LLM Rule Files

DriftLock is complementary to LLM rule files such as `AGENTS.md`, `CLAUDE.md`, Cursor rules, or provider-specific instructions.

Those files are useful to describe global team preferences, coding style, workflows, and agent behavior. DriftLock targets a different layer: local product and engineering intent attached to the code that carries the risk.

The difference is enforcement. A rule file can tell an agent what to do. A DriftLock contract can be extracted into context and then checked deterministically, so the codebase can fail when a critical invariant is silently bypassed.

## What's Next

DriftLock V1 proves the primitive:

```txt
@drift contract
  -> extract
  -> committed index
  -> agent context
  -> static drift checks
  -> CI failure on supported drift
```

The next direction is stronger flow analysis and better agent workflows:

- deeper object and collection paths for `drift/ssot-flow`
- branch-aware and union-aware sink checks
- safer handling of destructuring, spreads, and helper calls
- broader ESLint rules for fast editor and CI feedback
- richer installable skills for AI development workflows
- task-level context generation with commands like `drift-lock task "add X feature"`
- a clearer path from local demo to published CLI usage

## Quick start

Install dependencies:

```bash
pnpm install
```

Build the workspace:

```bash
pnpm build
```

Inspect the DriftLock context for the demo action:

```bash
pnpm --filter next-v1 drift-lock:context
```

Run the drift-lock check:

```bash
pnpm --filter next-v1 drift-lock:check
```

Run the full verification suite:

```bash
pnpm check
pnpm test
```

Install agent skills for local development:

```bash
pnpm --filter next-v1 exec drift-lock skills list
pnpm --filter next-v1 exec drift-lock skills install --provider openai --drift-command "pnpm --filter next-v1 exec drift-lock"
```

To see the full proof scenario, follow the [Next.js demo README](./apps/next-v1/README.md).
