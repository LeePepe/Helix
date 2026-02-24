---
name: helix-gen-code
description: Use when generating production-ready code from Figma with project design-system constraints and codebase conventions.
---

# Helix Gen-Code

## Inputs

Collect required inputs:

- Figma target (one or more):
  - Figma Desktop selection (preferred)
  - Figma URL(s) with node-id

Collect optional inputs only when needed:

- Output file path
- Framework/platform hint
- focusAreas (comma-separated design aspects to prioritize)

Use `../helix/references/figma-input.md` for Figma input details.

## Preconditions

Before code generation:

1. Verify MCP availability with `../helix/references/mcp-precheck.md`.
2. Check `.github/design-system-guide.md` (or user-specified path).
3. If guide is missing, run `helix-design-system-init` first.
4. If guide exists but appears incomplete, ask whether to regenerate.

## Execution

Follow `../helix/references/gen-code.md` for the full 4-phase pipeline.

Phase dependency order:

- **Phase 1**: Design System Analyzer — must complete before Phase 2
- **Phase 2**: Figma Collector — depends on Phase 1
- **Phase 3**: Planner — depends on Phase 1 + Phase 2
- **Phase 4**: Code Generator (BUILD mode) — depends on Phase 3

## Critical Rules

- Domains are NEVER hardcoded — always from Design System Analyzer.
- Figma Collector MUST call real MCP tools, not return placeholders.
- Segment work by design system domains and report per-domain decisions.
- If subagents are unavailable, run phases sequentially with the same boundaries.
