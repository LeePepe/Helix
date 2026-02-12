# Code Analyzer (Fit/Finish)

## Goal

Read the implementation file and extract UI properties and design system token usage.

## Inputs

- Code file path (absolute or repo-relative)
- Design system guide content

## Actions

1. Read the target file.
2. Extract visual properties:
   - Colors, borders, radius, shadows, opacity
3. Extract layout properties:
   - Width/height, padding/margins, spacing, alignment
4. Extract typography properties:
   - Font family/size/weight/line height/letter spacing
5. Identify design system token usage vs hardcoded values.

## Output

- Parsed UI property summary
- Token usage summary
