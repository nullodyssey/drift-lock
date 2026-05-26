# drift-lock

CLI and interactive installer for DriftLock.

## Quick install

DriftLock requires Node.js 22 or newer.

```bash
# npm
npx --yes @drift-lock/cli@latest install

# pnpm
pnpm dlx @drift-lock/cli@latest install

# bun
bunx @drift-lock/cli@latest install

# yarn
yarn dlx -p @drift-lock/cli@latest drift-lock install
```

The installer creates `.drift`, installs DriftLock as a dev dependency, adds
package scripts, and can configure ESLint, GitHub Actions, and bundled agent
skills.

## Local commands

After install, run the local CLI through your package manager:

```bash
npm exec drift-lock -- check
pnpm exec drift-lock check
bunx drift-lock check
yarn drift-lock check
```

Common commands:

```bash
drift-lock context --task "<user prompt>"
drift-lock context <file>
drift-lock extract
drift-lock check
drift-lock check --changed
drift-lock check --changed --git-base origin/main
drift-lock check --adoption-mode warn
drift-lock coverage
drift-lock coverage --json
drift-lock diff --summary
drift-lock diff --summary --json
drift-lock explain [contract-id]
drift-lock accept <contract-id> --reason "<reason>"
drift-lock skills list
drift-lock skills install --provider openai
```

`context` gives agents contract-aware context before they plan or edit.
`extract` writes the committed contract index. `check` validates contracts and
invariants locally or in CI. `coverage` shows adoption and missing required
contracts. `diff --summary` reviews contract changes in PRs. `explain` prints
actionable diagnostics after a failed check. `accept` records intentional locked
contract changes. `skills list` and `skills install` manage bundled agent
skills.

Useful install options:

```bash
npx --yes @drift-lock/cli@latest install --source src
npx --yes @drift-lock/cli@latest install --agent openai
npx --yes @drift-lock/cli@latest install --ci github
npx --yes @drift-lock/cli@latest install --example next-billing
npx --yes @drift-lock/cli@latest install --no-eslint --no-ci
npx --yes @drift-lock/cli@latest install --dry-run
```

When installing skills in a repository that exposes DriftLock through a custom
script, pass the command explicitly:

```bash
drift-lock skills install --provider openai --drift-command "pnpm exec drift-lock"
```
