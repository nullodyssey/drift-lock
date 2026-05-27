# DriftLock Proof GitHub Action

Generate a DriftLock pull request proof report in GitHub Actions.

The action runs `drift-lock proof`, writes JSON and Markdown reports, publishes
the Markdown report to the job summary, and can update a pull request comment.

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
| `drift-command-args` | `--yes @drift-lock/cli` | Arguments placed before the `proof` subcommand. |
| `fail-on-unresolved` | `false` | Fail when unresolved contract drift remains. |
| `fail-on-violations` | `false` | Fail when current DriftLock violations remain. |

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
