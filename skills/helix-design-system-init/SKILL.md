---
name: helix-design-system-init
description: Use when .github/design-system-guide.md is missing, outdated, or needs regeneration from Figma rules and codebase analysis.
---

# Helix Design-System Init

## When to Use

- `.github/design-system-guide.md` does not exist.
- Existing guide is stale, incomplete, or explicitly requested to regenerate.
- Fit-finish or gen-code flow is blocked by missing design-system guide.

## Phase 0 — MCP Gate (BLOCKING)

MCP is **required**. Do NOT proceed to execution without a working Figma MCP connection.

Run `../helix/references/mcp-precheck.md` (config lives in `.mcp.json`, legacy `.vscode/mcp.json` accepted). Wait for the user to reload and confirm before continuing. Do NOT proceed until `mcp.*figma` tools are confirmed available.

> **No fallback mode.** Figma rules are essential for a useful design-system guide. Codebase-only analysis without Figma produces an incomplete guide that will need to be regenerated anyway. It is better to fix MCP now.

## Phase 1 — Execution

Use `../helix/references/design-system-rules-prompt.md` as orchestrator.

### 1.1 Fetch Figma design system rules

Load `../helix/references/design-system-figma-rules.md` for details.

Call `mcp_figma-desktop_create_design_system_rules` (or `mcp_figma_create_design_system_rules`) to fetch Figma design system rules. Capture the output.

### 1.2 Analyze the codebase

Load `../helix/references/design-system-codebase-analysis.md` for details.

Scan the codebase for:
- Design tokens (colors, typography, spacing, sizing)
- Component patterns and file conventions
- Accessibility patterns (labels, traits, screen reader support)
- Localization patterns (string formats, key conventions)
- Framework / platform detection

### 1.3 Synthesize the guide

Combine Figma rules (1.1) and codebase analysis (1.2) into a single `.github/design-system-guide.md` (or user-specified path) with the required structure:
- Quick Reference
- Token Mapping (Figma → Code)
- Code Examples
- Accessibility Guidelines
- Localization Patterns
- Best Practices

### 1.4 Summary

Report what was generated and flag sections that need human review.

## Reference Inputs

- Figma rules: `../helix/references/design-system-figma-rules.md`
- Codebase analysis: `../helix/references/design-system-codebase-analysis.md`
- Orchestrator: `../helix/references/design-system-rules-prompt.md`
- MCP precheck: `../helix/references/mcp-precheck.md`
