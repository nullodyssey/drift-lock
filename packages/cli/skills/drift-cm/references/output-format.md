# Task Context Output

Use this shape by default:

```txt
Task:
- <one sentence summary>

Relevant contracts:
- <id> (<file>, <stability>)

SSOT:
- <key>: <path>

Locked constraints:
- <constraint>

Potential conflicts:
- <conflict or "none found">

Recommended next role:
- $drift-analyst for impact analysis, or $drift-dev for implementation

Required proof:
- <command>

Required checks:
- <check command or project test>

Explain diagnostics:
- <command or "not needed">

PR proof:
- <proof command or "not needed">
```

Keep the output short. Do not rewrite the full contract unless the user asks. If a critical file has no contract, say that coverage is missing instead of calling the change safe.
