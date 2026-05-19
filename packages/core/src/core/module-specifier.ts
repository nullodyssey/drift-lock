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
