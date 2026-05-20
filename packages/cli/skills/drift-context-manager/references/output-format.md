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
- @analyst for impact analysis, or @dev for implementation

Required checks:
- <command>
```

Keep the output short. Do not rewrite the full contract unless the user asks.
