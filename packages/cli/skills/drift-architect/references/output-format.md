# Architecture Direction Output

Use this shape by default:

```txt
Current boundaries:
- <boundary and source>

Proposed constraints:
- <constraint and reason>

Contract candidates:
- <contract or policy to add/update>

Migration path:
- <smallest safe sequence>

Required checks:
- <command>

Open risks:
- <risk or "none identified">

Recommended next role:
- <$drift-dev / $drift-analyst / clarification>
```

Keep the direction focused on boundaries that affect safety. If a boundary is important but unprotected, say that coverage is missing instead of calling it safe.
