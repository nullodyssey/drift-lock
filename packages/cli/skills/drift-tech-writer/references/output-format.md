# Docs Handoff Output

Use this shape by default:

```txt
Updated files:
- <path>

Verified claims:
- <claim> -> <source or check>

Ambiguous or future claims:
- <claim or "none">

Contract impact:
- <none / changed contracts / affected locked constraints>

Checks:
- <command and result>

Remaining doc risks:
- <risk or "none">
```

Keep the output factual. If a claim cannot be verified from implementation, tests, contracts, or command output, mark it as ambiguous or future instead of documenting it as current behavior.
