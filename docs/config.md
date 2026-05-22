# DriftLock Config

DriftLock reads `.drift/config.json` from the project root.

```json
{
  "version": 1,
  "source": "src",
  "index": ".drift/contracts.generated.json",
  "requireContracts": []
}
```

## Fields

- `version`: config schema version. Currently `1`.
- `source`: source directory, or list of source directories, scanned by commands when `--source` is not passed.
- `index`: committed contract index used by `extract`, `check`, `diff`, and `accept`.
- `requireContracts`: optional list of project-relative glob patterns for files that must contain at least one valid `@drift` contract.

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
  ]
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

When a source file matches `requireContracts` but has no valid `@drift` contract,
`drift-lock check` reports `DRIFT015_REQUIRED_CONTRACT_MISSING`.

`drift-lock coverage` reports how many required files are covered and lists the
required files that still have no contract. `coverage` is informational and exits
successfully unless contract extraction itself fails.
