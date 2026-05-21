# Impact Report Output

Use this shape:

```txt
Impact:
- <contract or file affected>

Risk:
- <LOW|MEDIUM|HIGH|CRITICAL> because <reason>

Likely drift modes:
- <DRIFTxxx or none>

Required proof:
- <check command or test>

Explain diagnostics:
- <explain command or "not needed">

Recommendation:
- <proceed / clarify / change contract intentionally>
```

Keep the report grounded in contracts and checks. Do not invent unimplemented enforcement.
