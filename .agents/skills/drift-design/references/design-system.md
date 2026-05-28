# DriftLock Design System

> *DriftLock rend l'intention facile à préserver, et coûteuse à effacer silencieusement.*

This is the design system for **DriftLock** — a TypeScript tool that turns local business-rule intent into explicit, machine-verifiable contracts. It lets developers keep the velocity of vibe-coding with AI agents while adding a deterministic control layer (ESLint + CI) on the zones where silent drift would change product behavior.

---

## Sources

This design system is anchored to the real DriftLock codebase:

- **Repo:** [`nullodyssey/drift-lock`](https://github.com/nullodyssey/drift-lock) — pnpm TypeScript monorepo (`packages/cli`, `packages/core`, `packages/eslint-plugin`, `apps/next-v1` demo).
- **npm:** [`@drift-lock/cli`](https://www.npmjs.com/package/@drift-lock/cli) — install with `npx --yes @drift-lock/cli@latest install`.
- **Reference contract** in the UI kits is lifted from `apps/next-v1/src/features/billing/actions.ts` — the locked `billing.create-checkout-session` contract with a `drift/ssot-flow` invariant.
- **Diagnostic IDs** used in the editor and CI report (`DRIFT011_LOCKED_CONTRACT_CHANGED`, `DRIFT013_SSOT_FLOW_NOT_PROVEN`, `DRIFT015_REQUIRED_CONTRACT_MISSING`) are from the real check surface.

What's not in the repo and was therefore designed from scratch (and approved as on-brand):
- The wordmark, bracket-lock monogram, and wax-seal stamp glyphs in `../assets/brand/`.
- The dual-pole paper + ink palette, with `seal-500` (#C2410C) as the brand signal.
- The Geist / Geist Mono pairing (loaded from Google Fonts).
- The Lucide icon set as the chosen UI iconography.

---

## Brand thesis

DriftLock is a **guarantor**, not a guardrail. It's the wax seal on a contract — quiet, deterministic, slightly serious. The product should feel like:

- A **signet** that proves an intention is sealed and cannot drift unnoticed.
- A piece of **infrastructure** that respects the developer's flow but refuses to let critical rules erode.
- Calm, precise, technical. Closer to a notary than a referee.

Visual metaphors we lean into: wax seal, contract bracket, anchor / mooring, stamped page margin, code marginalia. Visual metaphors we avoid: shields, alarms, locks-as-padlocks, gears, AI-brain icons, generic gradients.

---

## Products represented

DriftLock is a developer tool. The repo ships a CLI (`@drift-lock/cli`), a core engine (`@drift-lock/core`), and an ESLint 9 flat-config plugin (`@drift-lock/eslint-plugin`). The three UI kits under `../assets/ui_kits/` recreate the three places a developer encounters DriftLock:

1. **`marketing/`** — the public-facing site (`driftlock.dev`): hero with a real `@drift` contract, the four-step lifecycle (declare → extract → context → check), feature grid, with/without comparison, and the founding-principle quote.
2. **`editor/`** — an editor overlay showing `apps/next-v1/src/features/billing/actions.ts` open: the `@drift` block comment rendered as a sealed contract region, a drifted `const price = { ... }` flagged with `DRIFT013_SSOT_FLOW_NOT_PROVEN`, plus the contracts/manifest/problems right panel.
3. **`ci_report/`** — the PR-level drift report: locked/drift/required-missing summary tiles, per-contract diff cards with real diagnostic IDs, and an `accept` / `block merge` action panel.

---

## Repository index

```
SKILL.md                   <- skill workflow and product-surface quick reference
references/design-system.md <- you are here
assets/colors_and_type.css <- CSS custom properties for color + type
assets/brand/              <- logos, icon marks, illustration primitives
assets/preview/            <- per-token preview cards
assets/ui_kits/
  marketing/               ← public site recreation
  editor/                  ← editor overlay recreation
  ci_report/               ← CI drift-report dashboard recreation
```

---

## Content fundamentals

### Voice

DriftLock writes like a **senior engineer who has thought carefully about the thing they're building** — precise, matter-of-fact, never marketing-loud. The real product copy is English-only and structural: short paragraphs, code-first examples, explicit lists of what's supported and what's not. No exclamation marks. No emoji. The voice **describes mechanisms**, it doesn't sell them.

### Tone dial

| Use less                            | Use more                                                  |
| ----------------------------------- | --------------------------------------------------------- |
| "Supercharge your AI workflow!"     | "Your intent, made executable."                           |
| "Stop AI from breaking your code"   | "Drift is silent. DriftLock makes it expensive."          |
| "Trusted by 10,000 developers"      | "Built for TypeScript codebases where rules matter."      |
| "We help teams ship faster"         | "DriftLock V1 catches supported forms of [list]."         |
| Exclamation marks                   | Periods.                                                  |
| Emoji                               | Em-dashes, code, marginalia.                              |

### Casing

- **Sentence case** for everything: nav, buttons, headings, card titles. (`Get started`, not `Get Started`.)
- The product name is always `DriftLock` — one word, two capitals, no space. In monospaced contexts it stays the same: `driftlock` is acceptable as a package name only.
- Code identifiers, file paths, env vars, ESLint rule IDs always in mono: `driftlock/no-silent-drift`.

### Person

- **"You"** for the developer reader. ("Your contract is broken in `pricing.ts:42`.")
- **"We"** sparingly, only when speaking as the team. ("We treat your contracts as source of truth.")
- **No "I"**, no founder voice in product surfaces.

### Emoji

- **Not used** in product surface, marketing, or CLI output.
- Acceptable only in informal channels (Twitter replies, Discord). Never decorate buttons, headings, or feature cards with emoji.

### Specific copy examples

- Hero: **"Lock the intent. Ship the vibe."**
- Sub: **"Turn local engineering intent into agent context, ESLint feedback, and CI checks — so AI-assisted TypeScript changes can't silently drift from critical sources of truth."**
- Empty state: *"No contracts in this file. `drift-lock install` to bootstrap, then add a `/* @drift */` block."*
- Error: *"`DRIFT013_SSOT_FLOW_NOT_PROVEN` — sink `return.priceId` does not derive from the `pricing` SSOT."*
- Success: *"3 locked · 0 drift. Build passed."*

The vibe is **understated competence**. If a sentence sounds like a pitch deck, rewrite it.

---

## Visual foundations

### Colors

A two-pole palette: **ink** (dark, dev-tool default) and **paper** (warm light). Both share a single brand signal — **seal**, a saturated amber that reads as a wax stamp on either pole.

| Token        | Hex       | Use                                                |
| ------------ | --------- | -------------------------------------------------- |
| `ink-950`    | `#0B0C0E` | Page background (dark)                             |
| `ink-900`    | `#121316` | Surface 1                                          |
| `ink-800`    | `#1B1D21` | Surface 2 / cards                                  |
| `ink-700`    | `#272A30` | Borders, dividers                                  |
| `ink-500`    | `#6B6F78` | Muted body, secondary fg                           |
| `ink-300`    | `#B7BAC1` | Tertiary fg                                        |
| `paper-50`   | `#F7F4ED` | Page background (light) — warm, slightly cream     |
| `paper-100`  | `#EFEBE0` | Surface 1 light                                    |
| `paper-200`  | `#E2DDCE` | Surface 2 light, dividers                          |
| `seal-500`   | `#C2410C` | Brand signal — used sparingly, like a stamp        |
| `seal-400`   | `#E0671F` | Hover state of signal                              |
| `seal-100`   | `#F5DBC0` | Tinted highlight / soft pill on paper              |
| `drift-500`  | `#B91C1C` | Drift / violation                                  |
| `sealed-500` | `#15803D` | Compliant / sealed-OK                              |
| `pending-500`| `#A16207` | Unsealed / warning                                 |

**Rule:** seal is precious. Use one seal element per view (the "stamp moment"). When everything is seal, nothing is sealed.

### Type

- **Display / UI:** Geist (variable, 300–700). Geometric sans, designed for dev tools. Tight tracking on display sizes, normal on body.
- **Mono:** Geist Mono (variable). For code, contract IDs, file paths, CLI output, metadata.
- **No serif.** A serif would push us toward "literary publication"; DriftLock is a tool, not a journal.

Scale (rem, 16px base):

| Token   | Size  | LH   | Weight | Tracking | Use                          |
| ------- | ----- | ---- | ------ | -------- | ---------------------------- |
| display | 4rem  | 1.05 | 600    | −0.03em  | Hero, big numbers            |
| h1      | 2.5rem| 1.1  | 600    | −0.025em | Page titles                  |
| h2      | 1.75rem| 1.2 | 600    | −0.02em  | Section titles               |
| h3      | 1.25rem| 1.3 | 600    | −0.01em  | Subsections                  |
| body    | 1rem  | 1.55 | 400    | 0        | Default reading              |
| body-sm | 0.875rem | 1.5 | 400  | 0        | Compact areas, table rows    |
| caption | 0.75rem | 1.4 | 500   | 0.04em   | Labels, metadata, eyebrows   |
| mono    | 0.9375rem | 1.55 | 450 | 0      | Code, inline IDs             |

Eyebrows / labels are **uppercase + tracked + small** (caption token). They feel like marginal stamps.

### Spacing

A 4px base scale: `0, 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 16=64, 20=80, 24=96`. Component padding usually pulls from `3 / 4 / 6`; section padding from `16 / 20 / 24`.

### Radii

- `xs` 2px — pills, inline tags
- `sm` 4px — inputs, small buttons
- `md` 6px — cards, panels (default)
- `lg` 10px — hero containers, modals
- Nothing larger. DriftLock is not pill-shaped.

### Borders & dividers

- Borders are **1px** and **subtle** — `ink-700` on dark, `paper-200` on light. They define structure, they don't decorate.
- A second, accent border style: **dashed** `1px ink-700` — used only on contract boundaries (the visual equivalent of "this region is sealed"). Don't use dashed borders for anything else.

### Shadows

Restrained. Two levels:

- `shadow-sm` — `0 1px 0 rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.05)` — cards on paper
- `shadow-md` — `0 4px 12px rgba(11,12,14,0.08), 0 1px 2px rgba(11,12,14,0.04)` — menus, hover-lifted cards
- On dark we mostly use **border + surface elevation** instead of shadow.

### Backgrounds

- **No gradient backgrounds.** The only gradient allowed is the **protection gradient** at the bottom of long-scrolling code blocks (a vertical fade from surface to transparent so text doesn't hard-cut).
- **No hero illustrations.** The hero is code, type, and a single seal stamp.
- **One recurring motif:** the *margin rule* — a thin vertical line in `ink-700` / `paper-200` at the left edge of code blocks and contract regions. This is the "ledger line" — it's the closest thing DriftLock has to a decorative element.
- Optional: a subtle **dot-grid** background on hero (8px grid, dots in `ink-800` at 60% opacity, dark only) to evoke the contract page.

### Animation

- **Eased and small.** `cubic-bezier(0.2, 0.7, 0.2, 1)` for everything UI-ish, `cubic-bezier(0.4, 0, 0.6, 1)` for state changes.
- Durations: **120ms** for hover, **180ms** for state change, **240ms** for panel/modal, **400ms** max for any choreographed sequence.
- **No bounce.** Bounce reads as playful — wrong tone.
- **One signature animation:** when a contract is sealed, the seal stamp does a subtle "press" — scale 1 → 0.95 → 1 over 220ms, no rotation. This is the only place we allow a non-linear motion.

### Hover / press / focus

- **Hover** on interactive elements: 1-step lift (lighter surface, or +1 underline weight for links). No color shift unless the element itself is colored.
- **Press**: scale `0.98` for buttons (120ms ease-in). No color flip on press.
- **Focus**: 2px outline in `seal-500` at 2px offset. Always visible. Never `outline: none`.

### Transparency & blur

Use sparingly. The only places allowed:

- Sticky nav on scroll: `rgba(ink-950, 0.7)` + `backdrop-filter: blur(12px)`
- Modal / dropdown backdrops: solid surface + 1px border, no glass.

Avoid frosted-glass everywhere else; it reads as Apple-marketing, not as deterministic infrastructure.

### Imagery

- DriftLock barely uses photography. When it does (team page, blog avatar): **warm, slightly desaturated, soft grain.** Think notary office, not WeWork. Greyscale or duotone (ink + seal) acceptable for portraits.
- **No 3D renders, no glassmorphism, no neon.**

### Cards

- 1px border, `md` radius, surface color (`ink-800` or `paper-100`), `shadow-sm` on paper only.
- Internal padding `5` (20px) at minimum, `6` (24px) for content-heavy.
- Card titles use `caption` eyebrow + `h3` heading + body copy below. The eyebrow is the marginal stamp.
- **No colored left-border accent cards** — that's a common AI-design trope and clashes with our margin-rule motif (which is full-card, not category-coded).

### Layout

- Marketing site: 1200px max content width, 80px gutter.
- App / editor: full-bleed with sidebar 280px + content fluid.
- Section vertical padding: 96px desktop, 64px mobile.
- The **ledger margin** (the thin vertical rule) sits at the left of major code regions, contract blocks, and the marketing hero — it's the single visual element that ties everything together.

---

## Iconography

- **Lucide Icons** is the chosen set — thin (1.5px) stroke, geometric, calm, available via CDN. We use it for all UI surface icons: navigation, buttons, file types, status badges.
- **Bring your own:** if you need a custom mark (e.g., the contract seal, the bracket-lock glyph), keep the same **1.5px stroke** and 24×24 viewbox so it sits next to Lucide icons without weight mismatch.
- **No icon fonts**, no Material Icons, no Font Awesome — keeping bundle small and crisp at all sizes.
- **Emoji as icons: never.**
- **Unicode glyphs as icons: only in CLI output**, where they substitute for an icon system we don't have on the terminal. Allowed CLI glyphs: `✓` (sealed), `✗` (drift), `⚠` (pending), `→` (continuation), `·` (separator). Outside the CLI, use a real Lucide icon.

Brand-specific marks live in `../assets/brand/`:
- `logo-mark.svg` — the bracket-seal monogram (the "lock" formed from two contract brackets)
- `logo-wordmark.svg` — wordmark variant
- `logo-lockup.svg` — mark + wordmark side-by-side
- `stamp-sealed.svg` — the wax-seal stamp used as the "success / sealed" indicator
- `stamp-drift.svg` — the broken-seal mark used as the "drift detected" indicator
- `margin-rule.svg` — a 1×N vertical line, used as background asset where CSS can't reach

⚠ **Substitution flag:** No fonts or icons were provided. We're using **Geist + Geist Mono** (Google Fonts) and **Lucide Icons** (CDN). Both are open-source and free for commercial use. If the team has a different official type or icon system, swap the imports in `../assets/colors_and_type.css` and the icon references in the UI kits.

---

## A note on what's missing

- **Real product screenshots / Figma.** No Figma was provided. UI kits are built from the repo source — accurate to the code, but the team's mental model of the product UI may differ. Flag anything that doesn't match.
- **Slide template.** No deck was provided; `slides/` was skipped intentionally.
- **Font files.** We load Geist + Geist Mono from Google Fonts. If the team wants self-hosted, drop the `.woff2` files into `../assets/fonts/` and replace the `@import` in `../assets/colors_and_type.css`.

---

**See `../SKILL.md`** for the repo-local Codex workflow for this design system.
