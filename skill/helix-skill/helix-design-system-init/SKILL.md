---
name: helix-design-system-init
description: Use when .github/design-system-guide.md is missing, outdated, or needs regeneration from Figma rules and codebase analysis.
---

# Helix Design-System Init

## When to Use

- `.github/design-system-guide.md` does not exist.
- Existing guide is stale, incomplete, or explicitly requested to regenerate.
- Fit-finish or gen-code flow is blocked by missing design-system guide.

## Preconditions

1. Verify MCP availability with `../helix/references/mcp-precheck.md`.
2. Confirm target guide path (default `.github/design-system-guide.md`).

## Execution

Use `../helix/references/design-system-rules-prompt.md` as orchestrator.

1. Call `mcp__figma-desktop__create_design_system_rules` to fetch Figma design system rules.
2. Analyze the codebase for tokens, component patterns, accessibility, and localization.
3. Synthesize both inputs into a complete design system guide.
4. Write the guide to `.github/design-system-guide.md` (or user-specified path).
5. Summarize what was generated and where follow-up review is needed.

## Reference Inputs

- Figma rules source: `../helix/references/design-system-figma-rules.md`
- Codebase analysis source: `../helix/references/design-system-codebase-analysis.md`
