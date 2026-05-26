# DriftLock Config

DriftLock reads `.drift/config.json` from the project root.

```json
{
  "version": 1,
  "source": "src",
  "index": ".drift/contracts.generated.json",
  "requireContracts": [],
  "adoption": {
    "mode": "enforce"
  }
}
```

## Fields

- `version`: config schema version. Currently `1`.
- `source`: source directory, or list of source directories, scanned by commands when `--source` is not passed.
  Source discovery applies the project ignore file described below.
- `index`: committed contract index used by `extract`, `check`, `diff`, and `accept`.
- `requireContracts`: optional list of project-relative glob patterns for files that must contain at least one valid `@drift` contract.
- `adoption.mode`: optional mode for required-contract gaps: `audit`, `warn`, or `enforce`. Defaults to `enforce`.

The config is strict: unknown root fields and unknown `adoption` fields are
invalid instead of being silently ignored.

## Required Contracts

Use `requireContracts` to mark critical zones that should not stay undocumented.

```json
{
  "version": 1,
  "source": "src",
  "index": ".drift/contracts.generated.json",
  "requireContracts": [
    "src/features/**/actions.ts",
    "src/services/**/*.ts"
  ],
  "adoption": {
    "mode": "warn"
  }
}
```

For monorepos, use an array to scan several package source roots without also
including tests or fixtures:

```json
{
  "version": 1,
  "source": [
    "packages/core/src",
    "packages/cli/src",
    "packages/eslint-plugin/src"
  ],
  "index": ".drift/contracts.generated.json",
  "requireContracts": []
}
```

Supported pattern syntax:

- `*` matches within one path segment.
- `**` matches across path segments.
- paths are normalized as project-relative POSIX paths.

## Source Discovery Ignores

When DriftLock discovers files from `source`, it applies one project-root ignore
file:

- `.driftignore` when present.
- `.gitignore` otherwise.

`.driftignore` takes priority over `.gitignore`; the files are not merged. Use
`.driftignore` when DriftLock should scan a different set of source files than
Git tracks.

DriftLock always ignores internal state, build, and dependency directories even
if an ignore file tries to re-include them: `.git`, `.drift`, `.next`,
`dist`, and `node_modules`.

When a source file matches `requireContracts` but has no valid `@drift` contract,
`drift-lock check` reports `DRIFT015_REQUIRED_CONTRACT_MISSING`.

Adoption modes currently apply only to required-contract gaps:

- `audit`: print an informational diagnostic and exit successfully.
- `warn`: print a warning diagnostic and exit successfully.
- `enforce`: print an error and fail the check.

Other Drift violations, including invalid contracts, locked-contract changes and
executable invariant failures, remain blocking in every adoption mode. Override
the configured mode for one check with `drift-lock check --adoption-mode warn`.

`drift-lock coverage` reports how many required files are covered and lists the
required files that still have no contract. `coverage` is informational and exits
successfully unless contract extraction itself fails.

## Disable Directive Reporting

`coverage` also reports `drift-lock-disable` directives found in configured
source files. This is reporting-only: directives do not suppress Drift checks yet,
and malformed or expired directives do not change the exit code.

Supported strict formats:

```ts
// drift-lock-disable-next-line <rule> -- reason: <text>
// drift-lock-disable-file <rule> -- reason: <text>
// drift-lock-disable-next-line <rule> -- reason: <text>, expires: YYYY-MM-DD
```

`reason` and `rule` are required. `expires` is optional, but when present it
must use `YYYY-MM-DD`.
