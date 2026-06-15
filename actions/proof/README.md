# DriftLock Proof GitHub Action

Generate a DriftLock pull request proof report in GitHub Actions.

The action runs `drift-lock proof`, writes JSON and Markdown reports, publishes
the Markdown report to the job summary, and can update a pull request comment.
It applies blocking policy only after those artifacts are written.

## Usage

```yaml
name: DriftLock Proof

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  proof:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v6
        with:
          node-version: 24

      - uses: nullodyssey/drift-lock/actions/proof@v0.1.4-alpha
        with:
          git-base: ${{ github.event.pull_request.base.sha }}
          comment: true
```

For repositories that install DriftLock locally before running the action, pass
the local command explicitly:

```yaml
- uses: nullodyssey/drift-lock/actions/proof@v0.1.4-alpha
  with:
    git-base: ${{ github.event.pull_request.base.sha }}
    drift-command: pnpm
    drift-command-args: exec drift-lock
    comment: true
```

Use `fetch-depth: 0` on checkout so `drift-lock proof --git-base` can resolve
the pull request base commit.

Use strict policy when the proof report should block the job:

```yaml
- uses: nullodyssey/drift-lock/actions/proof@v0.1.4-alpha
  with:
    git-base: ${{ github.event.pull_request.base.sha }}
    drift-command: pnpm
    drift-command-args: exec drift-lock
    comment: true
    fail-on-unresolved: true
    fail-on-violations: true
    fail-on-dirty-index: true
    min-preservation-rate: "0.95"
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `root` | `.` | Project root passed to `drift-lock proof`. |
| `source` | | Source directory passed to `drift-lock proof`. |
| `index` | | DriftLock index store path passed to `drift-lock proof`. |
| `git-base` | pull request base SHA | Git ref used as the pull request base. |
| `output-dir` | `.drift/proof-report` | Directory where reports are written. |
| `comment` | `false` | Create or update a pull request comment. |
| `github-token` | `${{ github.token }}` | Token used when `comment` is enabled. |
| `drift-command` | `npx` | Command used to run DriftLock. |
| `drift-command-args` | `--yes @drift-lock/cli@latest` | Arguments placed before the `proof` subcommand. |
| `fail-on-unresolved` | `false` | Fail when unresolved contract drift remains. |
| `fail-on-violations` | `false` | Fail when current DriftLock violations remain. |
| `min-preservation-rate` | | Fail when intent preservation is below this ratio from `0` to `1`. |
| `fail-on-dirty-index` | `false` | Fail when the generated DriftLock index is dirty. |

## Outputs

| Output | Description |
| --- | --- |
| `protected-contracts-touched` | Number of protected contracts touched by the pull request. |
| `unresolved` | Number of unresolved contract changes. |
| `accepted` | Number of accepted contract changes. |
| `current-violations` | Number of current DriftLock violations. |
| `intent-preservation-rate` | Intent preservation rate as a number between 0 and 1. |
| `report-json-path` | Absolute path to the generated JSON report. |
| `report-markdown-path` | Absolute path to the generated Markdown report. |

## Pull Request Comments

When `comment: true`, the action updates the existing comment marked with
`<!-- drift-lock-proof-report -->` instead of creating a new comment per commit.
The comment includes the head commit SHA, base SHA, generation timestamp,
policy (`report` or `strict`), policy result for that commit, and the workflow
run URL when GitHub exposes it.

The comment describes DriftLock proof signals for the displayed commit. It does
not claim that the whole CI run is green; other jobs can still fail. If GitHub
returns `403` or `404` while listing or writing comments, the action emits a
warning and keeps the report available in the job summary.
