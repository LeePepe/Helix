# MCP Precheck

## Goal

Verify Figma MCP is configured and reachable before running any workflow.

## Actions

1. Check MCP configuration in `.vscode/mcp.json` (Desktop and/or Remote).
2. Verify tools are available (e.g., `mcp_figma-desktop_*` or `mcp_figma_*`).
3. If Desktop MCP is missing, instruct the user to enable the Figma Desktop local server and retry.
4. If Remote MCP is missing, provide configuration steps for URL-based access.
5. Offer an install step if the environment supports MCP installation commands.

## Configuration Examples

Desktop MCP (selection-based):

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

## Output

- MCP status summary
- Clear next steps if not available
