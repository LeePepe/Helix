---
name: helix-gen-code
description: Use when generating production-ready code from Figma with project design-system constraints and codebase conventions.
---

# Helix Gen-Code

## Inputs

Collect required inputs:

- Figma target:
  - Figma Desktop selection (preferred)
  - Figma URL with node-id

Collect optional inputs only when needed:

- Output file path
- Framework/platform hint

Use `../helix/references/figma-input.md` for Figma input details.

## Preconditions

Before code generation:

1. Verify MCP availability with `../helix/references/mcp-precheck.md`.
2. Check `.github/design-system-guide.md` (or user-specified path).
3. If guide is missing, run `helix-design-system-init` first.
4. If guide exists but appears incomplete, ask whether to regenerate.

## Execution Flow

1. Collect Figma context and variables.
2. Analyze design system guide and codebase patterns.
3. Map generated UI by design-system domains and tokens.
4. Generate production-ready code aligned with existing conventions.
5. Return code, suggested file path, and concrete next steps.

Use `../helix/references/gen-code.md` as orchestrator.

## Subagent Split

When subagents are available, split by role:

- Figma Context Collector: `../helix/references/figma-collector.md`
- Design System Analyzer: `../helix/references/design-system-analyzer.md`
- Code Generator: `../helix/references/code-generator.md`

If subagents are unavailable, run phases sequentially with the same boundaries.
