---
name: goal-definition
description: Define a goal with a clear Definition of Done and write it to a goal.md file. Use this skill whenever the user wants to define, frame, scope, or formalize an objective, a task, a mission, a feature, or a piece of work — especially when they mention "goal", "objectif", "definition of done", "DoD", "cadrage", "goal.md", "contrat d'exécution", or want to prepare a task for an AI agent or a developer to execute. Also use it when the user describes work to be done and asks to "structure it", "write it down properly", or "turn this into a goal".
---

# Goal Definition

Turn a stated objective into a `goal.md` file — a short, verifiable execution contract. The file tells whoever executes it (an AI agent, a developer, or the user themselves) exactly what outcome is expected, what proves it's done, what must not be touched, and when to stop and ask.

The value of a goal.md is not in describing the work — it's in making success **checkable** and failure **safe**. A vague goal produces drift; a precise goal produces a diff you can review with confidence.

## Output format

ALWAYS write `goal.md` using this exact template, with these exact section headings, in this exact order. Never add, remove, rename, or reorder sections:

```markdown
# Goal
...

# References
...

# Done when
...

# Never touch
...

# Stop if
...
```

Write the *content* of the file in the language the user is using (French user → French goal.md). Keep the section headings exactly as above, in English, since they act as a stable machine-readable contract.

## Workflow

### 1. Gather context before writing anything

A goal.md written from thin air is worthless. Before drafting:

- **Mine the conversation.** The user has often already described the objective, the constraints, and the pain points. Extract them first.
- **Explore the environment.** If a repository, directory, or files are available, look at them: project structure, conventions, existing docs (README, ADRs, CLAUDE.md, existing goal.md files), the code areas the goal will touch. Concrete file paths make far better References and Never touch entries than generalities.
- **Identify what's missing.** The sections that most often lack information are *Done when* (how do we objectively verify success?), *Never touch* (what's fragile, out of scope, or forbidden?), and *Stop if* (what situations require a human decision?).

### 2. Interview the user for the gaps

Ask targeted questions — only about what you genuinely couldn't infer. Group them in one short message rather than dribbling them out. Typical high-value questions:

- "How will you verify this is done? A passing test, a visible behavior, a metric?"
- "Is there anything nearby in the codebase that must absolutely not change?" (public APIs, DB schema, config, billing code, generated files...)
- "If X turns out to be more complicated than expected, should the executor decide alone or stop and ask you?"

If the user says "just draft it", draft it with your best inferences and flag the assumptions inline so they're easy to correct.

### 3. Determine the target directory

Write the file to the directory the user specified. If none was specified:
- In a project/repository context, propose the project root (or a `docs/` or `.agents/` directory if the project already has that convention).
- Otherwise, ask. Don't silently invent a location.

If a `goal.md` already exists at the target path, show the user and ask whether to overwrite, or suggest a distinct name (e.g. `goal-payment-refactor.md`).

### 4. Write each section well

**# Goal** — One outcome, stated as a result, not a task list. It should answer "what will be true when this is finished?" in 1–3 sentences. If the user's request contains several unrelated outcomes, say so and propose splitting into several goal.md files — one contract per goal.

- Weak: "Refactor the payment service and improve tests and update docs."
- Strong: "Payment capture is handled by a dedicated `CapturePayment` command handler; the legacy `PaymentService::capture()` path no longer exists and all callers use the new handler."

**# References** — Everything the executor needs to open before starting: file paths, docs, ADRs, API specs, URLs, conventions, prior discussions. Prefer precise paths (`src/Payment/PaymentService.php`) over vague pointers ("the payment code"). One item per line, with a short note on *why* each reference matters when it's not obvious.

**# Done when** — The heart of the contract. A checklist of objectively verifiable criteria. Each line must be checkable by someone who wasn't in the conversation: a command that passes, a behavior that can be observed, a file that exists, a number that can be measured.

- Weak: "The code is clean and well tested."
- Strong: "- [ ] `composer test` passes with no new skipped tests" / "- [ ] `grep -r 'PaymentService::capture' src/` returns nothing"

Use `- [ ]` checkboxes. If a criterion can be verified by a command, include the command.

**# Never touch** — The guardrails. Files, directories, behaviors, data, or interfaces that are off-limits, even if touching them would "help". Be specific: exact paths, exact public signatures, exact DB tables. This section exists because executors (human or AI) under pressure to finish will otherwise widen the blast radius.

**# Stop if** — Circuit breakers: conditions under which the executor must halt and come back to the user instead of improvising. Typical entries: a Never-touch item turns out to be unavoidable, a hidden dependency or side effect is discovered, the estimated scope explodes, a destructive/irreversible operation seems required, tests unrelated to the goal start failing. These are conditions, not instructions — each line should complete the sentence "Stop if...".

### 5. Review pass before delivering

Reread the draft with fresh eyes and check:

- Every *Done when* item is verifiable by a third party. If a line contains "clean", "proper", "good", "improved" without a measurable definition, rewrite it or delete it.
- *Goal* describes one outcome, not a plan of tasks.
- *Never touch* and *Stop if* are non-empty. If the user genuinely confirmed there are no guardrails, write the confirmed absence explicitly (e.g. "Nothing identified — confirmed with the owner on 2026-07-05") rather than leaving the section blank, so a reader knows it was considered.
- No section drifted from the fixed template.

Then create the file at the target path and show the user its full content for validation.

## Example

User request: *"I want to add rate limiting on my SaaS public API, write the goal in docs/"*

After exploring the repo and asking two questions (verification method, forbidden zones), the skill produces `docs/goal.md`:

```markdown
# Goal
Public endpoints `/api/v1/*` are protected by per-API-key rate limiting (100 req/min), returning `429` with a `Retry-After` header when exceeded. Behavior for clients under the limit is unchanged.

# References
- `src/Infrastructure/Http/ApiKeyAuthenticator.php` — entry point where the API key is resolved
- `config/packages/framework.yaml` — existing Symfony rate_limiter configuration (currently empty)
- ADR-012 (`docs/adr/012-redis-usage.md`) — Redis is the only store allowed for shared state
- https://symfony.com/doc/current/rate_limiter.html

# Done when
- [ ] A client exceeding 100 req/min on `/api/v1/*` receives `429` with a `Retry-After` header
- [ ] A client under the limit receives responses identical to before (verified by the existing functional suite)
- [ ] `composer test` passes with no new skipped tests
- [ ] The limit is configurable via the `API_RATE_LIMIT` environment variable
- [ ] A functional test covers the 429 case

# Never touch
- The `api_keys` table schema (no migration allowed)
- Internal endpoints `/admin/*` — out of scope
- The public signature of `ApiKeyAuthenticator::authenticate()`

# Stop if
- Rate limiting requires a database schema change
- Redis is unavailable in the target environment
- Existing tests unrelated to rate limiting start failing after your changes
- The scope requires touching the `/admin/*` endpoints
```

Note what makes this good: every Done-when line is checkable by command or observable behavior, References carry a "why", Never touch names exact paths and signatures, and Stop if lines are conditions that route the decision back to a human.
