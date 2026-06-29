# Comparer (Fit/Finish) — sequential fallback

Use this only when the Agent tool is unavailable. The canonical spec is `agents/helix-comparer.md`; run it inline.

## Goal

Compare Figma UIParts against code across the **dynamic** domains from the Design System Analyzer, using a UIPart × Domain matrix. Produce a prioritized diff report.

## Inputs

From the session scratch dir:
- `phase1-design-system.json` → `domains[]` (already scoped by focusAreas upstream — do NOT re-filter)
- `phase1-code-context.json` → `extractedProperties` + `implementationContext.filePaths` (re-read source on demand)
- `phase2-figma.json` → `root.children[]` UIParts

## Steps

1. Build the cross-product `uiParts × domains`. Do not skip cells.
2. For each domain, compare all UIParts in one pass: Figma value vs code value, severity, minimal fix. Read a UIPart's `screenshotPath` when judging whether a diff is visible.
3. Merge diffs, compute severity counts and match rate.
4. Write the markdown report to the configured `report_dir`, with per-domain tables, file paths, and line numbers.
5. Write `phase3-compare.json`. Return match rate, high-severity count, report path.
