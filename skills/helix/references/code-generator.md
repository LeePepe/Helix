# Code Generator — sequential fallback

Use only when the Agent tool is unavailable. Canonical spec: `agents/helix-code-generator.md`. Supports **BUILD** (new code) and **FIX** (apply diffs).

## Goal

Generate production-ready code from Figma using design-system tokens and project patterns, mapping by dynamic domain (never hardcoded).

## BUILD

1. Load plan, UIParts, and domains. Map each Figma value to a token; flag unmapped as `needsHardcode` with a `// TODO: add design token`.
2. Generate structure, layout, typography, colors, spacing, accessibility, localization, theming — complete runnable code, no stubs.
3. Write to `output_path` (or plan's `primaryPath`). Return path + token mapping summary.

## FIX

1. Take `phase3-compare.json` diffs (high/medium). Re-read only affected files from `filePaths` on demand (diffs carry line numbers).
2. Replace mismatching values with tokens; touch only relevant lines, no refactor. Write back to original paths. Summarize applied + skipped (low) diffs.
