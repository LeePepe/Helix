---
name: helix-fit-finish
description: Use when comparing Figma design against implemented code to find mismatches, generate a fit-finish report, and propose concrete fixes.
---

# Helix Fit-Finish

## Inputs

Collect required inputs:

- Figma target:
  - Figma Desktop selection (preferred)
  - Figma URL with node-id
- Code file path (required): absolute or repo-relative

If code path is missing, ask for it before proceeding.

Use `../helix/references/figma-input.md` for Figma input details.

## Preconditions

Before comparison:

1. Verify MCP availability with `../helix/references/mcp-precheck.md`.
2. Locate design system guide using `../helix/scripts/find-design-system-guide.py`:
   - Script searches from current directory up to git root
   - Returns absolute path if found
   - User can also override with custom path
3. If guide is missing, run `helix-design-system-init` first.
4. If guide exists but appears incomplete, ask whether to regenerate.

## Execution Flow

1. Collect Figma context and variables.
2. Analyze design system guide and extract domain grouping.
3. Analyze target code implementation and extract UI properties.
4. Compare by design-system domains (colors, typography, spacing, layout, effects).
5. Produce a fit-finish report with prioritized issues and fix recommendations.
6. Ask whether to apply fixes now.

Use `../helix/references/fit-finish.md` as orchestrator.

## Subagent Split

When subagents are available, split by role:

- Figma Context Collector: `../helix/references/figma-collector.md`
- Design System Analyzer: `../helix/references/design-system-analyzer.md`
- Code Analyzer: `../helix/references/code-analyzer.md`
- Comparator: `../helix/references/comparer.md`

If subagents are unavailable, run phases sequentially with the same boundaries.
