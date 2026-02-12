# Comparer (Fit/Finish)

## Goal

Compare Figma design specs with code implementation by design system domain and produce a report.

## Inputs

- Figma context summary
- Design system summary
- Code analysis summary

## Domain-Based Comparison

Segment comparison by design system domains (colors, typography, spacing, layout, effects). Compare each domain independently, report per-domain differences, then produce a combined summary.

## Token Verification Workflow

1. Identify Figma style or variable name.
2. Extract leaf token name.
3. Look up in design system guide.
4. Verify correct token usage in code.

## Output

- Differences list with Figma vs code values
- Per-domain summary
- Combined summary
- Optional auto-fix recommendations

## Report

Save a markdown report under `reports/report-[component-name]-[timestamp].md` with match rate, differences, and fixes.

Include severity breakdown (high/medium/low) and recommended actions. Honor the configured reports path when provided by the environment (e.g., `helix.reportsPath`).
