# Code Generator (Gen-Code)

## Goal

Generate production-ready code from Figma using design system tokens and project patterns.

Support both modes:

- BUILD: generate new code from Figma + design system
- FIX: apply corrections based on compare results + design system

## Inputs

- Figma context summary
- Design system summary
- Optional framework/platform hint
- Optional output path
- Optional compare result (for FIX mode)

## Domain-Based Workflow

Segment analysis by design system domains (colors, typography, spacing, layout, effects). For each domain, map Figma values to design system tokens first, then generate code using those tokens. Summarize domain decisions before final code output.

## Actions

1. Identify UI type and layout strategy from Figma context.
2. Map tokens by domain (colors, typography, spacing).
3. Generate structure and layout following design system patterns.
4. Add accessibility attributes and localization keys.
5. Ensure theme support via design system tokens.
6. Validate syntax and design system compliance.

If FIX mode:

1. Use compare results as the primary change list.
2. Apply minimal diffs to match Figma + design system.
3. Avoid unrelated changes.

## Output

- Complete code implementation
- Token mapping notes
- Suggested file path (if not provided)
