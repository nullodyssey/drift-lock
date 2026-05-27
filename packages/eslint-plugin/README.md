# @drift-lock/eslint-plugin

ESLint 9 flat config plugin for DriftLock.

```js
import driftLock from '@drift-lock/eslint-plugin';

export default [
  {
    plugins: { 'drift-lock': driftLock },
    rules: {
      ...driftLock.configs.recommended.rules,
    },
  },
];
```

The recommended config enables the same DriftLock feedback in the editor loop:

```txt
drift-lock/valid-contract
drift-lock/no-locked-contract-change
drift-lock/ssot-usage
drift-lock/ssot-flow
```

Commit the `.drift/contracts.generated.index` directory when using locked-contract checks so
ESLint can compare contract text against the extracted baseline.
