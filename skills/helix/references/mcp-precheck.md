# MCP Precheck

## Goal

Verify Figma MCP is configured and reachable before running any Helix workflow. **This is a blocking gate — do not proceed without a working MCP connection.**

## Actions

1. Read `.mcp.json` in the project root (Claude Code's MCP config). Accept a legacy `.vscode/mcp.json` if that is what the project already uses.
   - If neither exists → create `.mcp.json` (see Configuration Examples below). Ask user to choose Desktop or Remote.
   - If exists but missing the Figma server entry → merge a Figma server into the existing config.
2. Search for available tools matching `mcp.*figma` to verify the MCP server is loaded.
   - Tools found → precheck passes.
   - Tools NOT found → server is configured but not running. Continue to step 3.
3. Guide the user to start the Figma MCP server:
   - **Desktop**: Open Figma Desktop → Preferences → enable "Allow MCP connections".
   - **Remote**: No action needed; verify URL is reachable with `curl -sI https://mcp.figma.com/mcp`.
4. Ask user to reload Claude Code (or VS Code), then **wait for confirmation**.
5. Re-verify tools after reload. Repeat troubleshooting if still not found.

## Configuration Examples

`.mcp.json` uses the `mcpServers` key. Desktop MCP (selection-based, recommended):

```json
{
  "mcpServers": {
    "figma-desktop": {
      "type": "http",
      "url": "http://127.0.0.1:3845/mcp"
    }
  }
}
```

Remote MCP (URL-based):

```json
{
  "mcpServers": {
    "figma": {
      "type": "http",
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
```

> Legacy `.vscode/mcp.json` uses a `servers` key instead. If you find one, reuse it as-is rather than creating a duplicate.

## Merge Rule

If the config already exists with other servers, add the Figma server entry into the existing `mcpServers` object. Never overwrite existing server configs.

## Output

- MCP status: ready or blocked
- If blocked: clear next steps for the user to unblock
- **Never silently skip MCP and fall back to codebase-only mode**
