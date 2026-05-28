# DriftLock — CI Report UI kit

The PR-level drift report — what you see in your CI dashboard when DriftLock finds drift in a pull request. Paper-light theme to contrast the editor's ink-dark surface.

## Files

- `index.html` — entry
- `components.jsx` — `TopBar`, `PRHead`, `Summary`, `DriftList` / `DriftCard`, `SealedSummary`, `ReviewPanel`
- `app.jsx` — composes the page
- `styles.css` — paper theme + diff styling

## Surfaces demonstrated

| Surface          | Purpose                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| Top bar          | PR breadcrumbs, run actions, approve seal CTA                          |
| PR header        | Title + author + "cannot merge" drift stamp on the right               |
| Summary tiles    | Counts of sealed / drift / pending / scanned                           |
| Findings tabs    | Toggle between Issues (drift list) and Sealed (sealed contracts pill list) |
| Drift card       | File path · contract · invariant · diff with red/green hunks           |
| Review panel     | Re-seal / block merge / request review actions                         |

## Caveats

- The "claude-worker" agent and the PR scenario are illustrative.
- The diff format mimics GitHub's but is simplified — no actual word-level diff engine.
- The "Re-seal all" action is a UX placeholder; the real product may want a per-contract review flow.
