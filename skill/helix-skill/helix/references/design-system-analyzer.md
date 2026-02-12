# Design System Analyzer

## Goal

Load and summarize the project design system guide for use in comparison and code generation.

## Inputs

- Design system guide path (default: `.github/design-system-guide.md`)

## Actions

1. Verify the guide exists and is readable.
2. Summarize key domains and token sets:
   - Colors
   - Typography
   - Spacing/Sizing
   - Layout
   - Effects
3. Extract framework/platform hints and code patterns.

## Missing Guide

If the guide is missing or incomplete, run Design System Init:

- Follow `references/design-system-rules-prompt.md`
- Generate `.github/design-system-guide.md`

## Output

- Domain summary
- Token naming patterns
- Framework/platform hints
