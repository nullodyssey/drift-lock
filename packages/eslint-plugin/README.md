# @drift-core/eslint-plugin

ESLint 9 flat config plugin for DriftLock.

```js
import driftLock from '@drift-core/eslint-plugin';

export default [
  {
    plugins: { 'drift-lock': driftLock },
    rules: {
      ...driftLock.configs.recommended.rules,
    },
  },
];
```
