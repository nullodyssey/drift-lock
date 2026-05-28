# Drift Risk Matrix

Use the highest applicable risk.

```txt
LOW
- Uncontracted local implementation detail
- No SSOT or locked invariant touched
- Required proof is straightforward and local

MEDIUM
- Contracted file touched
- Only draft contracts affected
- Checks are straightforward
- PR proof is useful but not required for confidence

HIGH
- Locked contract file touched
- SSOT file touched
- drift/ssot-flow sinks may be affected
- Public return shape may change
- Required-contract coverage gap appears in a critical area

CRITICAL
- Auth, billing, permissions, pricing, security, or data integrity path
- Request requires changing a locked contract
- User asks to bypass an invariant
- Drift explain shows an accidental violation that the request does not address
```

Default recommendation:

```txt
LOW/MEDIUM -> $drift-dev can proceed with required checks
HIGH -> $drift-dev can proceed only with explicit constraints and full checks
CRITICAL -> ask for product/contract confirmation before implementation
```

When a Drift check is already failing, use `{{DRIFT_COMMAND}} explain` or
`{{DRIFT_COMMAND}} explain <contract-id>` before classifying the next fix.

For PR readiness, use `{{DRIFT_COMMAND}} proof --git-base <ref>`. Treat it as a report that can contain unresolved drift, not as a blocking check.
