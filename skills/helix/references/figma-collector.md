# Figma Collector — sequential fallback

Use only when the Agent tool is unavailable. Canonical spec: `agents/helix-figma-collector.md`. See `figma-input.md` for input formats and `mcp-precheck.md` for the MCP gate.

## Goal

Fetch Figma data via MCP for each node and decompose it into a uniform `UIPart[]` for downstream phases.

## Steps

1. Parse and normalize node IDs (`123-456` → `123:456`); dedupe. Desktop selection needs no URL.
2. Per node, call `get_metadata`, `get_design_context`, `get_variable_defs`, and (optional) `get_screenshot`. Use `mcp__figma-desktop__*` or `mcp__figma__*`. Retry once on transient failure; continue on per-node error, abort only if all fail.
3. Decompose into UIParts (single / composite / variants) via LLM — never assume a flat 1:1 mapping.
4. For each UIPart, extract per-domain properties from the dynamic `domains` list.
5. Write `phase2-figma.json`: `root.children[]` with properties + `variableDefs` only. Do NOT inline the raw metadata/design-context blobs. Save screenshots to `{session_dir}/screenshots/{nodeId}.png` and record `screenshotPath`.
