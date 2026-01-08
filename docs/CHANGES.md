# Recent Changes Log

## 2026-01-08: Simplified Architecture - Agents Can Call Agents

### Overview
Restructured the architecture to allow **agents to call other agents**, simplifying the task orchestration and making workflows more intuitive.

### Key Changes

#### 1. Agents as Tools
Agents are now registered in the `ToolRegistry` and can be invoked by other agents:

```typescript
// In toolSetup.ts
registry.register({
  id: 'agent.figmaAnalyzer',
  execute: async (ctx, args) => {
    const result = await figmaAnalyzer.run(ctx, registry, args, args.stream);
    return { ok: true, data: result };
  },
});
```

This enables the proper architecture:
```
Task (orchestration)
  ↓
Agent (business logic) ← can call other agents
  ↓
Service (infrastructure)
```

#### 2. Simplified Workflows

**Before:** Task manually orchestrated multiple agents
```
Task → FigmaAnalyzer → DesignSystemAnalyzer → Planner → CodeGenerator
```

**After:** Agents orchestrate in explicit pipelines

**Fit & Finish:**
```
Task → [Parallel: FigmaAnalyzer + DesignSystemAnalyzer]
     → Comparer → Output result
```

**Gen Code:**
```
Task → CodeGeneratorAgent (orchestrate=true)
         ├─ Parallel: FigmaAnalyzer
         ├─ Parallel: DesignSystemAnalyzer
         └─ Generate code → Output files
```

#### 3. Updated Command Presets

**Fit & Finish** ([commandPresets.ts:32-56](../src/tasks/commandPresets.ts#L32-L56)):
```typescript
export const FIT_AND_FINISH_PIPELINE = [
  {
    agentName: 'FigmaAnalyzer',
    executionOrder: 1,
    parallelGroup: 1,
  },
  {
    agentName: 'DesignSystemAnalyzer',
    executionOrder: 1,
    parallelGroup: 1,
  },
  {
    agentName: 'Comparer',
    executionOrder: 2,
    parallelGroup: 2,
    dependencies: ['FigmaAnalyzer', 'DesignSystemAnalyzer'],
  },
];
```

**Gen Code** ([commandPresets.ts:14-25](../src/tasks/commandPresets.ts#L14-L25)):
```typescript
export const BUILD_FROM_FIGMA_PIPELINE = [{
  agentName: 'CodeGenerator',
  inputs: { orchestrate: true },  // Single agent does it all
}];
```

### Files Changed

#### Core Infrastructure
- [src/runtime/toolSetup.ts](../src/runtime/toolSetup.ts#L140-L189)
  - Register all agents as tools
  - Agents can now invoke each other via `tools.invoke(ctx, 'agent.xxx', args)`

#### Updated Agents
- [src/agents/ComparerAgent.ts](../src/agents/ComparerAgent.ts#L8-L119)
  - Added `orchestrate` mode
  - Parallel fetch: Figma + DesignSystem + Code context
  - Backward compatible with direct data input

- [src/agents/CodeGeneratorAgent.ts](../src/agents/CodeGeneratorAgent.ts#L10-L108)
  - Added `orchestrate` mode
  - Parallel fetch: Figma + DesignSystem
  - Supports both subtask-based (legacy) and direct generation

#### Updated Task Flows
- [src/tasks/commandPresets.ts](../src/tasks/commandPresets.ts)
  - Simplified to single-agent pipelines
  - Agents handle internal orchestration

### Benefits

1. **Clearer architecture** - Proper layering: Task → Agent → Service
2. **Less complexity** - Task doesn't manage agent dependencies
3. **Better reusability** - Agents can be composed flexibly
4. **Parallel execution** - Agents internally parallelize data fetching
5. **Backward compatible** - Legacy multi-agent flows still work

### Example Usage

**Old way (still works):**
```typescript
// Task explicitly calls multiple agents
const figma = await figmaAnalyzer.run(...);
const ds = await designSystemAnalyzer.run(...);
const result = await comparer.run(..., { figmaData: figma, ... });
```

**New way:**
```typescript
// Single agent call, it orchestrates internally
const result = await comparer.run(ctx, tools, {
  orchestrate: true,
  nodeId: '123:456',
  designSystemPath: './ds.md',
});
```

The agent automatically:
1. Fetches Figma data (parallel)
2. Fetches Design System mappings (parallel)
3. Fetches code context (parallel)
4. Performs comparison
5. Returns unified result

---

## 2026-01-08: Removed Iterative Refinement - Single Execution Per Workflow

### Overview
Removed all iteration loops from the task execution flow. Each agent workflow now executes **exactly once** per command, simplifying the execution model and improving predictability.

### Key Changes

#### 1. Removed Iteration Logic
**Before:** Tasks used `executeIterativeRefinement()` with loop:
```typescript
for (let iteration = 0; iteration < maxIterations; iteration++) {
  // Execute Planner
  // Execute CodeGenerator
  // Check quality threshold
  // Repeat if quality not met
}
```

**After:** Tasks use `executeSimplifiedPipeline()` with single execution:
```typescript
// Execute agent workflow once
const result = await this.executeSimplifiedPipeline(...);
// Return result immediately
```

#### 2. Simplified Task Flow

**Fit & Finish Flow:**
```
Task → IntentAnalyzer → [Parallel: FigmaAnalyzer + DesignSystemAnalyzer]
                       → Comparer → Return result
```

**Gen Code Flow:**
```
Task → IntentAnalyzer → CodeGeneratorAgent (orchestrate=true) → Return result
                          ├─ Parallel: FigmaAnalyzer
                          └─ Parallel: DesignSystemAnalyzer
```

#### 3. Updated Files

**[src/tasks/UnifiedFigmaTask.ts](../src/tasks/UnifiedFigmaTask.ts)**
- Modified `execute()` to always call `executeSimplifiedPipeline()`
- Removed `executeIterativeRefinement()` method (no longer called)
- Removed `executeBuildPipeline()` method (no longer called)
- New `executeSimplifiedPipeline()` method:
  - Executes agents once according to plan
  - Stores results (compareResult or codegenResults)
  - Applies code changes if needed
  - Returns summary without iteration data

### Benefits

1. **Simpler execution model** - No complex iteration logic
2. **Predictable behavior** - Always one execution per command
3. **Faster execution** - No repeated agent runs
4. **Clearer user experience** - No confusing iteration numbers
5. **Better performance** - Single execution reduces token usage

### User Experience

**Before:**
```markdown
### Iteration 1
✅ Planner - 2.1s | 🪙 3,200 tokens
✅ CodeGenerator - 4.5s | 🪙 8,450 tokens

Quality Score: 72 (target: 80)

### Iteration 2
✅ Planner - 1.9s | 🪙 2,800 tokens
✅ CodeGenerator - 4.2s | 🪙 7,900 tokens

Quality Score: 85 (target: 80) ✓
```

**After:**
```markdown
✅ CodeGenerator - 4.5s | 🪙 8,450 tokens

---

### 📊 Execution Summary

- **Total Time:** 4.5s
- **Total Tokens:** 8,450
- **Agents Executed:** 1/1 successful
```

### Architectural Rationale

With agents now able to orchestrate internally (see "Agents Can Call Agents" section), iterations became unnecessary:

1. **Agent self-orchestration** - Agents fetch all needed data in parallel
2. **Quality assurance** - Agents are responsible for their own output quality
3. **Single responsibility** - Each agent does one thing well, once
4. **Trust the LLM** - Modern LLMs can produce quality output without iteration

### Migration Notes

If you had custom code relying on iteration behavior:
- Remove any iteration counting logic
- Update tests that expected multiple executions
- Adjust quality threshold checks (no longer used)

The `maxIterations` and `qualityThreshold` fields in `IntentAnalysis` are now ignored.

---

## 2026-01-08: Enhanced Planner with Dynamic Agent Workflow Planning

### Overview
Upgraded the Planner agent to support **dynamic agent workflow planning**. The Planner can now intelligently decide whether to output code implementation subtasks OR recommend running additional agents to gather better context.

### New Capability

**Before:** Planner always output code subtasks
```json
{
  "goal": "Fix design inconsistencies",
  "subtasks": [...]  // Always code implementation tasks
}
```

**After:** Planner can choose from 3 plan types:

1. **`planType: "subtasks"`** - Traditional code implementation tasks (when context is sufficient)
2. **`planType: "agent-workflow"`** - Run more agents first (when context is insufficient or low quality)
3. **`planType: "hybrid"`** - Combination of both

### Example: Intelligent Re-analysis

If the Planner receives low-confidence design system mappings (e.g., < 60% confidence), it can now recommend:

```json
{
  "schemaVersion": "1.0",
  "goal": "Improve mapping quality before implementation",
  "planType": "agent-workflow",
  "reasoning": "Design system mapping confidence is low. Need to re-analyze.",
  "agentWorkflow": [
    {
      "agentName": "DesignSystemAnalyzer",
      "executionOrder": 1,
      "parallelGroup": 1,
      "dependencies": [],
      "rationale": "Re-analyze with focus on custom components"
    },
    {
      "agentName": "Planner",
      "executionOrder": 2,
      "parallelGroup": 2,
      "dependencies": ["DesignSystemAnalyzer"],
      "rationale": "Create implementation plan with updated mappings"
    }
  ]
}
```

The system will then execute those agents and the new Planner call will have better context!

### Files Changed

#### Modified Schemas
- `src/contracts/plan.ts`
  - Added `AgentWorkflowStepSchema` for workflow planning
  - Extended `PlanResultSchema` with:
    - `planType: 'subtasks' | 'agent-workflow' | 'hybrid'`
    - `agentWorkflow?: AgentWorkflowStep[]`
    - `reasoning?: string`

#### Modified Agents
- `src/agents/PlannerAgent.ts`
  - Updated description to include agent workflow capability
  - Type assertion for schema compatibility

- `src/agents/prompts/planner.md`
  - Completely rewritten to guide LLM on choosing plan type
  - Detailed examples for each plan type
  - Decision guidelines based on context quality

#### Modified Tasks
- `src/tasks/UnifiedFigmaTask.ts:317-371`
  - Added workflow execution logic in iterative refinement
  - Checks `planResult.planType` after Planner execution
  - If `agent-workflow`, executes those agents before continuing
  - Displays workflow progress to user

### Benefits

1. **Self-correcting system**: Planner can request better context when needed
2. **Adaptive execution**: System dynamically adjusts based on situation
3. **Better quality**: Won't try to implement with insufficient information
4. **Transparency**: Users see when and why additional agents are run

### User Experience

When Planner decides to run a workflow, users will see:

```markdown
### Iteration 1

**Planner Decision:** Design system mapping confidence is low (< 60%). Need to re-run analysis.
**Workflow:** DesignSystemAnalyzer → Planner

[Workflow] Executing DesignSystemAnalyzer...
✅ DesignSystemAnalyzer - 4.2s | 🪙 8,450 tokens

[Workflow] Executing Planner...
✅ Planner - 2.1s | 🪙 3,200 tokens

**Workflow completed.** Continuing to next iteration...
```

### Integration with User Intent

This complements the existing `IntentAnalyzer` which decides the initial agent flow based on user's command. Now:

- **IntentAnalyzer**: Decides initial agent workflow from user command/prompt
- **Planner**: Can dynamically adjust agent workflow during execution

### Testing Scenarios

1. **Low confidence mappings**: Planner should request DesignSystemAnalyzer re-run
2. **Very low quality score (<30)**: Planner might request Comparer re-run to verify
3. **Missing design context**: Planner could request FigmaAnalyzer with different settings
4. **Good context**: Planner should output normal subtasks

---

## 2026-01-08: Fixed Token Limit Error in Planner Agent

### Problem
The Planner agent was receiving too much context from previous agents (FigmaAnalyzer, DesignSystemAnalyzer, and Comparer), causing it to exceed the LLM token limit. The error occurred because:

1. The entire output from all previous agents was being passed as context
2. This included large nested data structures (UI part trees, mappings, diffs)
3. Trace events from all agents were included, which can be very large
4. Everything was JSON.stringified and sent directly to the LLM

### Solution
Created a context summarization system that:

1. **Removes trace events** - These are for debugging only and not needed for planning
2. **Summarizes UI part trees** - Instead of the full tree, we provide:
   - Root name and role
   - Total number of parts and max depth
   - Top-level parts only (not nested children)
   - Count of discovered cases
3. **Summarizes design system mappings** - Only includes:
   - Counts of mappings
   - High-confidence mappings (>= 0.8)
   - Gap summaries
4. **Summarizes compare results** - Only includes:
   - Score and diff count
   - High/medium severity diffs only
   - Next actions (which are already summaries)

### Files Changed

#### New File
- `src/agents/utils/contextSummarizer.ts`
  - `SummarizedContext` interface
  - `summarizeContextForPlanner()` function
  - Helper functions for summarizing each agent result type

#### Modified Files
- `src/agents/PlannerAgent.ts:11`
  - Changed `context: any` to `context: SummarizedContext`

- `src/agents/CodeGeneratorAgent.ts:12`
  - Changed `context: any` to `context: SummarizedContext`

- `src/tasks/UnifiedFigmaTask.ts:414-418, 425-429`
  - Imported and used `summarizeContextForPlanner()` in `buildAgentInput()`
  - Applied to both Planner and CodeGenerator cases

### Impact
- **Token reduction**: Context size reduced by ~80-90% (estimated)
- **No functionality loss**: All essential information for planning is retained
- **Improved reliability**: Prevents token limit errors in iterative refinement
- **Better performance**: Smaller context = faster LLM responses

### Testing
The fix should be tested with the iterative refinement flow (fit-and-finish) that was failing:
1. FigmaAnalyzer produces analysis
2. DesignSystemAnalyzer creates mappings
3. Comparer analyzes differences
4. **Planner receives summarized context** (previously failed here)
5. CodeGenerator receives summarized context

### Future Improvements
Consider:
- Adding configuration for summarization level (more/less detail)
- Implementing progressive summarization (more detail in first iteration, less in subsequent ones)
- Extending summarization to other agents if they face similar issues

---

## 2026-01-08: Fixed Comparer Agent Schema Validation and Orchestrate Mode Input Passing

### Problem
Two related issues were preventing the fit-and-finish workflow from executing correctly:

1. **Schema validation error**: The Comparer agent was receiving validation errors because the LLM was returning diffs with incorrect field structure (using `id`, `message`, `details`, `expected`, `actual` instead of the required `category`, `description`, `severity`, `figmaRefs`, `filePaths`)

2. **Missing orchestrate mode inputs**: When Comparer and CodeGenerator agents were configured with `orchestrate: true`, they weren't receiving the required `nodeId` and `designSystemPath` from the task input

### Solution

#### 1. Updated Comparer Prompt
Enhanced [src/agents/prompts/comparer.md](../src/agents/prompts/comparer.md) with explicit schema examples:

- Added detailed JSON format examples showing exact field names
- Included example for insufficient data case (empty diffs array)
- Clarified that `description` field is required for each diff
- Showed proper handling when Figma node is not selected

**Before:** LLM guessed at schema structure and created invalid diffs
**After:** LLM follows exact schema with proper field names

#### 2. Fixed Orchestrate Mode Input Passing
Updated [src/tasks/UnifiedFigmaTask.ts:577-610](../src/tasks/UnifiedFigmaTask.ts#L577-L610) in `buildAgentInput()` method:

**Comparer case:**
```typescript
case 'Comparer':
  // If orchestrate mode, pass nodeId and designSystemPath
  if (input.orchestrate) {
    input.nodeId = input.nodeId || taskInput.nodeId;
    input.designSystemPath = input.designSystemPath || taskInput.designSystemPath;
  } else {
    // Legacy mode: pass data directly
    input.figmaData = agentResults['FigmaAnalyzer']?.figmaAnalysis;
    input.implementationContext = { ... };
  }
  break;
```

**CodeGenerator case:**
```typescript
case 'CodeGenerator':
  // If orchestrate mode, pass nodeId and designSystemPath
  if (input.orchestrate) {
    input.nodeId = input.nodeId || taskInput.nodeId;
    input.designSystemPath = input.designSystemPath || taskInput.designSystemPath;
    input.goal = input.goal || taskInput.userPrompt || 'Generate code from design';
  } else {
    // Legacy mode: pass subtask and context
    input.subtask = plan?.subtasks?.[0] || { ... };
    input.context = summarizeContextForPlanner({ ... });
  }
  break;
```

### Impact

- **Comparer validation now passes**: LLM produces correctly structured diffs
- **Orchestrate mode works correctly**: Agents receive nodeId to fetch Figma data
- **Backward compatible**: Legacy mode (direct data passing) still works
- **User experience improved**: Fit-and-finish workflow executes successfully when Figma URL is provided

### Testing

To verify the fix works:
1. Provide a Figma URL with node-id in the fit-and-finish command
2. Verify Comparer agent successfully fetches Figma data (no "empty selection" error)
3. Verify Comparer output passes schema validation
4. Verify comparison results are displayed to user

---

## 2026-01-08: Added Debug Stream Output for Figma Data Fetching

### Problem
When using the fit-and-finish workflow with a Figma URL, it was difficult to debug whether:
1. The nodeId was being passed correctly through the task → Comparer → FigmaAnalyzer chain
2. The Figma design context was actually being fetched
3. The fetched data was empty or valid

The only way to see what was happening was through console.log statements in the developer console, which users couldn't easily access.

### Solution

#### 1. Added Stream Parameter to Agent Execute Methods
Updated [src/agents/base/Agent.ts:170](../src/agents/base/Agent.ts#L170) to pass `stream` to the `execute()` method:

```typescript
protected abstract execute(
  ctx: ExecutionContext,
  tools: ToolRegistry,
  input: I,
  stream?: StreamHandler  // NEW
): Promise<O>;
```

All agents now receive the stream parameter and can output user-visible debug information.

#### 2. Added Debug Output in FigmaAnalyzerAgent
Updated [src/agents/FigmaAnalyzerAgent.ts](../src/agents/FigmaAnalyzerAgent.ts) with user-visible debug output:

**When fetching Figma data:**
```markdown
🎨 Fetching Figma design context...
- Node ID: `9064:108146`
- Force Code: false

✅ Design Context Retrieved
- Length: 15420 characters
- Empty: No
- Preview: `<design-context>...</design-context>`
```

**If data is empty:**
```markdown
✅ Design Context Retrieved
- Length: 0 characters
- Empty: ⚠️ YES

⚠️ Warning: Design context is empty!
```

#### 3. Added Debug Output Throughout the Pipeline
Added console.log statements in:

**UnifiedFigmaTask ([src/tasks/UnifiedFigmaTask.ts](../src/tasks/UnifiedFigmaTask.ts)):**
- Task execution start: Shows input nodeId, userPrompt, designSystemPath
- Building Comparer input: Shows taskInput.nodeId being passed to input.nodeId

**ComparerAgent ([src/agents/ComparerAgent.ts](../src/agents/ComparerAgent.ts)):**
- Orchestrate mode start: Shows received nodeId and designSystemPath
- Before calling FigmaAnalyzer: Shows nodeId being passed
- After parallel fetch: Shows whether FigmaAnalyzer succeeded

**FigmaAnalyzerAgent ([src/agents/FigmaAnalyzerAgent.ts](../src/agents/FigmaAnalyzerAgent.ts)):**
- Input parameters: Shows received nodeId and forceCode
- After fetching: Shows whether data retrieval succeeded, length, and preview

### Files Changed

- [src/agents/base/Agent.ts](../src/agents/base/Agent.ts#L170) - Added stream parameter to execute method signature
- [src/agents/FigmaAnalyzerAgent.ts](../src/agents/FigmaAnalyzerAgent.ts) - Added stream output for Figma data fetching
- [src/agents/ComparerAgent.ts](../src/agents/ComparerAgent.ts) - Added console.log for orchestrate mode
- [src/tasks/UnifiedFigmaTask.ts](../src/tasks/UnifiedFigmaTask.ts) - Added console.log for input tracking
- All other agents - Updated execute signature to include stream parameter

### Impact

- **Better debuggability**: Users can see in real-time whether Figma data is being fetched
- **Easier troubleshooting**: Clear indication when nodeId is missing or data is empty
- **No breaking changes**: Stream parameter is optional, backward compatible

### Testing

To verify the debug output:
1. Run fit-and-finish with a Figma URL containing node-id
2. Check the chat output for the debug messages from FigmaAnalyzer
3. Verify console.log output shows the data flow from Task → Comparer → FigmaAnalyzer
4. If data is empty, warning messages should appear

---

# Agent流程Stream功能更新

## 变更摘要

为Helix系统添加了实时agent执行流程跟踪和可视化功能。agents现在可以在执行过程中通过stream实时报告其进度状态。

## 修改的文件

### 1. `/src/runtime/StreamHandler.ts`

**新增类型定义:**
- `AgentPhase`: Agent执行阶段类型
- `AgentFlowEvent`: Agent流程事件接口

**新增方法:**
- `agentStart()`: 报告agent启动
- `agentProgress()`: 报告agent执行进度
- `agentComplete()`: 报告agent完成
- `agentError()`: 报告agent错误
- `displayAgentFlow()`: 显示agent执行流程可视化
- `getAgentFlowEvents()`: 获取所有流程事件
- `clearAgentFlow()`: 清除流程事件

**内部状态:**
- `agentFlowEvents`: 存储所有agent流程事件
- `currentAgentStartTime`: 跟踪每个agent的启动时间

### 2. `/src/agents/base/Agent.ts`

**方法签名更新:**
```typescript
// Before
run(ctx: ExecutionContext, tools: ToolRegistry, input: I): Promise<O>

// After
run(ctx: ExecutionContext, tools: ToolRegistry, input: I, stream?: StreamHandler): Promise<O>
```

**自动进度报告:**
BaseAgent的run方法现在在以下时机自动报告进度：
- Agent启动时
- 输入验证时
- 执行agent逻辑时
- 输出验证时
- 完成或错误时

### 3. `/src/tasks/UnifiedFigmaTask.ts`

**更新:**
- `executeAgent()` 方法新增 `stream?: StreamHandler` 参数
- 所有agent执行调用现在都传递stream参数
- 在 `executeBuildPipeline()` 和 `executeIterativeRefinement()` 结束时调用 `stream.displayAgentFlow()`
- 修复了 `qualityThreshold` 字段的类型定义问题

### 4. `/ARCHITECTURE.md`

**更新:**
- 在Runtime Layer部分添加了StreamHandler的详细文档
- 说明了新增的agent流程跟踪功能

### 5. 新增文档

**`/docs/agent-flow-streaming.md`**
- 完整的功能说明文档
- 使用示例和输出示例
- 技术细节和实现说明
- 向后兼容性说明

## 功能特性

### 实时进度报告

agents在执行过程中会实时报告：
1. 启动状态
2. 输入验证进度
3. 执行逻辑进度
4. 输出验证进度
5. 完成或错误状态

### 可视化展示

执行完成后，用户会看到：

```markdown
### 🔄 Agent Execution Flow

✅ **FigmaAnalyzer** (3.45s)
  ↳ Validating input
  ↳ Executing agent logic
  ↳ Validating output

✅ **DesignSystemAnalyzer** (2.10s)
  ↳ Validating input
  ↳ Executing agent logic
  ↳ Validating output
```

### Metrics展示

保留了原有的metrics显示功能，并增强了可读性：

```markdown
✅ **FigmaAnalyzer** - 3.45s | 🪙 1,234 tokens
✅ **DesignSystemAnalyzer** - 2.10s | 🪙 856 tokens

---

### 📊 Execution Summary

- **Total Time:** 11.65s
- **Total Tokens:** 4,958
- **Agents Executed:** 4/4 successful
```

## 向后兼容性

所有更改都保持向后兼容：

- `stream` 参数在 `Agent.run()` 中是**可选的**
- 如果不传递stream，agents仍然正常工作
- 现有调用agents的代码无需修改即可运行
- 原有的metrics功能完全保留

## 并行执行支持

当多个agents并行执行时，每个agent都会独立跟踪和报告其进度，用户可以看到并行执行的实时状态。

## 测试建议

1. 运行build-from-figma命令测试顺序执行流程
2. 运行fit-and-finish命令测试迭代执行流程
3. 验证并行agent执行时的进度显示
4. 测试agent失败时的错误报告
5. 检查最终的flow可视化和metrics摘要

## 未来改进方向

1. 添加进度百分比支持
2. 实现可取消的长时间运行操作
3. 提供详细日志模式
4. 增强性能分析功能
5. 添加图形化执行流程图
