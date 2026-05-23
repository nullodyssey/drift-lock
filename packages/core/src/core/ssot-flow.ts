/* @drift
version: 1
id: core.ssot-flow
scope: file
stability: locked

intent: >
  Preserve the public SSOT flow rule entrypoint while the implementation lives
  in the modular rules/ssot-flow engine.

ssot:
  rule: "./rules/ssot-flow/index.ts"

invariants:
  - id: public-entrypoint-delegates-to-rule
    enforce: drift/ssot-usage
    ssot: rule

llm:
  must_not_change:
    - checkSsotFlow must remain reachable from the package root.
    - This shim must not contain separate rule behavior that can drift from the engine.
*/
export { checkSsotFlow, type CheckSsotFlowOptions } from './rules/ssot-flow/index.js';
