# Doc Alignment Checklist

Use this checklist when comparing DriftLock docs and READMEs to the current
implementation.

## Implementation Sources

- CLI commands, options, and output: `packages/cli/src/cli.ts` and
  `packages/cli/tests`.
- Core public API: `packages/core/src/index.ts` and
  `packages/core/tests/public-api.test.ts`.
- Contract schema, diagnostics, and executable rules: `packages/core/src` and
  matching tests under `packages/core/tests`.
- ESLint rules and presets: `packages/eslint-plugin/src` and
  `packages/eslint-plugin/tests`.
- Package scripts, exports, versions, engines, and package names:
  `package.json` and `packages/*/package.json`.
- CI and release behavior: `.github/workflows/*.yml` and `docs/release.md`.
- Dogfood state: `.drift/config.json`, `.drift/contracts.generated.json`, and
  `docs/dogfood.md`.

## Documentation Surfaces

- Root product docs: `README.md`.
- Detailed docs: `docs/*.{md,mdx}`.
- Package docs: `packages/core/README.md`, `packages/cli/README.md`,
  `packages/eslint-plugin/README.md`.
- Demo docs: `apps/next-v1/README.md`.
- Website docs: `apps/web/docs/**/*.{md,mdx}`, excluding `apps/web/docs/next/**`.
- Agent-facing bundled skills: `packages/cli/skills/**`.
- Repo-local Codex skills: `.agents/skills/**`.

## Claims To Verify

- Install commands and package manager examples match the CLI package behavior.
- CLI command lists include only implemented commands and documented options.
- `drift-lock check`, `check --changed`, `coverage`, `diff --summary`,
  `context --task`, `explain`, `accept`, `skills list`, and `skills install`
  examples match tests or source.
- Config examples match `readDriftConfig` validation, defaults, and adoption
  modes.
- `drift/ssot-usage` and `drift/ssot-flow` docs match validator constraints and
  rule tests.
- `ssot-flow` supported and refused patterns match `ssot-flow.test.ts` and
  `docs/ssot-flow-improvement-spec.md` when present.
- Diagnostics and error codes match `errors.ts`, `explain.ts`, and tests.
- Coverage docs match `coverage.ts`, disable directive behavior, and tests.
- Acceptance file docs match `acceptance-file.ts`, `contract-diff.ts`, and
  `locked-contracts.ts`.
- ESLint docs match exported rule names and preset contents.
- Release docs match package names, scripts, CI workflow names, and npm publish
  order.
- Agent skill docs match their actual workflow, references, `agents/openai.yaml`
  metadata, and triggering promises. Check both `packages/cli/skills/**` and
  `.agents/skills/**`.

## Reporting Format

Use this shape for audit findings:

```txt
Severity:
Doc location:
Implementation source:
Problem:
Recommended fix:
```

Prefer a short list of high-confidence findings over broad speculation. If a
claim cannot be verified from source, mark it as ambiguous rather than false.
