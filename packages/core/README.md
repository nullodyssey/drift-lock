# @drift-lock/core

Core parser, extractor, context renderer, diff engine, coverage reporter, and
deterministic checks for DriftLock.

This package exposes the runtime facade used by the DriftLock CLI and ESLint
plugin: contract extraction, index validation, context/task rendering,
contract diffs and acceptance files, coverage/explain output, and the
`ssot-usage` / `ssot-flow` rule helpers.

Most users should install `@drift-lock/cli` instead:

```bash
npx --yes @drift-lock/cli@latest install
```
