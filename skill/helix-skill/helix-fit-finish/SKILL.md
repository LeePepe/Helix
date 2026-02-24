---
name: helix-fit-finish
description: Use when comparing Figma design against implemented code to find mismatches, generate a fit-finish report, and propose concrete fixes.
---

# Helix Fit-Finish

## Inputs

Collect required inputs:

- Figma target (one or more):
  - Figma Desktop selection (preferred)
  - Figma URL(s) with node-id
- Code file path (required): absolute or repo-relative

If code path is missing, ask for it before proceeding.

Use `../helix/references/figma-input.md` for Figma input details.

## Preconditions

Before comparison:

1. Verify MCP availability with `../helix/references/mcp-precheck.md`.
2. Locate `.github/design-system-guide.md` by searching from the current directory up to the git root.
   - User can also override with a custom path.
3. If guide is missing, run `helix-design-system-init` first.
4. If guide exists but appears incomplete, ask whether to regenerate.

## Execution

Follow `../helix/references/fit-finish.md` for the full 4-phase pipeline.

Phase dependency order:

- **Phase 1 (parallel)**: Design System Analyzer + Code Analyzer — no dependencies between them
- **Phase 2**: Figma Collector — depends on Phase 1 Design System Analyzer
- **Phase 3**: Comparer — depends on ALL of Phase 1 + Phase 2
- **Phase 4 (optional)**: Code Generator (FIX mode) — only if user wants auto-fix

## Critical Rules

- Phase 1 agents MUST run in parallel.
- Domains are NEVER hardcoded — always from Design System Analyzer.
- Figma Collector MUST call real MCP tools, not return placeholders.
- Comparer MUST wait for all upstream phases.
- If parallel subflows cannot be created, stop and report the blocker.
- Final report must be grouped by dynamic domains with prioritized fixes.
- After report delivery, ask whether to apply fixes now.
