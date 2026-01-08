# Agent Flow Streaming

## 概述

为Helix架构添加了实时的agent执行流程跟踪和可视化功能。现在agents在执行过程中会通过stream报告其进度，用户可以实时看到每个agent的执行状态。

## 新增功能

### 1. StreamHandler增强

在 `src/runtime/StreamHandler.ts` 中添加了以下新功能：

#### 新增类型定义

```typescript
export type AgentPhase = 'starting' | 'executing' | 'validating' | 'complete' | 'error';

export interface AgentFlowEvent {
  agentName: string;
  phase: AgentPhase;
  message?: string;
  timestamp: number;
  metadata?: any;
}
```

#### 新增方法

- **`agentStart(agentName: string, message?: string)`**: 报告agent开始执行
- **`agentProgress(agentName: string, phase: 'executing' | 'validating', message?: string)`**: 报告agent执行进度
- **`agentComplete(agentName: string, metrics?: AgentMetrics)`**: 报告agent执行完成
- **`agentError(agentName: string, error: string | Error)`**: 报告agent执行错误
- **`displayAgentFlow()`**: 显示agent执行流程的可视化时间线
- **`getAgentFlowEvents()`**: 获取所有agent流程事件
- **`clearAgentFlow()`**: 清除agent流程事件

### 2. BaseAgent集成

在 `src/agents/base/Agent.ts` 中更新了BaseAgent以支持stream：

#### 方法签名更新

```typescript
// Before
run(ctx: ExecutionContext, tools: ToolRegistry, input: I): Promise<O>

// After
run(ctx: ExecutionContext, tools: ToolRegistry, input: I, stream?: StreamHandler): Promise<O>
```

#### 自动进度报告

BaseAgent的run方法现在会自动报告以下阶段：
1. **启动**: 当agent开始执行时
2. **输入验证**: 验证输入数据时
3. **执行中**: 执行agent逻辑时
4. **输出验证**: 验证输出数据时
5. **完成**: agent成功完成时（包含metrics）
6. **错误**: agent执行失败时

### 3. UnifiedFigmaTask更新

在 `src/tasks/UnifiedFigmaTask.ts` 中更新了task以传递stream给agents：

- 所有agent执行调用现在都传递stream参数
- 在任务完成时调用 `displayAgentFlow()` 显示完整的执行流程
- 保持原有的metrics显示功能

## 使用示例

### 执行流程输出示例

```markdown
## Analyzing Intent

**Intent:** Build UI from Figma design
**Selected Agents:** FigmaAnalyzer → DesignSystemAnalyzer → Planner → CodeGenerator
**Reasoning:** User wants to build new UI components from Figma

## Building from Figma

✅ **FigmaAnalyzer** - 3.45s | 🪙 1,234 tokens
✅ **DesignSystemAnalyzer** - 2.10s | 🪙 856 tokens
✅ **Planner** - 1.87s | 🪙 723 tokens
✅ **CodeGenerator** - 4.23s | 🪙 2,145 tokens

### 🔄 Agent Execution Flow

✅ **FigmaAnalyzer** (3.45s)
  ↳ Validating input
  ↳ Executing agent logic
  ↳ Validating output

✅ **DesignSystemAnalyzer** (2.10s)
  ↳ Validating input
  ↳ Executing agent logic
  ↳ Validating output

✅ **Planner** (1.87s)
  ↳ Executing agent logic
  ↳ Validating output

✅ **CodeGenerator** (4.23s)
  ↳ Executing agent logic
  ↳ Validating output

---

### 📊 Execution Summary

- **Total Time:** 11.65s
- **Total Tokens:** 4,958
- **Agents Executed:** 4/4 successful
```

## 技术细节

### Agent执行流程

1. **Task开始** → 创建StreamHandler
2. **Agent启动** → `stream.agentStart(name)` 被调用
3. **输入验证** → `stream.agentProgress(name, 'validating', 'Validating input')`
4. **执行逻辑** → `stream.agentProgress(name, 'executing', 'Executing agent logic')`
5. **输出验证** → `stream.agentProgress(name, 'validating', 'Validating output')`
6. **完成/错误** → `stream.agentComplete(name, metrics)` 或 `stream.agentError(name, error)`

### 并行执行支持

当多个agents并行执行时，每个agent都会独立报告其进度：

```typescript
const results = await Promise.all(
  group.map(plan =>
    this.executeAgent(plan, agentResults, ctx, tools, artifacts, input, stream)
  )
);
```

每个agent的进度会实时显示，用户可以看到并行执行的效果。

### 数据结构

AgentFlowEvent存储在StreamHandler中，包含：
- `agentName`: Agent的名称
- `phase`: 当前执行阶段
- `message`: 可选的进度消息
- `timestamp`: 事件时间戳
- `metadata`: 可选的元数据（如metrics）

## 向后兼容性

所有更改都是向后兼容的：

- `stream`参数在Agent.run()中是可选的
- 如果不传递stream，agents仍然正常工作，只是不会报告进度
- 现有的metrics显示功能保持不变

## 未来改进

可能的未来增强：

1. **进度百分比**: 添加对长时间运行任务的百分比进度支持
2. **可取消操作**: 在UI中添加取消按钮
3. **详细日志**: 可选的详细执行日志模式
4. **性能分析**: 更详细的性能指标和瓶颈分析
5. **可视化图表**: 添加图形化的执行流程图
