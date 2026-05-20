# eslint-plugin-drift-lock

ESLint 9 flat config plugin for DriftLock.

```js
import driftLock from 'eslint-plugin-drift-lock';

export default [
  {
    plugins: { 'drift-lock': driftLock },
    rules: {
      ...driftLock.configs.recommended.rules,
    },
  },
];
```
