---
name: drift-design
description: Design DriftLock-branded interfaces, prototypes, visual assets, presentations, marketing pages, editor overlays, dashboards, CI drift reports, and production UI using this repository's design system. Use when Codex needs DriftLock voice, colors, type, logo assets, UI kits, component conventions, product copy, CLI examples, contract syntax, diagnostic IDs, or brand-safe frontend design.
---

# Drift Design

Use this repo-local skill to design DriftLock surfaces without inventing a
second brand or product model. The skill is self-contained.

## Start Here

1. Read `references/design-system.md` first. It is the source of truth for
   DriftLock voice, color, type, spacing, iconography, animation, layout, and
   product-surface conventions.
2. Use `assets/colors_and_type.css` as the token source for HTML/CSS work.
   Reference or copy it into the artifact and use its custom properties
   (`--seal-500`, `--ink-950`, `--font-sans`, etc.).
3. Use local bundled assets:
   - `assets/brand/` for logos, stamps, favicon, and margin rule SVGs.
   - `assets/preview/` for token and component preview cards.
   - `assets/ui_kits/marketing/` for public-site patterns.
   - `assets/ui_kits/editor/` for editor overlay patterns.
   - `assets/ui_kits/ci_report/` for PR or CI drift-report patterns.
4. Prefer lifting structure, spacing, and components from the UI kits before
   creating new compositions.

## Design Rules

- Voice: understated competence. No exclamation marks, no emoji, no
  marketing-loud copy.
- Casing: sentence case for UI text. Code identifiers, file paths, rule IDs,
  package names, and CLI commands stay monospaced.
- Default to the paper/light pole for marketing and documents. Use the ink/dark
  pole for editor, terminal, and dense developer-tool contexts.
- Use Lucide-style icons for UI iconography: 24px viewbox, 1.5px stroke. Do not
  substitute emoji.
- Use the ledger rule: a thin vertical margin line on contract regions, code
  blocks, and sealed areas.
- Use one seal element per view. `seal-500` (`#C2410C`) is the stamp moment, not
  a general accent color.
- Keep radii tight: 2, 4, 6, or 10px. DriftLock is not pill-shaped.
- Avoid generic AI-design tropes: gradient hero backgrounds, glassmorphism,
  neon, giant rounded cards, colored left-border category cards, shields,
  padlocks, gears, and AI-brain icons.

## Real Product Surface

Use these names and examples verbatim in screenshots, mocks, and docs.

- Repo: `nullodyssey/drift-lock`
- CLI package: `@drift-lock/cli`
- Core package: `@drift-lock/core`
- ESLint plugin: `@drift-lock/eslint-plugin`
- Install: `npx --yes @drift-lock/cli@latest install`

Canonical CLI commands:

```bash
drift-lock install
drift-lock context <file>
drift-lock context --task "<prompt>"
drift-lock extract
drift-lock check
drift-lock check --changed --git-base origin/main
drift-lock coverage
drift-lock diff --summary
drift-lock proof --git-base origin/main
drift-lock proof --git-base origin/main --format json
drift-lock explain [contract-id]
drift-lock explain --json
drift-lock accept <contract-id> --reason "<reason>"
drift-lock skills list
drift-lock skills install --provider openai
drift-lock skills install --provider claude
drift-lock skills install --provider cursor
```

Contracts are `/* @drift */` YAML block comments anchored to a declaration or
file. Never represent DriftLock contracts as `contract({ ... })` calls.

```ts
/* @drift
version: 1
id: core.proof-report
scope: file
stability: draft

intent: >
  Compose existing DriftLock check, diff, coverage, and Git scope signals into
  a stateless pull request proof report.

ssot:
  checker: "./checker.ts"
  contract-diff: "./contract-diff.ts"
  coverage: "./coverage.ts"
  git-scope: "./git-scope.ts"
  locked-contracts: "./locked-contracts.ts"

invariants:
  - id: proof-runs-checks
    enforce: drift/ssot-usage
    ssot: checker
  - id: proof-uses-contract-diff
    enforce: drift/ssot-usage
    ssot: contract-diff
  - id: proof-uses-coverage
    enforce: drift/ssot-usage
    ssot: coverage
  - id: proof-reuses-git-scope
    enforce: drift/ssot-usage
    ssot: git-scope
  - id: proof-reuses-acceptance-status
    enforce: drift/ssot-usage
    ssot: locked-contracts

llm:
  must_not_change:
    - Proof must compose existing Drift checks instead of creating a second verifier.
    - Stateless proof must not claim counterfactual regressions were prevented.
    - Unresolved drift must stay report-only in the MVP.
*/
export type ProofReportOptions = {
  root: string;
  sourceDir?: DriftSource;
  indexPath?: string;
  gitBase: string;
  requireContracts?: string[];
  adoptionMode?: DriftAdoptionMode;
};
```

Recommended ESLint rule IDs:

- `drift-lock/valid-contract`
- `drift-lock/no-locked-contract-change`
- `drift-lock/ssot-usage`
- `drift-lock/ssot-flow`

Diagnostic IDs for drift cards and CI reports:

- `DRIFT011_LOCKED_CONTRACT_CHANGED`
- `DRIFT013_SSOT_FLOW_NOT_PROVEN`
- `DRIFT015_REQUIRED_CONTRACT_MISSING`

Index and config files:

- `.drift/config.json`
- `.drift/contracts.generated.json`
- `.driftignore`

## Output Guidance

When building a visual artifact, make the artifact usable on its first screen.
Do not create a generic landing page unless the user asks for marketing.

For production UI changes, inspect the target app before editing and adapt the
design system to the existing framework. Copy only the needed assets into the
app or reference them with correct relative paths.

If the user invokes this skill without a concrete target, ask what surface they
want to design and who it is for, then choose the closest UI kit as the base.
