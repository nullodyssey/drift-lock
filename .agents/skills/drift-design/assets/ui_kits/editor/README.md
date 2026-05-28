# DriftLock — Editor UI kit

A VSCode-like overlay showing how DriftLock contracts surface inline in a TypeScript file. Sealed regions get a ledger margin and gutter stamp; drift regions get a red variant. Hover any contract identifier and a popover surfaces its source-of-truth, sealing history, and CTAs.

## Files

- `index.html` — entry
- `components.jsx` — `TitleBar`, `ActivityBar`, `Sidebar`, `Tabs`, `CodeLines`, `HoverCard`, `RightPanel`, `StatusBar`, plus a small Lucide-style icon set
- `app.jsx` — composes the workbench
- `styles.css` — editor chrome + token coloring

## Things this is not

- A real editor surface — there's no Monaco, no cursor, no edits. Static code rendered as styled rows.
- A real DriftLock product. The "Contracts / Manifest / Problems" right-panel is a reasonable shape but should be replaced by the real implementation when available.

## Caveats

We invented the file paths (`pricing.ts`, `checkout.ts`), the manifest schema, the lint rule name (`driftlock/no-silent-drift`), and the activity-bar icon for "contracts" — a Lock glyph. Replace as needed.
