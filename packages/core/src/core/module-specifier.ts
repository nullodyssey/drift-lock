/* @drift
version: 1
id: core.module-specifier
scope: file
stability: locked

intent: >
  Generate equivalent TypeScript and NodeNext module specifier candidates for
  Drift SSOT usage and changed-file matching.

llm:
  must_not_change:
    - Extensionless candidates must be included.
    - TypeScript and emitted JavaScript extensions must map both directions.
    - Candidate order must remain deterministic.
*/
export function moduleSpecifierCandidates(modulePath: string): string[] {
  const candidates = new Set([modulePath]);
  const extensionless = modulePath.replace(/\.(tsx|ts|jsx|js)$/, '');
  candidates.add(extensionless);

  if (modulePath.endsWith('.ts')) candidates.add(`${extensionless}.js`);
  if (modulePath.endsWith('.tsx')) candidates.add(`${extensionless}.jsx`);
  if (modulePath.endsWith('.js')) candidates.add(`${extensionless}.ts`);
  if (modulePath.endsWith('.jsx')) candidates.add(`${extensionless}.tsx`);

  return [...candidates];
}
