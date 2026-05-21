# Drift Risk Matrix

Use the highest applicable risk.

```txt
LOW
- Uncontracted local implementation detail
- No SSOT or locked invariant touched

MEDIUM
- Contracted file touched
- Only draft contracts affected
- Checks are straightforward

HIGH
- Locked contract file touched
- SSOT file touched
- drift/ssot-flow sinks may be affected
- Public return shape may change

CRITICAL
- Auth, billing, permissions, pricing, security, or data integrity path
- Request requires changing a locked contract
- User asks to bypass an invariant
```

Default recommendation:

```txt
LOW/MEDIUM -> @dev can proceed with required checks
HIGH -> @dev can proceed only with explicit constraints and full checks
CRITICAL -> ask for product/contract confirmation before implementation
```

When a Drift check is already failing, use `{{DRIFT_COMMAND}} explain` or
`{{DRIFT_COMMAND}} explain <contract-id>` before classifying the next fix.
