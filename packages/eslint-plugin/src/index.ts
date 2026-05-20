import { noLockedContractChangeRule } from './rules/no-locked-contract-change.js';
import { ssotFlowRule } from './rules/ssot-flow.js';
import { ssotUsageRule } from './rules/ssot-usage.js';
import { validContractRule } from './rules/valid-contract.js';

type DriftPlugin = {
  rules: {
    'valid-contract': typeof validContractRule;
    'ssot-usage': typeof ssotUsageRule;
    'ssot-flow': typeof ssotFlowRule;
    'no-locked-contract-change': typeof noLockedContractChangeRule;
  };
  configs: {
    recommended: {
      plugins: {
        'drift-lock': DriftPlugin;
      };
      rules: {
        'drift-lock/valid-contract': 'error';
        'drift-lock/ssot-usage': 'error';
        'drift-lock/ssot-flow': 'error';
        'drift-lock/no-locked-contract-change': 'error';
      };
    };
  };
};

const plugin = {
  rules: {
    'valid-contract': validContractRule,
    'ssot-usage': ssotUsageRule,
    'ssot-flow': ssotFlowRule,
    'no-locked-contract-change': noLockedContractChangeRule,
  },
  configs: {
    recommended: undefined as unknown as DriftPlugin['configs']['recommended'],
  },
} satisfies DriftPlugin;

plugin.configs.recommended = {
  plugins: {
    'drift-lock': plugin,
  },
  rules: {
    'drift-lock/valid-contract': 'error',
    'drift-lock/ssot-usage': 'error',
    'drift-lock/ssot-flow': 'error',
    'drift-lock/no-locked-contract-change': 'error',
  },
};

export default plugin;
