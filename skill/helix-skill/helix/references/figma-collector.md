# Figma Collector

## Goal

Fetch Figma design context, variables, and (optional) screenshots for downstream analysis.

## Inputs

- Figma Desktop selection, or
- Full Figma URL with node-id

See `references/figma-input.md` for input formats.

## Precheck

Before fetching, validate MCP availability. If Desktop MCP is not connected, show setup steps and allow the user to retry.

## Actions

1. Get design context using MCP:
   - `mcp_figma-desktop_get_design_context` or `mcp_figma_get_design_context`
   - Accept full URLs; MCP will extract node-id when provided.
2. Extract:
   - Component name/type
   - Layer hierarchy
   - Auto-layout configuration
   - Variant/state info
3. Fetch variable definitions:
   - `mcp_figma-desktop_get_variable_defs` or `mcp_figma_get_variable_defs`
4. Fetch metadata when available:
   - `mcp_figma-desktop_get_metadata`
5. Optional screenshot:
   - `mcp_figma-desktop_get_screenshot` or `mcp_figma_get_screenshots`
6. If multiple Figma URLs are provided, collect each and combine results.
7. Normalize node IDs (convert `123-456` or `123_456` to `123:456`) before calls.
8. Retry once on transient MCP failures.

## Output

- Normalized Figma context summary
- Variables list (colors, typography, spacing, etc.)
- Metadata summary (structure overview)
- Optional screenshot reference
