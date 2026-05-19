import { noLockedContractChangeRule } from './rules/no-locked-contract-change.js';
import { ssotUsageRule } from './rules/ssot-usage.js';
import { validContractRule } from './rules/valid-contract.js';

type DriftPlugin = {
  rules: {
    'valid-contract': typeof validContractRule;
    'ssot-usage': typeof ssotUsageRule;
    'no-locked-contract-change': typeof noLockedContractChangeRule;
  };
  configs: {
    recommended: {
      plugins: {
        drift: DriftPlugin;
      };
      rules: {
        'drift/valid-contract': 'error';
        'drift/ssot-usage': 'error';
        'drift/no-locked-contract-change': 'error';
      };
    };
  };
};

const plugin = {
  rules: {
    'valid-contract': validContractRule,
    'ssot-usage': ssotUsageRule,
    'no-locked-contract-change': noLockedContractChangeRule,
  },
  configs: {
    recommended: undefined as unknown as DriftPlugin['configs']['recommended'],
  },
} satisfies DriftPlugin;

plugin.configs.recommended = {
  plugins: {
    drift: plugin,
  },
  rules: {
    'drift/valid-contract': 'error',
    'drift/ssot-usage': 'error',
    'drift/no-locked-contract-change': 'error',
  },
};

export default plugin;
