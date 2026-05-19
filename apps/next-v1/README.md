# Drift Next V1 Demo

Mini projet Next.js qui démontre la promesse V1 :

> Un agent IA peut modifier le code, mais il ne peut pas modifier ou contourner silencieusement le contrat local.

## Ce que la démo contient

- Une server action critique : `src/features/billing/actions.ts`
- Un contrat `@drift` locked, ancré à `createCheckoutSession`
- Deux sources de vérité déclarées :
  - `src/features/billing/pricing.ts`
  - `src/features/billing/billing.schema.ts`
- Un index commité : `.drift/contracts.generated.json`
- Une config ESLint qui active `eslint-plugin-drift`

## Commandes utiles

```bash
pnpm --filter next-v1 dev
pnpm --filter next-v1 drift:context
pnpm --filter next-v1 drift:check
pnpm --filter next-v1 lint
```

## Scénario de preuve

1. Ouvre `src/features/billing/actions.ts`.
2. Supprime l'import de `BILLING_PRICES`.
3. Remplace `price.priceId` par un prix local comme `'price_local_hotfix'`.
4. Lance :

```bash
pnpm --filter next-v1 drift:check
```

Résultat attendu : Drift échoue avec `DRIFT010_SSOT_NOT_USED`.

Pour prouver la protection des contrats locked, modifie ensuite `stability: locked` en `stability: draft`.

Résultat attendu : Drift échoue avec `DRIFT011_LOCKED_CONTRACT_CHANGED`.

