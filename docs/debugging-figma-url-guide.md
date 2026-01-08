# Debugging Figma URL Issue - Testing Guide

## What Was Added

### v2 Update (Latest) - Direct URL Passing

The system now passes complete Figma URLs directly to the MCP tool, which handles URL parsing automatically.

**Key Change**: Instead of extracting node IDs from URLs ourselves, we now pass the full URL to the `mcp_figma-desktop_get_design_context` tool, which has built-in URL parsing capabilities.

### v1 - Console Logging

Comprehensive console logging has been added to track the entire flow of Figma URL processing and data retrieval.

## Modified Files

1. **[src/services/figmaService.ts](../src/services/figmaService.ts)**
   - v1: Added detailed logging in `getDesignContext()`
   - v2: Updated to accept and pass full Figma URLs to MCP tool

2. **[src/participants/TaskOrchestrator.ts](../src/participants/TaskOrchestrator.ts)**
   - v1: Added logging in `extractNodeId()`
   - v2: Modified to extract and return full Figma URLs instead of just node IDs

## How to Test

### Step 1: Build the Extension
```bash
npm run compile
```

### Step 2: Test with a Figma URL

In VS Code Chat, try one of these:

**Option A: With Full URL**
```
@helix build from https://www.figma.com/design/YOUR_FILE_KEY/Your-Design?node-id=9064-108146
```

**Option B: With Direct Node ID**
```
@helix build from 9064:108146
```

### Step 3: Check the Debug Output

Open the **Debug Console** in VS Code (View → Debug Console) and look for these log sections:

#### 1. TaskOrchestrator Logs
```
[Helix] [TaskOrchestrator] ========== extractNodeId START ==========
[Helix] [TaskOrchestrator] Input prompt: <your prompt>
[Helix] [TaskOrchestrator] ✅ Found node-id in URL
[Helix] [TaskOrchestrator] Extracted value: 9064-108146
[Helix] [TaskOrchestrator] Converted to: 9064:108146
[Helix] [TaskOrchestrator] ========== extractNodeId END ==========
```

#### 2. FigmaService Logs
```
[Helix] [FigmaService] ========== getDesignContext START ==========
[Helix] [FigmaService] Input nodeId: 9064:108146
[Helix] [FigmaService] Total available tools: <number>
[Helix] [FigmaService] Tool names: [...]
[Helix] [FigmaService] ✅ Found design context tool
[Helix] [FigmaService] 📤 Invoking MCP tool with params:
[Helix] [FigmaService] Params: {
  "clientLanguages": "typescript",
  "clientFrameworks": "react",
  "nodeId": "9064:108146"
}
[Helix] [FigmaService] 📥 MCP tool invocation complete
[Helix] [FigmaService] 📊 Final content length: <number>
[Helix] [FigmaService] Final content preview: <content>
[Helix] [FigmaService] Content is "Nothing is selected"?: true/false
[Helix] [FigmaService] ========== getDesignContext END ==========
```

## What to Look For

### ✅ Success Indicators
- NodeId is extracted correctly from URL
- NodeId is passed to MCP tool in params
- Content length > 100 characters
- Content is NOT "Nothing is selected..."

### ❌ Problem Indicators
- NodeId extraction shows `undefined` or wrong value
- MCP tool not found
- Content is "Nothing is selected..." (19 characters)
- Empty content

## Common Issues and Solutions

### Issue 1: NodeId Not Extracted
**Symptom:** `[Helix] [TaskOrchestrator] ⚠️  No nodeId found in prompt`

**Solution:**
- Check URL format: Should contain `node-id=9064-108146` or `node-id=9064:108146`
- Or provide direct nodeId like `9064:108146` or `9064-108146`

### Issue 2: "Nothing is selected..."
**Symptom:**
```
[Helix] [FigmaService] Content is "Nothing is selected"?: true
```

**Possible Causes:**
1. **File not open in Figma Desktop** - The file referenced by the URL needs to be open
2. **NodeId format issue** - MCP might expect a different format
3. **Missing fileKey** - MCP might need both fileKey and nodeId

**Solutions to Try:**

#### A. Open the file in Figma Desktop first
1. Click the Figma URL in your browser
2. Make sure the file opens in Figma Desktop
3. Try the command again

#### B. Test with different nodeId formats
The current code converts `9064-108146` → `9064:108146`. Try keeping the original format:

In [src/participants/TaskOrchestrator.ts](../src/participants/TaskOrchestrator.ts#L176):
```typescript
// Instead of converting:
return urlMatch[1].replace(/-/g, ':');

// Try keeping original:
return urlMatch[1];  // Keep as 9064-108146
```

#### C. Pass fileKey along with nodeId
The Figma MCP tool might need both parameters. To implement this:

1. Update `TaskOrchestrator.extractNodeId()` to return both:
```typescript
private extractFigmaInfo(prompt: string): { fileKey?: string; nodeId?: string } {
  const urlMatch = prompt.match(/design\/([^/?]+).*node-id=([^&\s]+)/);
  if (urlMatch) {
    return {
      fileKey: urlMatch[1],
      nodeId: urlMatch[2].replace(/-/g, ':')
    };
  }
  return {};
}
```

2. Update `FigmaService.getDesignContext()` to accept fileKey:
```typescript
if (fileKey) {
  params.fileKey = fileKey;
}
```

### Issue 3: MCP Tool Not Found
**Symptom:**
```
[Helix] [FigmaService] ❌ Design context tool not found!
```

**Solution:**
1. Ensure Figma Desktop is running
2. Check MCP server configuration in VS Code settings
3. Restart VS Code
4. Check available tools list in logs

## Next Steps Based on Logs

### If NodeId is extracted correctly but content is empty:
→ The issue is in the MCP tool communication. Check the **Solutions to Try** section above.

### If NodeId is NOT extracted:
→ The URL format is not matching. Check the regex patterns in `extractNodeId()`.

### If MCP tool is not found:
→ Figma Desktop MCP is not properly configured. Follow Figma MCP setup documentation.

## Additional Debugging

### View MCP Tool Schema
Add this temporary code to see what parameters the MCP tool expects:

```typescript
console.log('[DEBUG] Tool inputSchema:', JSON.stringify(designContextTool.inputSchema, null, 2));
```

### Test with Current Selection
Instead of passing a nodeId, try selecting a node in Figma Desktop and running:
```
@helix build from current selection
```

This will call the MCP without nodeId, using Figma's current selection.

## Reporting Results

When reporting the issue, include:

1. **Full prompt used** (the exact command you ran)
2. **Complete log output** from both TaskOrchestrator and FigmaService sections
3. **Figma file status** (was it open in Desktop?)
4. **MCP tool availability** (list of available tools from logs)
5. **Content preview** from the logs

This will help identify exactly where the issue occurs in the flow.
