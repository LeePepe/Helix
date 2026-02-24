# Code Analyzer (Fit/Finish)

## Goal

Read implementation files and extract UI properties and design system token usage. Provide structured implementation context for the Comparer.

Reference: `src/agents/CodeAnalyzerAgent.ts`

## Inputs

- Code file path(s) — absolute or repo-relative
- User prompt (optional) — helps identify relevant files
- User references (optional) — IDE selection or file references

## Actions

1. **Resolve file paths**:
   - Read files explicitly mentioned in the user prompt or references.
   - May also read directly related files (e.g., a model file referenced by the main component) if they are clearly relevant.
   - Do NOT search the workspace broadly or follow imports into utility/helper implementations.

2. **Use design system guide to interpret tokens**:
   - Before looking at any additional files, check the design system guide (from Design System Analyzer output).
   - If the guide explains how a design system API works (e.g., `applyShadow(.extraLarge)`, `cornerRadiusModifier(...)`, `Typography.base`), interpret it from the guide alone — do NOT read the underlying implementation files.
   - Only read additional files if the design system guide does not cover the API or token in question.

3. **Extract visual properties**:
   - Colors, borders, radius, shadows, opacity
   - Background and foreground style references

4. **Extract layout properties**:
   - Width/height, padding/margins, spacing, alignment
   - Stack/layout container usage (VStack, HStack, ZStack, etc.)
   - Frame and constraint definitions

5. **Extract typography properties**:
   - Font family, size, weight, line height, letter spacing
   - Text style references

6. **Identify design system token usage vs hardcoded values**:
   - Token references: e.g., `Color.Theme.Foreground.Primary`, `Typography.heading1`, `Constants.Spacing2Rem`, `var(--color-primary)`, `var(--space-4)`
   - Hardcoded values: e.g., literal numbers `16`, hex colors `#FF0000`, string font names
   - Flag hardcoded values as potential mismatches for the Comparer.

## Output

The output feeds into the Comparer agent:

- `implementationContext`:
  - `files`: Record of file paths → file content (key: path string, value: source code string)

The Comparer uses the file content to perform per-domain comparison against Figma data. The Code Analyzer does NOT need to group by domain — that grouping is done by the Comparer using the dynamic domains from the Design System Analyzer.
