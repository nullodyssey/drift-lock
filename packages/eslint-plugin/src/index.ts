import { noLockedContractChangeRule } from './rules/no-locked-contract-change.js';
import { ssotFlowRule } from './rules/ssot-flow.js';
import { ssotUsageRule } from './rules/ssot-usage.js';
import { validContractRule } from './rules/valid-contract.js';

/* @drift
version: 1
id: eslint.surface
scope: file
stability: locked

intent: >
  Publish the DriftLock ESLint plugin rule map and recommended flat-config
  preset under the drift-lock namespace.

llm:
  must_not_change:
    - The recommended preset must enable every exported rule as an error.
    - Rule names must stay stable for downstream ESLint configs.
    - The plugin object must reference itself in the recommended config.
*/
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
