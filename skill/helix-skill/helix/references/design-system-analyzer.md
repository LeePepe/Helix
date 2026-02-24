# Design System Analyzer

## Goal

Load the project design system guide and **dynamically discover all design domains** with their tokens, component patterns, and framework information. Domains are NOT hardcoded — they are extracted from the guide content by the LLM.

Reference: `src/agents/DesignSystemAnalyzerAgent.ts`

## Inputs

- Design system guide path (default: `.github/design-system-guide.md`)
- Optional: `focusAreas` — comma-separated focus areas to filter results (e.g., "typography, colors, spacing")

## Actions

1. **Load the guide**: Verify `.github/design-system-guide.md` exists and read its content.

2. **Dynamic domain discovery** (LLM call):
   - Send the full guide content to the LLM with this instruction:
     > "Identify ALL design domains present in this documentation. Do NOT limit yourself to predefined domains — extract ALL domains you discover."
   - The LLM returns a JSON array of domain objects:

     ```json
     [
       {
         "name": "colors",
         "description": "Color palette and semantic color tokens",
         "tokens": { "primary": "#1A2B3C", "error": "#FF0000" }
       },
       {
         "name": "typography",
         "description": "Text styles for different content types",
         "tokens": { "heading1": { "size": "24px", "weight": "bold" } }
       }
     ]
     ```

   - Do NOT assume a fixed set of domains. Projects may have: colors, typography, spacing, layout, effects, iconography, motion, elevation, borders, or any custom domain.

3. **Detect framework/platform info** (LLM call):
   - Extract framework name, version, and UI toolkit from the guide content.
   - Example output: `{ name: "React", version: "18", ui: "Web" }`

4. **Extract component patterns** (LLM call):
   - Identify reusable UI patterns described in the guide.
   - Examples: button styles, card layouts, navigation patterns, form elements.

5. **Categorize domains** (LLM call):
   - Group discovered domains into logical categories.
   - Example: "Visual Styling" → [colors, effects, borders], "Text & Typography" → [typography, iconography]

6. **Apply focusAreas filter** (if provided):
   - Filter the domain list to only include domains matching the focusAreas.
   - Example: `focusAreas="typography, colors"` → keep only domains whose name contains "typography" or "colors".

## Missing Guide

If the guide is missing or incomplete, run Design System Init:

- Follow `references/design-system-rules-prompt.md`
- Generate `.github/design-system-guide.md`
- Then re-run this analyzer on the generated guide.

## Output

The output is consumed by downstream agents (Comparer, CodeGenerator, FigmaCollector):

- `domains[]` — Array of `{ name, description, tokens }` discovered from the guide
- `componentPatterns[]` — Reusable UI patterns
- `categorizedDomains` — Domains grouped by logical category
- `frameworkInfo` — `{ name, version, ui }`
- `designSystemPath` — Path to the guide file

**Critical**: The `domains[]` array defines the domain axis for the UIPart × Domain task matrix in Comparer and CodeGenerator. All downstream agents MUST use this dynamic list, never a hardcoded domain list.
