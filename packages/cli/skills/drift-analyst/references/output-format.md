# Impact Report Output

Use this shape:

```txt
Impact:
- <contract or file affected>

Risk:
- <LOW|MEDIUM|HIGH|CRITICAL> because <reason>

Likely drift modes:
- <locked-contract-change | ssot-flow-not-proven | missing-required-contract | unsupported-pattern | unverified-guarantee | none>

Contract diff:
- <summary command or "not needed">

Required proof:
- <check command or test>

PR proof:
- <proof command or "not needed">

Explain diagnostics:
- <explain command or "not needed">

Recommendation:
- <proceed with $drift-dev / clarify product intent / accept intentional contract change>
```

Keep the report grounded in contracts and checks. Do not invent unimplemented enforcement. If proof is missing, report the gap explicitly.
