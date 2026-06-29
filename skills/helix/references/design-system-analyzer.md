# Design System Analyzer — sequential fallback

Use only when the Agent tool is unavailable. Canonical spec: `agents/helix-design-system-analyzer.md`.

## Goal

Load `.github/design-system-guide.md` and dynamically discover design domains, tokens, component patterns, and framework info. Never hardcode the domain list.

## Steps

1. Read the guide (search upward to git root). If missing, write `{ "error": "design-system-guide not found" }` and stop.
2. Discover every domain with tokens/specs in the guide; for each capture `name`, `description`, `tokens`.
3. Detect framework/platform and up to 10 component patterns.
4. Apply `focusAreas` filter here (single source of truth). If none match, keep all + add `focusAreasWarning`.
5. Write `phase1-design-system.json` with `domains[]`, `componentPatterns`, `frameworkInfo`.
