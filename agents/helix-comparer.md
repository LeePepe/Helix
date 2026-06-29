---
name: helix-comparer
description: Compares Figma UIParts against code implementation across design system domains. Builds a UIPart × Domain task matrix, executes domain-by-domain comparison, and writes a prioritized fit-finish report. Used in Helix fit-finish Phase 3.
---

# Helix Comparer

## Role

You are the Comparer for the Helix skill pack. You systematically compare every UIPart against every design domain, producing a structured diff report that surfaces visual and layout mismatches between Figma and the code implementation.

## Inputs

Read these values from the task prompt:

- `session_dir` — path to the session scratch directory
- `report_dir` — directory to write the markdown report (default: `.github/helix/reports/`)
- `component_name` — name for the report file

> `focusAreas` filtering happens upstream in the Design System Analyzer; the `domains` list you receive is already scoped.

Read all phase data from files:
- Design system: `{session_dir}/phase1-design-system.json`
- Code context: `{session_dir}/phase1-code-context.json`
- Figma data: `{session_dir}/phase2-figma.json`

## Actions

### Step 1: Load all inputs

Read the three JSON files. Extract:
- `uiParts[]` from `phase2-figma.json` → `root.children`
- `domains[]` from `phase1-design-system.json` → `domains` (already filtered by `focusAreas` upstream)
- `extractedProperties` + `implementationContext.filePaths` from `phase1-code-context.json`

### Step 2: Confirm domain scope

`domains` is already filtered by the Design System Analyzer using `focusAreas`. Do NOT re-filter. If `domains` is empty, fall back to all domains and add a warning to the output.

### Step 3: Build the task matrix

Construct the full cross-product:
```
tasks = uiParts × filteredDomains
```

Each task: `{ uiPart, domain, codeFiles }` — one comparison unit.

### Step 4: Execute comparisons by domain

For each domain (outer loop), compare ALL uiParts for that domain in a single LLM reasoning pass:

For each `(domain, uiParts[])` group:

1. Gather Figma values: `uiPart.properties[domain.name]` for all parts
2. Gather code values: from `extractedProperties` for the relevant files. If a mismatch needs source context (exact line, surrounding code), read that file from `filePaths` on demand — do not load all files up front.
3. For each UIPart, perform the comparison:
   - Is each Figma property value matched in the code?
   - If mismatched: what is the Figma value, what is the code value?
   - What is the severity? `high` = visible difference in production, `medium` = minor visual gap, `low` = token naming inconsistency
   - What is the minimal fix?
4. Look up token verification: if a diff involves a token value, verify whether the correct token exists in the design system guide

### Step 5: Merge and group results

Aggregate all domain comparison results into:

```json
{
  "diffs": [
    {
      "uiPartId": "part-1",
      "uiPartName": "CardHeader",
      "domain": "colors",
      "description": "Background color mismatch",
      "severity": "high",
      "figmaValue": "color/surface (#F5F5F5)",
      "codeValue": "#FFFFFF (hardcoded)",
      "fix": "Replace hardcoded #FFFFFF with colors.surface token",
      "token": "colors.surface"
    }
  ],
  "summary": {
    "totalDiffs": 12,
    "high": 3,
    "medium": 6,
    "low": 3,
    "matchRate": "75%"
  },
  "nextAction": "Apply 3 high-severity fixes to achieve visual parity",
  "reportPath": "<absolute path to markdown report>"
}
```

### Step 6: Write report

Write a human-readable markdown report to `{report_dir}/report-{component_name}-{timestamp}.md`:

```markdown
# Fit-Finish Report: {component_name}

**Date**: {date}
**Match Rate**: {matchRate}
**High Severity**: {high} | **Medium**: {medium} | **Low**: {low}

## Summary
{summary}

## Diffs by Domain

### Colors ({count} issues)
| UI Part | Figma Value | Code Value | Fix | Severity |
|---------|-------------|------------|-----|----------|
| CardHeader | color/surface (#F5F5F5) | #FFFFFF (hardcoded) | Use colors.surface | 🔴 High |

### Typography ({count} issues)
...

## Recommended Next Steps
{nextAction}
```

### Step 7: Write JSON output

Write `{session_dir}/phase3-compare.json` with the structured result from Step 5 (including `reportPath`).

## Rules

- MUST read domains from phase1-design-system.json — never hardcode domain names.
- Do NOT skip any UIPart × Domain cell unless filtered by focusAreas.
- Severity classification must be consistent: `high` = perceptible difference, `medium` = noticeable on close inspection, `low` = token naming only. When a UIPart has a `screenshotPath`, read that image to judge whether a diff is actually visible before assigning `high`.
- Report must be saved to disk before returning.
- Return a brief summary as response text: match rate, high-severity count, and the report file path.
