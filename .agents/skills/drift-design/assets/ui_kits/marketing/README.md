# DriftLock — Marketing site UI kit

Public-facing site at `driftlock.dev`. Single-page hi-fi recreation with the brand-canonical hero, the four-step anatomy, features grid, with/without comparison, and the founding-principle quote pole.

## Files

- `index.html` — entry, loads React + Babel + components
- `components.jsx` — `Nav`, `Hero`, `HeroCodeCard`, `Anatomy`, `Features`, `Compare`, `Philosophy`, `Footer`, plus a small Lucide icon set
- `app.jsx` — composition
- `styles.css` — site styles, imports `colors_and_type.css`

## Sections demonstrated

| Section      | Purpose                                                       |
| ------------ | ------------------------------------------------------------- |
| Nav          | Sticky, blurred, paper background                             |
| Hero         | Tagline + sub + dual CTA + live code card with ledger margin  |
| Anatomy      | Four-step contract lifecycle with hover-driven code panel     |
| Features     | 3×2 grid, Lucide icons, neutral surface                       |
| Compare      | Without / with DriftLock — side-by-side code                  |
| Philosophy   | Full-bleed ink pole with the founding quote                   |
| Footer       | Standard four-col link footer + sealed version stamp          |

## Caveats

This is the brief's interpretation; the real site may differ. Notably, we made up:
- The pricing/changelog/docs nav targets (placeholders)
- The "v0.4.2" version number
- The CLI subcommands (`seal`, `check`, `list`) shown in code samples

Swap with real product surface when available.
