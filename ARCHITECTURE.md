# Helix Architecture

## Overview

Helix uses a clean, layered architecture with strong separation of concerns:

```
┌─────────────────────────────────────────────┐
│         VSCode Chat Participant              │
│         (helixParticipant.ts)                │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│          Task Orchestrator                   │
│  - UnifiedFigmaTask                          │
│  - IntentAnalyzer (optimizes agent flow)     │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌──────────────┐      ┌──────────────────┐
│   Agents     │      │   Runtime Layer   │
│              │      │                   │
│ - FigmaAnalyzer     │◄────►│ - ExecutionContext│
│ - DesignSystemMapper│      │ - ArtifactStore   │
│ - Planner           │      │ - ToolRegistry    │
│ - CodeGenerator     │      │ - StreamHandler   │
│ - Comparer          │      └──────────────────┘
│ - IntentAnalyzer    │
│ - ReportGenerator   │
└──────────────┘
        │
        ▼
┌──────────────────────────────────────────────┐
│         Services (Infrastructure)             │
│  - LLMService                                 │
│  - FigmaService                               │
│  - WorkspaceService                           │
│  - CacheService                               │
│  - TelemetryService                           │
└──────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── contracts/              # Zod schemas + TypeScript types
│   ├── common.ts          # FigmaRef, Issue, TraceEvent, ToolCall, ToolResult
│   ├── figma.ts           # FigmaAnalysisResult
│   ├── designSystem.ts    # DesignSystemMappingResult
│   ├── plan.ts            # PlanResult
│   ├── codegen.ts         # CodegenResult
│   ├── compare.ts         # CompareResult
│   └── index.ts
│
├── runtime/                # Runtime infrastructure
│   ├── errors.ts          # AppError + ErrorCodes
│   ├── ExecutionContext.ts # Run context with cancellation, tracing
│   ├── ArtifactStore.ts   # Versioned artifact storage
│   ├── ToolRegistry.ts    # Unified tool invocation
│   ├── StreamHandler.ts   # VSCode stream wrapper
│   ├── toolSetup.ts       # Tool registration
│   └── index.ts
│
├── services/               # Infrastructure layer (no business logic)
│   ├── llmService.ts      # LLM chat + JSON mode
│   ├── figmaService.ts    # Figma MCP tools
│   ├── fileService.ts     # File I/O
│   ├── cacheService.ts    # Artifact persistence wrapper
│   ├── telemetryService.ts # Event tracking
│   └── index.ts
│
├── agents/                 # Domain intelligence
│   ├── base/
│   │   ├── Agent.ts       # BaseAgent<I,O>
│   │   └── index.ts
│   ├── prompts/           # Agent prompts as markdown
│   │   ├── figma-analyzer.md
│   │   ├── design-system-mapper.md
│   │   ├── planner.md
│   │   ├── code-generator.md
│   │   └── comparer.md
│   ├── FigmaAnalyzerAgent.ts
│   ├── DesignSystemAnalyzerAgent.ts
│   ├── PlannerAgent.ts
│   ├── CodeGeneratorAgent.ts
│   ├── ComparerAgent.ts
│   └── index.ts
│
├── tasks/                  # Flow orchestration
│   ├── base/
│   │   ├── Task.ts        # BaseTask<I,O>
│   │   └── index.ts
│   ├── UnifiedFigmaTask.ts # Unified task executor
│   ├── commandPresets.ts   # Command-specific agent pipelines
│   └── index.ts
│
├── participants/
│   ├── TaskOrchestrator.ts # New architecture entry point
│   └── helixParticipant.ts # VSCode integration
│
└── ...
```

## Core Concepts

### 1. Contracts (Zod Schemas)

All agent inputs/outputs are strongly typed and validated:

```typescript
import { z } from 'zod';

export const FigmaAnalysisResultSchema = z.object({
  schemaVersion: z.literal('1.0'),
  root: UIPartSchema,
  cases: z.array(DiscoveredCaseSchema),
  tokensHint: z.object({...}).optional(),
  risks: z.array(IssueSchema).optional(),
  trace: z.array(TraceEventSchema).optional(),
});

export type FigmaAnalysisResult = z.infer<typeof FigmaAnalysisResultSchema>;
```

**Key Design Decisions:**
- **No hardcoded enums for cases**: Cases are discovered dynamically from designs
- **Extensible with optional fields**: Easy to add new properties
- **Versioned schemas**: schemaVersion allows evolution

### 2. Runtime Layer

#### ExecutionContext
```typescript
class ExecutionContext {
  runId: string;
  workspaceInfo: WorkspaceInfo;
  settings: ExecutionSettings;
  cancellationToken?: vscode.CancellationToken;
  
  trace(source, name, data);
  throwIfCancelled();
  createChild(runId?): ExecutionContext;
}
```

- Provides: runId, cancellation, settings snapshot, workspace info
- Traces all operations for debugging
- Supports dry-run and replay modes

#### ArtifactStore
```typescript
class ArtifactStore {
  async set<T>(key: ArtifactKey, value: T);
  async get<T>(key: ArtifactKey): Promise<T | undefined>;
  has(key: ArtifactKey): boolean;
  
  // Persistence to .vscode/helix-runs/<runId>/
  async loadRunFromDisk(runId);
}
```

- In-memory + optional disk persistence
- Versioned keys: `{ runId, name, version? }`
- Enables replay mode by loading past runs

#### ToolRegistry
```typescript
class ToolRegistry {
  register(tool: ToolDefinition);
  async invoke(ctx, toolId, args): Promise<ToolResult>;
  
  // ToolResult = { ok, data?, error? }
}
```

- Unified interface for all tools (LLM, Figma, workspace, etc.)
- Consistent error handling
- Automatic tracing

#### StreamHandler

```typescript
class StreamHandler {
  progress(message: string): void;
  markdown(content: string): void;

  // Agent flow tracking (NEW)
  agentStart(agentName: string, message?: string): void;
  agentProgress(agentName: string, phase: 'executing' | 'validating', message?: string): void;
  agentComplete(agentName: string, metrics?: AgentMetrics): void;
  agentError(agentName: string, error: string | Error): void;

  // Visualization
  displayAgentMetrics(metrics: AgentMetrics): void;
  displayAgentFlow(): void;
  displayMetricsSummary(allMetrics: AgentMetrics[]): void;
}
```

- VSCode chat response stream wrapper
- Real-time progress updates during agent execution
- Agent execution flow tracking and visualization
- Metrics display with token usage and timing

### 3. Services

Services are **infrastructure only** - no business logic or prompts:

```typescript
class LLMService {
  async chat(ctx, messages, options): Promise<ToolResult>;
  async chatJSON<T>(ctx, messages, schema, options): Promise<ToolResult>;
}

class FigmaServiceNew {
  async checkMCPAvailability(ctx): Promise<ToolResult>;
  async getDesignContext(ctx, nodeId?, options?): Promise<ToolResult>;
  async getMetadata(ctx, nodeId?): Promise<ToolResult>;
  async getScreenshot(ctx, nodeId?): Promise<ToolResult>;
  async getVariableDefinitions(ctx, nodeId?): Promise<ToolResult>;
}

class WorkspaceService {
  async readFile(ctx, filePath): Promise<ToolResult>;
  async writeFile(ctx, filePath, content): Promise<ToolResult>;
  async findFiles(ctx, pattern, exclude?): Promise<ToolResult>;
  async openDocument(ctx, filePath): Promise<ToolResult>;
  async listDirectory(ctx, dirPath): Promise<ToolResult>;
}
```

All return `ToolResult` for consistency.

### 4. Agents

Agents contain **domain intelligence** (prompts + heuristics + tool usage):

```typescript
abstract class BaseAgent<I, O> {
  abstract name: string;
  abstract description: string;
  abstract outputSchema: z.ZodType<O>;
  
  async run(ctx, tools, input): Promise<O> {
    // 1. Validate input
    // 2. Execute logic
    // 3. Validate output
    // 4. Add trace events
  }
  
  protected abstract execute(ctx, tools, input): Promise<O>;
}
```

**Example: FigmaAnalyzerAgent**
```typescript
class FigmaAnalyzerAgent extends BaseAgent<FigmaAnalyzerInput, FigmaAnalysisResult> {
  readonly outputSchema = FigmaAnalysisResultSchema;
  
  protected async execute(ctx, tools, input) {
    // 1. Get design context from Figma
    const designContext = await tools.invoke(ctx, 'figma.getDesignContext', {...});
    
    // 2. Load prompt
    const prompt = await this.loadPrompt();
    
    // 3. Call LLM
    const result = await tools.invoke(ctx, 'llm.chatJSON', {
      messages: [...],
      schema: { name: 'FigmaAnalysisResult', schema: FigmaAnalysisResultSchema }
    });
    
    return result.data;
  }
}
```

Prompts are stored as markdown in `agents/prompts/`.

### 5. Tasks

Tasks orchestrate **pipelines** of agents:

```typescript
abstract class BaseTask<I, O> {
  abstract name: string;
  abstract outputSchema: z.ZodType<O>;
  
  async run(ctx, tools, artifacts, stream, input): Promise<O>;
  protected abstract execute(...): Promise<O>;
}
```

**Example: BuildFromFigmaTask**
```typescript
class BuildFromFigmaTask extends BaseTask<BuildFromFigmaInput, BuildFromFigmaOutput> {
  protected async execute(ctx, tools, artifacts, stream, input) {
    // 1. Analyze Figma
    const figmaAnalysis = await new FigmaAnalyzerAgent().run(ctx, tools, input);
    await artifacts.set({ runId: ctx.runId, name: 'figmaAnalysis' }, figmaAnalysis);
    
    // 2. Map to design system
    const dsMapping = await new DesignSystemAnalyzerAgent().run(ctx, tools, {
      figmaAnalysis, designSystemPath: input.designSystemPath
    });
    await artifacts.set({ runId: ctx.runId, name: 'designSystemMapping' }, dsMapping);
    
    // 3. Create plan
    const plan = await new PlannerAgent().run(ctx, tools, {
      goal: 'Implement UI from Figma',
      context: { figmaAnalysis, dsMapping, workspaceInfo: ctx.workspaceInfo }
    });
    
    // 4. Execute subtasks
    const codegenResults = [];
    for (const subtask of plan.subtasks) {
      const result = await new CodeGeneratorAgent().run(ctx, tools, {
        subtask, context: {...}
      });
      codegenResults.push(result);
      
      // Apply changes
      if (!ctx.settings.dryRun) {
        for (const file of result.files) {
          await tools.invoke(ctx, 'workspace.writeFile', {...});
        }
      }
    }
    
    return { codegenResults, summary: '...' };
  }
}
```

### 6. Error Handling

```typescript
class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public recoverable: boolean,
    public cause?: Error,
    public details?: any
  );
}

// Common error codes
const ErrorCodes = {
  TOOL_NOT_FOUND, TOOL_EXECUTION_FAILED,
  LLM_REQUEST_FAILED, LLM_VALIDATION_FAILED,
  FIGMA_MCP_NOT_AVAILABLE, FIGMA_REQUEST_FAILED,
  WORKSPACE_READ_FAILED, WORKSPACE_WRITE_FAILED,
  AGENT_VALIDATION_FAILED, AGENT_EXECUTION_FAILED,
  ...
};
```

ToolRegistry wraps all errors into ToolResult.

## Usage

### Basic Flow

```typescript
// 1. Setup
const ctx = ExecutionContextFactory.create(workspaceInfo, settings, token);
const tools = setupTools();
const artifacts = ArtifactStoreFactory.create(workspaceRoot);
const stream = StreamHandlerFactory.create(vscodeStream);

// 2. Run task
const task = new BuildFromFigmaTask();
const result = await task.run(ctx, tools, artifacts, stream, {
  nodeId: '123:456',
  designSystemPath: './design-system.md'
});

// 3. Artifacts are saved to .vscode/helix-runs/<runId>/
```

### Replay Mode

```typescript
const ctx = ExecutionContextFactory.create(workspaceInfo, {
  replay: true
}, token);

// Load artifacts from previous run
await artifacts.loadRunFromDisk('run-12345');

const figmaAnalysis = await artifacts.get({ runId: 'run-12345', name: 'figmaAnalysis' });
```

### Dry-Run Mode

```typescript
const ctx = ExecutionContextFactory.create(workspaceInfo, {
  dryRun: true
}, token);

// Tools can return mock data
// No file writes will occur
```

## Migration Notes

### Legacy Code
- Old services (configService, figmaService, etc.) are still present
- Old agent system (AgentBootstrap, etc.) is preserved
- These will be gradually migrated

### New Code Entry Point
- `TaskOrchestrator` is the new entry point
- Connected to helixParticipant for `/gen-code` and `/fit-finish` commands

## Current Status

### Completed
- ✅ Clean layered architecture (Task → Agent → Service)
- ✅ Strong contracts with Zod schemas
- ✅ Runtime layer (ExecutionContext, ArtifactStore, ToolRegistry, StreamHandler)
- ✅ UnifiedFigmaTask with IntentAnalyzer optimization
- ✅ ReportGeneratorAgent for consistent reporting
- ✅ Command presets for build-from-figma and fit-and-finish

### In Progress
- 🔄 Service layer consolidation (removing redundant services)
- 🔄 Agent prompt refinement based on usage

### Future Enhancements
- [ ] Patch application in FileService
- [ ] Git integration for diffs
- [ ] Screenshot comparison capabilities
- [ ] Telemetry backend connection
- [ ] Comprehensive unit tests
- [ ] Framework-specific code templates

## Benefits

✅ **Clean Separation**: Task → Agent → Service (one-way dependency)  
✅ **Strong Types**: Zod validation for all agent I/O  
✅ **Testable**: Pure functions + dependency injection  
✅ **Traceable**: Full execution trace for debugging  
✅ **Extensible**: Easy to add new agents, tasks, tools  
✅ **Replay-able**: Save/load runs for debugging  
✅ **Production-Ready**: Error handling, telemetry, cancellation  

## Contract Examples

### Discovered Cases (Not Hardcoded)

❌ **Old Approach:**
```typescript
enum ComponentState {
  DEFAULT = 'default',
  HOVER = 'hover',
  DISABLED = 'disabled',
  LOADING = 'loading'
}
```

✅ **New Approach:**
```typescript
{
  cases: [
    {
      id: "case-1",
      title: "Hover State",
      description: "Button shows darker background and scale effect on hover",
      conditions: ["User hovers over button", "Button is not disabled"],
      figmaRefs: [{ nodeId: "123:456", nodeName: "Button/Hover" }],
      optional: false
    },
    {
      id: "case-2",
      title: "Loading State",
      description: "Shows spinner and disables interaction while action is pending",
      conditions: ["onClick handler returns Promise", "Promise is pending"],
      figmaRefs: [{ nodeId: "123:457", nodeName: "Button/Loading" }],
      optional: true
    }
  ]
}
```

### UI Part Tree (Composition)

```typescript
{
  root: {
    id: "dialog-1",
    name: "Settings Dialog",
    role: "Modal dialog container with overlay",
    figmaRefs: [{ nodeId: "100:1" }],
    children: [
      {
        id: "header-1",
        name: "Dialog Header",
        role: "Contains title and close button",
        figmaRefs: [{ nodeId: "100:2" }],
        children: [
          { id: "title-1", name: "Title", role: "H2 heading", ... },
          { id: "close-1", name: "Close Button", role: "Icon button", ... }
        ]
      },
      {
        id: "body-1",
        name: "Dialog Body",
        role: "Scrollable content area",
        children: [...]
      }
    ]
  }
}
```

This structure is **discovered** from Figma data, not templated.
