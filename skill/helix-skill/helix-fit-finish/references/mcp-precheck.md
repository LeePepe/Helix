# MCP Precheck

## Goal

Verify Figma MCP is configured and reachable before running any Helix workflow. **This is a blocking gate — do not proceed without a working MCP connection.**

## Actions

1. Read `.vscode/mcp.json` in the project root.
   - If missing → create it (see Configuration Examples below). Ask user to choose Desktop or Remote.
   - If exists but missing Figma server entry → merge a Figma server into the existing config.
2. Search for available tools matching `mcp.*figma` to verify the MCP server is loaded.
   - Tools found → precheck passes.
   - Tools NOT found → server is configured but not running. Continue to step 3.
3. Guide the user to start the Figma MCP server:
   - **Desktop**: Open Figma Desktop → Preferences → enable "Allow MCP connections".
   - **Remote**: No action needed; verify URL is reachable with `curl -sI https://mcp.figma.com/mcp`.
4. Ask user to reload VS Code / Claude Code, then **wait for confirmation**.
5. Re-verify tools after reload. Repeat troubleshooting if still not found.

## Configuration Examples

Desktop MCP (selection-based, recommended):

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

Remote MCP (URL-based):

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

## Merge Rule

If `.vscode/mcp.json` already exists with other servers, add the Figma server entry into the existing `"servers"` object. Never overwrite existing server configs.

## Output

- MCP status: ready or blocked
- If blocked: clear next steps for the user to unblock
- **Never silently skip MCP and fall back to codebase-only mode**
