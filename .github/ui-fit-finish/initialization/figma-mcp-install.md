# Figma MCP Installation for VS Code

Install both Figma Desktop and Remote MCP servers to enable programmatic access to Figma designs.

## Quick Setup (Automated)

Run the automated setup script:

```bash
.github/ui-fit-finish/scripts/check-prerequisites.sh
```

The script will:

- Check for MCP configuration
- Create `.vscode/mcp.json` or `.mcp.json` if needed
- Add both `figma-desktop` and `figma` servers
- Guide you through next steps

**After running:**

1. Restart VS Code to load MCP servers
2. Enable MCP in Figma Desktop (Shift+D → Enable MCP)
3. Authenticate remote server in VS Code when prompted

---

## Manual Installation

For manual setup or troubleshooting, follow the detailed steps below.

### Prerequisites

- **For Desktop MCP**: Latest version of Figma desktop app
- **For Remote MCP**: Figma account with OAuth access
- **VS Code Extension**: GitHub Copilot enabled
- **Configuration File**: `.vscode/mcp.json` in workspace (auto-created if missing)

---

## Install Figma Desktop MCP Server

**Purpose**: Real-time access to designs open in Figma desktop app

### Step 1: Enable in Figma Desktop App

1. Open Figma desktop app (ensure latest version)
2. Create or open a Design file
3. Toggle to Dev Mode using `Shift+D` in the toolbar
4. In the MCP server section of the inspect panel, click **"Enable desktop MCP server"**
5. Server will run locally at: `http://127.0.0.1:3845/mcp`

### Step 2: Configure in VS Code

1. Open Command Palette: `⌘ Shift P` (macOS) or `Ctrl Shift P` (Windows/Linux)
2. Search for and select: `MCP: Add Server`
3. Select: `HTTP`
4. Enter the server URL: `http://127.0.0.1:3845/mcp`
5. When prompted for Server ID, type: `figma-desktop`
6. Choose installation scope:
   - **Workspace**: Only for this project (recommended)
   - **Global**: Available across all VS Code workspaces

Your `.vscode/mcp.json` will be updated with:

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

### Step 3: Verify Installation

1. Open chat using `⌥⌘B` or `⌃⌘I`
2. Switch to Agent mode
3. Type `#get_design_context` to check if tools are available
4. Expected tools: `mcp__figma-desktop__get_design_context`, `mcp__figma-desktop__get_screenshot`, etc.

### Configuration in Figma

- Access: **Figma → Preferences → Desktop MCP server settings**
- Configure:
  - Image handling (local server, download assets, or placeholders)
  - Code Connect integration
  - Export settings

---

## Install Figma Remote MCP Server

**Purpose**: Access any Figma file via URL without requiring desktop app

### Step 1: Add Server Configuration

#### Option A: Via VS Code Command Palette

1. Open Command Palette: `⌘ Shift P` (macOS) or `Ctrl Shift P` (Windows/Linux)
2. Search for: `MCP: Open Workspace Folder MCP Configuration`
3. Add the following to your `mcp.json`:

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

#### Option B: Manual Edit

1. Open or create `.vscode/mcp.json` in your workspace
2. Add the figma server configuration as shown above

### Step 2: Start and Authenticate

1. Save the `mcp.json` file
2. In VS Code, the MCP server should appear in the MCP servers list
3. Click the **Start** button next to the `figma` server name
4. When prompted, click **"Allow Access"** to begin OAuth authentication
5. Complete the Figma OAuth flow in your browser:
   - Log in to your Figma account
   - Authorize VS Code MCP access
   - Return to VS Code

### Step 3: Verify Remote Installation

1. Check that the `figma` server status shows as "Running" and "Authenticated"
2. Open chat and verify tools are available
3. Expected tools: `mcp__figma__get_design_context`, `mcp__figma__get_variable_defs`, etc.

---

## Testing the Installation

### Test 1: Desktop MCP - Selected Frame

1. Open Figma desktop app with MCP server enabled
2. Select a component or frame in a Design file
3. In VS Code chat: "Describe the currently selected Figma component"
4. **Expected**: Tool `mcp__figma-desktop__get_design_context` is called
5. **Result**: Returns design properties, code, and styling information

### Test 2: Remote MCP - Figma URL

1. Copy a Figma frame URL: `https://figma.com/design/[fileKey]/[fileName]?node-id=[nodeId]`
2. In VS Code chat: "Generate SwiftUI code for this design: [paste URL]"
3. **Expected**: Tool `mcp__figma__get_design_context` is called with node ID extracted from URL
4. **Result**: Returns design data and generates appropriate code

### Test 3: Design Variables/Tokens

1. Select a frame with design variables/tokens in Figma
2. In VS Code chat: "What design tokens are available in the selected frame?"
3. **Expected**: Tool `mcp__figma__get_variable_defs` or `mcp__figma-desktop__get_variable_defs` is called
4. **Result**: Returns list of design tokens (colors, spacing, typography, etc.)

### Test 4: Screenshot Generation

1. Select a complex component in Figma desktop app
2. In VS Code chat: "Show me a screenshot of this component"
3. **Expected**: Tool `mcp__figma-desktop__get_screenshot` is called
4. **Result**: Returns visual screenshot of the selected component

---

## Troubleshooting

### Error: "Desktop MCP server not found"

**Cause**: Figma desktop app not running or server not enabled

**Solution**:

1. Ensure Figma desktop app is running
2. Open a Design file and toggle to Dev Mode (`Shift+D`)
3. Enable "Desktop MCP server" in the MCP section
4. Verify server is accessible: `curl http://127.0.0.1:3845/mcp`
5. In VS Code, check MCP server status and restart if needed

### Error: "Remote authentication failed"

**Cause**: OAuth flow not completed or expired

**Solution**:

1. In VS Code, open the MCP servers panel
2. Find the `figma` server and click **Start**
3. Click **"Allow Access"** when prompted
4. Complete the OAuth flow in your browser
5. Ensure you're logged into the correct Figma account

### Error: "Connection timeout"

**Cause**: Network issues or server not responding

**Solution**:

1. **For Desktop**: Check if Figma app is running and server is enabled
2. **For Remote**: Check internet connection and firewall settings
3. Restart Figma desktop app if needed
4. Re-authenticate remote server if needed
5. Restart VS Code to refresh MCP connections

### Error: "Tool not found"

**Cause**: MCP server added but tools not registered

**Solution**:

1. Restart VS Code to refresh MCP connections
2. Verify server configuration in `.vscode/mcp.json`
3. Ensure GitHub Copilot is enabled in VS Code
4. Remove and re-add the server via Command Palette:
   - `MCP: Remove Server` → select the server
   - `MCP: Add Server` → follow setup steps again

---

## Maintenance

### Regular Checks

- Verify both servers monthly with test queries
- Keep Figma desktop app updated to latest version
- Re-authenticate remote server if access expires

### Troubleshooting Tips

- **Desktop MCP stops working**: Restart Figma app and re-enable server
- **Remote MCP auth expires**: Restart the server in VS Code and re-authenticate
- **Tools not appearing**: Restart VS Code to refresh MCP connections
- **Slow responses**: Check network connection and Figma API status
- **After VS Code updates**: Verify MCP servers are still configured and running

---

## Related Documentation

- Figma Desktop MCP: https://developers.figma.com/docs/figma-mcp-server/local-server-installation/
- Figma Remote MCP: https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/
- Figma API Documentation: https://www.figma.com/developers/api
- MCP Documentation: https://modelcontextprotocol.io
