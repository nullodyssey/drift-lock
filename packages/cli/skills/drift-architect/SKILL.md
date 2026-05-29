---
name: drift-architect
description: Protect system boundaries and structural decisions from LLM-drift. Use when the user invokes $drift-architect, changes packages, module ownership, import boundaries, runtime boundaries, public APIs, monorepo structure, framework migration paths, or cross-cutting SSOT decisions that need Drift-aware architecture constraints.
---

# Drift Architect

Use this skill before structural changes. The LLM-drift risk is that the agent introduces forbidden dependencies, breaks domain/ui/server boundaries, chooses a structure that blocks future contracts, or treats a framework-specific habit as a project-wide rule.

The goal is to identify existing boundaries, expose dangerous implicit boundaries, and propose the smallest useful contracts or policies before implementation.

## Workflow

1. Read the repository structure, package manifests, existing contracts, and relevant source files before proposing architecture changes.
2. If the work starts from a user prompt, run or recommend `{{DRIFT_COMMAND}} context --task "<user prompt>"`.
3. For known critical files or packages, run or recommend `{{DRIFT_COMMAND}} context <file>`.
4. Identify current boundaries: imports, ownership, runtime, packages, public APIs, and SSOT locations.
5. Identify implicit boundaries that are dangerous because they are important but not protected.
6. Propose minimal contracts, policies, or coverage requirements that preserve the intended structure.
7. Avoid framework-specific prescriptions when a broader project rule is enough.
8. Distinguish irreversible decisions, reversible conventions, and accepted debt.
9. Route implementation to `$drift-dev` or proof/risk review to `$drift-analyst`.
10. End with current boundaries, proposed constraints, contract candidates, migration path, required checks, and open risks.

## Commands

Use the configured Drift command prefix:

```txt
{{DRIFT_COMMAND}}
```

Build concrete Drift commands by appending the subcommand, for example `{{DRIFT_COMMAND}} context --task "<user prompt>"`, `{{DRIFT_COMMAND}} context <file>`, `{{DRIFT_COMMAND}} coverage`, `{{DRIFT_COMMAND}} diff --summary`, `{{DRIFT_COMMAND}} check`, `{{DRIFT_COMMAND}} explain <contract-id>`, or `{{DRIFT_COMMAND}} proof --git-base <ref>`.

For non-Drift checks, inspect the target project's scripts first and only recommend commands that exist in that project.

## Rules

```txt
- Do not introduce broad architecture rules without identifying the protected risk.
- Do not weaken locked contracts to make a structural change easier.
- Do not assume a framework-specific pattern is required across the whole repo.
- Do not call an unprotected boundary safe; mark missing coverage as a risk.
- Prefer minimal enforceable constraints over big-bang rewrites.
```

## Output

Return an `Architecture Direction` with:

```txt
Current boundaries:
Proposed constraints:
Contract candidates:
Migration path:
Required checks:
Open risks:
Recommended next role:
```

Read `references/checklist.md` before recommending architecture constraints and `references/output-format.md` before the final response.
