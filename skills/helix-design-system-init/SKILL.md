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

MCP is **required**. Do NOT proceed to execution without a working Figma MCP connection. Follow these steps in exact order:

### 0.1 Check `.vscode/mcp.json`

Read `.vscode/mcp.json` in the project root.

- **File exists** → go to 0.2.
- **File missing** → go to 0.3 (create it).

### 0.2 Verify Figma MCP tools are loaded

Search for available tools matching `mcp.*figma`. Two possible prefixes:
- `mcp_figma-desktop_*` (Desktop local server)
- `mcp_figma_*` (Remote MCP)

- **Tools found** → MCP gate passes. Skip to **Phase 1**.
- **Tools NOT found** → the config file exists but the server is unreachable. Go to 0.4.

### 0.3 Create `.vscode/mcp.json`

Ask the user which mode they prefer (default: Desktop):

**Option A — Figma Desktop (recommended, selection-based):**

```json
{
  "servers": {
    "figma-desktop": {
      "type": "http",
      "url": "http://127.0.0.1:3845/mcp"
    }
  }
}
```

**Option B — Remote MCP (URL-based, no Desktop app needed):**

```json
{
  "servers": {
    "figma": {
      "type": "http",
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
```

Create the file with the chosen config. If `.vscode/mcp.json` already exists with other servers, **merge** the Figma server entry into the existing `"servers"` object — do not overwrite.

### 0.4 Ensure the Figma server is running

**For Desktop MCP:**
1. Tell the user: _"Open Figma Desktop → Menu → Preferences → enable Allow MCP connections."_
2. Optionally verify reachability: `curl -s http://127.0.0.1:3845/mcp` (a non-error response means it is up).

**For Remote MCP:**
- No local app needed. The URL `https://mcp.figma.com/mcp` should be reachable. Verify with `curl -sI https://mcp.figma.com/mcp`.

### 0.5 Reload and re-verify

1. Tell the user: _"Please reload VS Code / Claude Code so the new MCP config is picked up."_
2. **STOP here. Wait for the user to confirm they have reloaded.**
3. After user confirms, re-run step 0.2 to verify tools are now available.
4. If tools are still not found, troubleshoot:
   - Re-check `.vscode/mcp.json` syntax.
   - Re-check that Figma Desktop is running with MCP enabled.
   - Ask user to share any error messages.
5. **Do NOT proceed until MCP tools are confirmed available.**

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
