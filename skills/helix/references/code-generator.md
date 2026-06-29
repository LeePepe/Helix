# Code Generator (Gen-Code)

## Goal

Generate production-ready code from Figma using design system tokens and project patterns.

Reference: `src/agents/CodeGeneratorAgent.ts`

Support both modes:

- **BUILD**: generate new code from Figma + design system
- **FIX**: apply corrections based on compare results + design system

## Inputs

- `figmaAnalysis` — UIParts from Figma Collector (with structure decomposition)
- `designSystem` — dynamic domains and tokens from Design System Analyzer
- `plan` (optional) — implementation plan from Planner
- `focusAreas` (optional) — comma-separated focus areas to prioritize
- `compareResult` (optional, FIX mode) — diffs from Comparer
- `existingCode` (optional, FIX mode) — current file paths and content
- Optional framework/platform hint
- Optional output path

## Domain-Based Workflow

Segment analysis by **dynamic** design system domains (discovered from the guide, NOT hardcoded). For each domain:

1. Map Figma values to design system tokens
2. Generate code using those tokens
3. Summarize domain decisions before final output

## Actions (BUILD mode)

1. Identify UI type and layout strategy from Figma context (UIParts).
2. Map tokens by domain — for each dynamic domain from `designSystem.domains[]`:
   - Resolve Figma style/variable references to design system token names
   - Verify token exists in the guide
   - Flag any Figma values without matching tokens
3. Generate structure and layout following design system patterns.
4. Add accessibility attributes and localization keys.
5. Ensure theme support via design system tokens.
6. Validate syntax and design system compliance.

## Actions (FIX mode)

1. Use `compareResult.diffs[]` as the primary change list.
2. Apply minimal diffs to match Figma + design system.
3. Read existing code from `existingCode` file paths.
4. Avoid unrelated changes.

## Output

- Complete code implementation
- Token mapping notes (per-domain decisions)
- Suggested file path (if not provided)
