                 # Figma URL Data Retrieval Issue - Analysis

## Issue Summary
When attempting to retrieve Figma design data using a URL, the system is receiving "Nothing is selected..." as the response, indicating that no design data is being fetched properly.

## Root Cause Analysis

### 1. Node ID Extraction Flow
The code correctly extracts the nodeId from URLs:

**File: [TaskOrchestrator.ts:168-182](src/participants/TaskOrchestrator.ts#L168-L182)**
```typescript
private extractNodeId(prompt: string): string | undefined {
  // Try to extract from Figma URL
  const urlMatch = prompt.match(/node-id=([^&\s]+)/);
  if (urlMatch) {
    return urlMatch[1].replace(/-/g, ':');
  }

  // Check if direct node ID provided
  const nodeIdMatch = prompt.match(/\b(\d+[-:]\d+)\b/);
  if (nodeIdMatch) {
    return nodeIdMatch[1].replace(/-/g, ':');
  }

  return undefined;
}
```

This correctly:
- Extracts `node-id` parameter from URL query strings
- Converts format from `123-456` to `123:456`
- Falls back to direct node ID patterns

### 2. Data Flow to Figma MCP

**File: [FigmaService.ts:52-127](src/services/figmaService.ts#L52-L127)**

The `getDesignContext` method properly:
- Finds the Figma MCP tool (`mcp_figma-desktop_get_design_context`)
- Passes the nodeId parameter if provided
- Invokes the tool via `vscode.lm.invokeTool`

**File: [FigmaAnalyzerAgent.ts:38-72](src/agents/FigmaAnalyzerAgent.ts#L38-L72)**

The agent correctly calls the service and logs the response, showing:
- ✅ Design Context Retrieved
- Length: 19 characters
- Empty: No
- Preview: `Nothing is selected...`

### 3. The Actual Problem

**The issue is NOT in the Helix codebase.** The problem occurs at the Figma MCP server level.

The message "Nothing is selected..." (19 characters) is being returned by the **Figma Desktop MCP server**, which means:

1. **The nodeId might not be passed correctly to the MCP tool**, OR
2. **The Figma Desktop app doesn't have the correct node selected**, OR
3. **The nodeId format might not be recognized by the Figma MCP server**

## Key Findings

### Working Correctly ✅
- URL parsing and nodeId extraction
- Tool invocation flow
- Error handling and logging
- Data propagation through agents

### Potential Issues ⚠️

1. **MCP Tool Parameter Format**
   - The nodeId is being passed to the MCP tool as `params.nodeId`
   - The Figma MCP might expect a different parameter format or name
   - Check if `nodeId` should be passed in a specific format (e.g., with file key)

2. **Figma Desktop Selection State**
   - The MCP tool might require the node to be selected in Figma Desktop
   - When no nodeId is provided, it uses the current selection
   - When nodeId IS provided, it might still need the file to be open

3. **NodeId Format Compatibility**
   - Helix converts `123-456` → `123:456`
   - Figma MCP might expect `123-456` instead
   - Pattern matching: `\d+[-:]\d+` matches both formats

## Recommended Solutions

### Solution 1: Debug MCP Parameter Format
Add detailed logging to see exactly what's being sent to the MCP tool:

```typescript
// In FigmaService.ts, line 93
console.log('[Helix] Invoking Figma MCP with params:', JSON.stringify(params, null, 2));
const result = await vscode.lm.invokeTool(
  designContextTool.name,
  params,
  ctx.cancellationToken
);
console.log('[Helix] MCP Raw Result:', result.content);
```

### Solution 2: Test Both NodeId Formats
The Figma MCP documentation might specify a preferred format. Try passing nodeId as:
- `123:456` (current format - colons)
- `123-456` (dash format)
- `node-id=123-456` (query param format)

### Solution 3: Include File Key
The Figma URL contains both file key AND node ID:
```
https://figma.com/design/{fileKey}/{fileName}?node-id=123-456
```

The MCP tool might need BOTH:
```typescript
const params: any = {
  fileKey: extractedFileKey,  // Add this
  nodeId: nodeId,
  clientLanguages: ctx.workspaceInfo.language || 'unknown',
  clientFrameworks: ctx.workspaceInfo.framework || 'unknown',
};
```

### Solution 4: Check Figma MCP Documentation
Review the official Figma MCP server documentation to verify:
- Required parameters for `get_design_context`
- Expected nodeId format
- Whether file needs to be open in Figma Desktop
- Authentication/permission requirements

### Solution 5: Fallback to Metadata Tool
If `get_design_context` doesn't work with URLs, try using `get_metadata` first:

```typescript
// Get metadata to verify node exists
const metadataResult = await tools.invoke(ctx, 'figma.getMetadata', { nodeId });
if (!metadataResult.ok) {
  throw new Error('Node not found or inaccessible');
}

// Then get design context
const designContextResult = await tools.invoke(ctx, 'figma.getDesignContext', { nodeId });
```

## Code Locations to Investigate

1. **[src/services/figmaService.ts:84-90](src/services/figmaService.ts#L84-L90)** - Parameter building for MCP call
2. **[src/participants/TaskOrchestrator.ts:168-182](src/participants/TaskOrchestrator.ts#L168-L182)** - NodeId extraction regex
3. **[src/agents/FigmaAnalyzerAgent.ts:42-45](src/agents/FigmaAnalyzerAgent.ts#L42-L45)** - MCP tool invocation

## Testing Strategy

1. **Test with node selected in Figma Desktop** (no URL provided)
   - Verify MCP works when relying on current selection

2. **Test with URL and file open in Figma Desktop**
   - Ensure the file referenced in URL is open
   - See if that changes the behavior

3. **Test with direct nodeId format** (not from URL)
   - Pass nodeId directly as `9064:108146`
   - Bypass URL parsing completely

4. **Check MCP tool availability and version**
   - Verify Figma Desktop MCP version
   - Check if there are known issues or updates

## Conclusion

The Helix code is working correctly. The issue is in the communication with the Figma Desktop MCP server. The server is returning "Nothing is selected..." which indicates it's not finding the specified node.

**Next Steps:**
1. Add debug logging to capture exact MCP request parameters
2. Consult Figma MCP documentation for proper parameter format
3. Test if file needs to be open in Figma Desktop
4. Consider extracting and passing both fileKey and nodeId
5. Verify Figma Desktop MCP server is properly configured and up to date
