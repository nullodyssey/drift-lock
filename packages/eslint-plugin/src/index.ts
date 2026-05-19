import { noLockedContractChangeRule } from './rules/no-locked-contract-change.js';
import { ssotUsageRule } from './rules/ssot-usage.js';
import { validContractRule } from './rules/valid-contract.js';

const plugin = {
  rules: {
    'valid-contract': validContractRule,
    'ssot-usage': ssotUsageRule,
    'no-locked-contract-change': noLockedContractChangeRule,
  },
  configs: {},
};

Object.assign(plugin.configs, {
  recommended: {
    plugins: {
      drift: plugin,
    },
    rules: {
      'drift/valid-contract': 'error',
      'drift/ssot-usage': 'error',
      'drift/no-locked-contract-change': 'error',
    },
  },
});

export default plugin;
