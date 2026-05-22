/* @drift
version: 1
id: core.public-api
scope: file
stability: locked

intent: >
  Re-export the public DriftLock core API from a single stable package entrypoint.

llm:
  must_not_change:
    - Public core modules must remain reachable through the package root.
    - Types and executable helpers must stay exported together.
*/
export * from './types.js';
export * from './core/checker.js';
export * from './core/config.js';
export * from './core/context.js';
export * from './core/disable-directives.js';
export * from './core/contract-diff.js';
export * from './core/coverage.js';
export * from './core/errors.js';
export * from './core/explain.js';
export * from './core/extractor.js';
export * from './core/files.js';
export * from './core/git-scope.js';
export * from './core/hash.js';
export * from './core/index-file.js';
export * from './core/module-specifier.js';
export * from './core/ssot-flow.js';
export * from './core/validator.js';
