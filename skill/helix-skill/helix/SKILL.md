---
name: helix
description: Use when handling Helix workflows and you need to route a request to fit-finish comparison, figma-to-code generation, or design-system guide initialization.
---

# Helix Skill

## Overview

This skill is a thin router. It does not run the full workflow directly.

## Intent Routing

Route to exactly one specialized skill:

- `helix-fit-finish`: user asks to compare Figma vs code, find mismatches, QA UI parity, or improve fit/finish.
- `helix-gen-code`: user asks to generate or implement production-ready code from Figma.
- `helix-design-system-init`: user asks to create or regenerate `.github/design-system-guide.md`, or the guide is missing.

If ambiguous between fit/finish and gen-code, ask one clarifying question.

## Delegation Rule

Once routed, invoke only the target skill and follow it end-to-end.

Do not keep duplicated workflow logic here.

## Shared Inputs

All delegated flows should confirm:

- Figma context source:
  - Figma Desktop selection (preferred)
  - Figma URL with node-id
- MCP availability precheck using `../helix/references/mcp-precheck.md`

For input format details, use `../helix/references/figma-input.md`.
