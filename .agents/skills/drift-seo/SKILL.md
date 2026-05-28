---
name: drift-seo
description: Create DriftLock search, SEO, GEO, AEO, and LLM-answer-visibility content. Use when Codex needs DriftLock marketing pages, docs landing copy, blog outlines, SEO briefs, title/meta descriptions, FAQ blocks, JSON-LD suggestions, comparison pages, launch content, keyword maps, internal-link plans, or AI-citation-ready copy using DriftLock product language, vibe-coding terms, people-first SEO, keyword intent, E-E-A-T, and topical authority practices.
---

# Drift SEO

Use this repo-local skill to create people-first, search-ready DriftLock content
without watering down the product into generic AI tooling copy. Start with
usefulness for technical buyers and developers, then make the content easy for
search systems and answer engines to understand.

## Workflow

1. Inspect the target surface before writing:
   - existing page, doc, route, or brief when provided;
   - `README.md`, `docs/drift-proof-commercial-direction.md`, and
     `$drift-design` when product positioning or voice is needed.
2. Read `references/seo-playbook.md` for keyword maps, intent filters,
   E-E-A-T cues, topical authority rules, content patterns, and forbidden
   claims.
3. Define the query intent:
   - commercial investigation for comparison, proof, pricing, adoption, or ROI;
   - developer education for contracts, SSOT, ESLint, CI, or agent workflows;
   - AI-era SEO/GEO education for vibe-coding, AI code review gaps, and intent
     preservation.
4. Produce content that is useful, directly answerable, and quotable:
   - open with a clear answer or concrete promise;
   - use precise headings, short paragraphs, and explicit definitions;
   - show DriftLock's first-hand product evidence and mechanism;
   - include DriftLock entities, package names, CLI commands, and diagnostics
     only when they are relevant;
   - add FAQ, title/meta, Open Graph, and JSON-LD guidance when useful.
5. Check the output against DriftLock voice:
   - calm, technical, specific;
   - no fake customer claims, no exaggerated security language, no loud hype;
   - use "vibe-coding" as a discoverable market term, not as the whole brand.

## Canonical Positioning

Default to these product truths:

```txt
DriftLock turns local engineering intent into agent context, ESLint feedback,
and CI checks so AI-assisted TypeScript changes cannot silently drift away from
critical sources of truth.
```

Use these commercial framings when appropriate:

```txt
AI intent preservation for fast-moving codebases.
Proof that AI-assisted changes preserved declared product and engineering intent.
Lock the intent. Ship the vibe.
```

Prefer these entities and phrases:

```txt
DriftLock
@drift contracts
intent preservation
AI-assisted TypeScript
vibe-coding
agent context
silent drift
source of truth
SSOT
ESLint feedback
CI proof
Pull Request Proof Report
Intent Preservation Rate
protected contracts
drift-lock check
drift-lock proof
```

## Output Requirements

- Default to English unless the user asks for another language.
- Keep product terms exact: `DriftLock`, `@drift`, `drift-lock`,
  `@drift-lock/cli`, `@drift-lock/eslint-plugin`.
- For SEO metadata, provide at least one title under 60 characters and one meta
  description under 155 characters when practical.
- For GEO/AEO content, include direct-answer snippets, entity-rich headings, and
  FAQ candidates that can stand alone in an AI-generated answer.
- For strategic briefs, include intent, business potential, topical cluster,
  evidence angle, and internal-link targets.
- For implementation-facing output, mention likely files or frameworks only
  after inspecting the actual app.

## Guardrails

```txt
- Do not claim DriftLock replaces tests, code review, SAST, or AI reviewers.
- Do not claim guaranteed rankings, guaranteed LLM citations, or universal AI safety.
- Do not describe contracts as runtime security controls.
- Do not keyword-stuff "AI", "vibe-coding", "GEO", or "LLM".
- Do not invent customers, install counts, benchmarks, funding, or integrations.
- Do not change canonical CLI commands or package names for SEO convenience.
```

If a request needs visual marketing layout or brand tokens, use `$drift-design`
with this skill.
