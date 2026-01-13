# CodeGenerator Architecture

## Overview

The CodeGeneratorAgent supports two distinct operation modes with automatic detection:

1. **BUILD Mode**: Generate new code from Figma design + Design System
2. **FIX Mode**: Fix existing code based on Compare result + Design System

## Input Interface

The agent uses a **unified input interface** with automatic mode detection:

```typescript
export interface CodeGeneratorInput {
  goal?: string;

  // BUILD MODE: New code generation from Figma
  figmaAnalysis?: FigmaAnalysisResult;
  designSystem?: DesignSystemAnalysisResult;

  // FIX MODE: Fix existing code based on comparison
  compareResult?: CompareResult;
  existingCode?: Array<{ path: string; content: string; }>;
}
```

**Mode Detection Logic**:
- If `compareResult` is provided → **FIX mode**
- If `figmaAnalysis` is provided → **BUILD mode**
- If neither is provided → Error

## Architecture Flow

```
CodeGeneratorAgent.execute()
         ↓
    detectMode(input)
         ↓
    ┌────────┴────────┐
    ↓                 ↓
BUILD Mode        FIX Mode
    ↓                 ↓
executeBuildMode  executeFixMode
    ↓                 ↓
llm.chatJSON      llm.chatWithTools
    ↓                 ↓
Returns           LLM uses tools
CodegenResult     to read/write files
```

## BUILD Mode

### Purpose
Generate completely new UI components from Figma designs.

### Input Requirements
- `figmaAnalysis`: Parsed Figma design structure
- `designSystem`: Available components and patterns

### Execution Flow
1. Prepare context with Figma analysis summary and design system info
2. Call `llm.chatJSON` with CodegenResult schema
3. LLM returns structured JSON with:
   - File paths and content
   - Commands to run
   - Issues/warnings
4. Return CodegenResult for execution

### LLM Method
Uses **`llm.chatJSON`** because:
- Needs structured output matching CodegenResult schema
- No file system access needed (generating new files)
- Single-shot generation with complete output

### Example Output
```json
{
  "schemaVersion": "1.0",
  "summary": "Generated Button component with variants",
  "files": [
    {
      "path": "src/components/Button.tsx",
      "action": "create",
      "content": "import React from 'react';\n..."
    }
  ],
  "commands": ["npm install classnames"],
  "issues": []
}
```

## FIX Mode

### Purpose
Fix existing code to match design specifications based on comparison results.

### Input Requirements
- `compareResult`: Identified differences between code and design
- `designSystem`: Available components and patterns
- `existingCode`: List of file paths to fix (content will be read by LLM)

### Execution Flow
1. Extract file paths from compareResult and existingCode
2. Prepare context with:
   - Compare result summary
   - Design system info
   - List of files to fix
3. Call `llm.chatWithTools` to enable file operations
4. **LLM autonomously**:
   - Reads files using `copilot_readFile`
   - Analyzes differences
   - Writes fixes using `copilot_editFiles`, `copilot_applyPatch`, etc.
5. Return summary of completed operations

### LLM Method
Uses **`llm.chatWithTools`** because:
- LLM needs to read existing file content
- LLM needs to write/edit files directly
- Multi-step operations (read → analyze → write)
- Recursive tool calling support

### Tool Calling Flow
```
1. LLM receives context with file paths
2. LLM calls copilot_readFile for each file
3. Tool results returned to LLM
4. LLM analyzes differences
5. LLM calls copilot_editFiles to fix issues
6. Tool results returned to LLM
7. LLM returns summary of changes made
```

### Available Tools (Filtered to 13 Essential)
- `copilot_readFile` - Read file content
- `copilot_applyPatch` - Apply patch/diff
- `copilot_insertEdit` - Insert content at position
- `copilot_createFile` - Create new file
- `copilot_editFiles` - Edit multiple files
- `copilot_replaceString` - Replace text in file
- `copilot_multiReplaceString` - Multiple replacements
- `copilot_findFiles` - Find files by pattern
- `copilot_findTextInFiles` - Search file content
- `copilot_listDirectory` - List directory contents
- `copilot_searchCodebase` - Search entire codebase
- `copilot_searchWorkspaceSymbols` - Find symbols
- `copilot_getChangedFiles` - Get git changes

## LLMService Tool Calling

### Method: `chatWithTools()`

Enables LLM to autonomously invoke VSCode tools for file operations.

```typescript
async chatWithTools(
  ctx: ExecutionContext,
  messages: vscode.LanguageModelChatMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    toolInvocationToken?: vscode.ChatParticipantToolToken;
  }
): Promise<ToolResult>
```

### Key Implementation Details

1. **Tool Filtering**: Limits available tools to 13 essential file operations to avoid 128 tool limit
2. **Recursive Processing**: `processToolCalls()` handles multiple rounds of tool invocations
3. **Conversation Threading**: Tool results are added as user messages, allowing LLM to continue reasoning
4. **Error Handling**: Tool failures are returned as error results to LLM

### Tool Call Processing Flow

```
sendRequest(messages, tools)
         ↓
Response stream contains:
  - Text parts
  - Tool call parts
         ↓
If tool calls exist:
  1. Execute each tool
  2. Collect results
  3. Add assistant message (with tool calls)
  4. Add user message (with tool results)
  5. Send follow-up request
  6. Recursively process again
         ↓
If no tool calls:
  Return final text response
```

## Prompt Engineering

The prompt ([code-generator.md](../src/agents/prompts/code-generator.md)) explicitly instructs the LLM on both modes:

### BUILD Mode Instructions
- Analyze Figma structure
- Map to design system components
- Generate complete new files
- Return structured JSON

### FIX Mode Instructions (Critical)
```markdown
**CRITICAL for FIX mode - Tool Usage**:
- You have access to file read/write tools
- **ALWAYS use these tools** to read existing file content before making changes
- **ALWAYS use these tools** to write the modified content back to files
- Do NOT attempt to return file content in JSON - use the tools instead
- Make multiple tool calls as needed (read → analyze → write)
```

## Token Optimization

To reduce token usage, large data structures are summarized:

```typescript
// Figma analysis: Only include structure, not full tree
summarizeFigmaAnalysis(): {
  rootComponent: { name, role, childCount },
  casesCount,
  tokensHint,
  risks
}

// Design system: Only include counts and patterns
summarizeDesignSystem(): {
  schemaVersion,
  domainsCount,
  componentPatterns,
  frameworkInfo
}

// Compare result: Only include diffs and actions
summarizeCompareResult(): {
  schemaVersion,
  score,
  diffs: [{ category, description, severity, filePaths }],
  nextActions
}
```

## Integration with UnifiedFigmaTask

The task orchestrator prepares input based on available agent results:

```typescript
case 'CodeGenerator':
  input.goal = taskInput.userPrompt || 'Generate code from design';
  input.figmaAnalysis = agentResults['FigmaAnalyzer'];
  input.designSystem = agentResults['DesignSystemAnalyzer'];

  // If Comparer result exists → FIX mode
  if (agentResults['Comparer']) {
    input.compareResult = agentResults['Comparer'];
    if (agentResults['CodeAnalyzer']?.implementationContext?.files) {
      const filePaths = agentResults['CodeAnalyzer'].implementationContext.files;
      // Empty content - LLM will read using tools
      input.existingCode = filePaths.map(path => ({
        path,
        content: '',
      }));
    }
  }
  break;
```

## Error Handling

### Tool Invocation Failures
- Each tool call is wrapped in try-catch
- Failures return error results to LLM
- LLM can retry or adjust approach

### LLM Request Failures
- Standard error handling with AppError
- Trace events captured for debugging
- Error details included in result

### Mode Detection Failures
- Throws clear error if neither mode can be detected
- Requires valid input fields

## Testing Considerations

### BUILD Mode Testing
1. Provide Figma analysis + design system
2. Verify CodegenResult structure
3. Check generated file content validity
4. Validate commands list

### FIX Mode Testing
1. Provide compare result + design system + file paths
2. Monitor tool invocations (console logs)
3. Verify files are actually read/written
4. Check that fixes match compare result issues

### Tool Calling Testing
1. Enable verbose logging to see tool calls
2. Verify tool filtering (should be 13 tools)
3. Check recursive processing with multiple tool rounds
4. Test error handling when tools fail

## Performance Considerations

1. **Token Usage**: Summaries reduce token consumption by ~70%
2. **Tool Filtering**: Reduces tool list from 100+ to 13
3. **Streaming**: Tool responses are streamed for responsiveness
4. **Caching**: VSCode may cache tool schemas

## Security Considerations

1. **Tool Access**: Limited to file operations only
2. **File Paths**: Validated by VSCode tools
3. **Cancellation**: Supports cancellation token
4. **Sandboxing**: VSCode enforces tool permissions

## Future Enhancements

1. **Parallel Tool Calls**: VSCode API may support parallel tool execution
2. **Tool Result Caching**: Cache file reads within same session
3. **Incremental Updates**: Stream file changes as they're made
4. **Diff Preview**: Show diffs before applying changes
5. **Rollback Support**: Undo tool operations if needed
