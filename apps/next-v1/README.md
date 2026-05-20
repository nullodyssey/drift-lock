# DriftLock Next V1 Demo

Mini projet Next.js qui démontre la promesse V1 :

> Un agent IA peut modifier le code, mais il ne peut pas modifier ou contourner silencieusement le contrat local.

## Ce que la démo contient

- Une server action critique : `src/features/billing/actions.ts`
- Un contrat `@drift` locked, ancré à `createCheckoutSession`
- Deux sources de vérité déclarées :
  - `src/features/billing/pricing.ts`
  - `src/features/billing/billing.schema.ts`
- Un index commité : `.drift/contracts.generated.json`
- Une config ESLint qui active `@drift-core/eslint-plugin`

## Commandes utiles

```bash
pnpm --filter next-v1 dev
pnpm --filter next-v1 drift-lock:context
pnpm --filter next-v1 drift-lock:check
pnpm --filter next-v1 lint
```

## Scénario de preuve

1. Ouvre `src/features/billing/actions.ts`.
2. Garde l'import de `BILLING_PRICES`.
3. Remplace la ligne `const price = BILLING_PRICES[payload.plan];` par un objet local :

```ts
const price = {
  priceId: 'test',
  monthlyAmount: 10,
  currency: 'USD',
};
```

4. Lance :

```bash
pnpm --filter next-v1 drift-lock:check
```

Résultat attendu : DriftLock échoue avec `DRIFT013_SSOT_FLOW_NOT_PROVEN`.

La règle `drift/ssot-flow` vérifie que les sorties déclarées (`return.priceId`,
`return.amount`, `return.currency`) dérivent réellement de la SSOT `pricing`.
Contrairement à `drift/ssot-usage`, la simple présence de l'import ne suffit pas.

Pour prouver la protection des contrats locked, modifie ensuite `stability: locked` en `stability: draft`.

Résultat attendu : DriftLock échoue avec `DRIFT011_LOCKED_CONTRACT_CHANGED`.
