# Agent-Level Token and Time Tracking

**Date**: 2026-01-08

## Overview

Added comprehensive agent-level metrics tracking to monitor execution time and token usage for each agent execution. This provides visibility into performance and cost for every agent in the pipeline.

## Features

### 1. Automatic Time Tracking
- **Start Time**: Recorded when agent execution begins
- **End Time**: Recorded when agent execution completes
- **Duration**: Calculated in milliseconds and displayed in seconds

### 2. Token Usage Estimation
- **Prompt Tokens**: Estimated from input message length (~4 chars per token)
- **Completion Tokens**: Estimated from response length (~4 chars per token)
- **Total Tokens**: Sum of prompt and completion tokens

### 3. Real-time Display
After each agent completes, metrics are displayed in the chat interface:

```
✅ **FigmaAnalyzer** - 3.45s | 🪙 2,341 tokens
✅ **DesignSystemAnalyzer** - 2.10s | 🪙 1,823 tokens
✅ **CodeGenerator** - 5.67s | 🪙 4,512 tokens
```

### 4. Execution Summary
At the end of task execution, a summary is displayed:

```
---

### 📊 Execution Summary

- **Total Time:** 11.22s
- **Total Tokens:** 8,676
- **Agents Executed:** 3/3 successful
```

## Implementation

### New Contracts

Added to [src/contracts/common.ts](../../src/contracts/common.ts):

```typescript
export const TokenUsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
});

export const AgentMetricsSchema = z.object({
  agentName: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  durationMs: z.number(),
  tokenUsage: TokenUsageSchema.optional(),
  success: z.boolean(),
  error: z.string().optional(),
});
```

### ExecutionContext Extensions

Added to [src/runtime/ExecutionContext.ts](../../runtime/ExecutionContext.ts):

```typescript
// Track metrics for all agents
private _agentMetrics: AgentMetrics[] = [];
private _currentTokenUsage: TokenUsage | undefined;

// Methods
addAgentMetrics(metrics: AgentMetrics): void
getAgentMetrics(): AgentMetrics[]
setTokenUsage(usage: TokenUsage): void
getTokenUsage(): TokenUsage | undefined
resetTokenUsage(): void
getTotalTokenUsage(): TokenUsage
```

### LLMService Token Capture

Updated [src/services/llmService.ts](../../services/llmService.ts):

```typescript
// Estimate token usage (rough approximation: ~4 chars per token)
const estimatedPromptTokens = Math.ceil(
  messages.reduce((sum, msg) => {
    const msgContent = typeof msg.content === 'string'
      ? msg.content
      : JSON.stringify(msg.content);
    return sum + msgContent.length;
  }, 0) / 4
);
const estimatedCompletionTokens = Math.ceil(content.length / 4);

ctx.setTokenUsage({
  promptTokens: estimatedPromptTokens,
  completionTokens: estimatedCompletionTokens,
  totalTokens: estimatedPromptTokens + estimatedCompletionTokens,
});
```

### BaseAgent Integration

Updated [src/agents/base/Agent.ts](../../agents/base/Agent.ts):

```typescript
async run(ctx: ExecutionContext, tools: ToolRegistry, input: I): Promise<O> {
  const startTime = Date.now();
  ctx.resetTokenUsage();

  try {
    const output = await this.execute(ctx, tools, input);

    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const tokenUsage = ctx.getTokenUsage();

    // Record metrics
    ctx.addAgentMetrics({
      agentName: this.name,
      startTime,
      endTime,
      durationMs,
      tokenUsage,
      success: true,
    });

    return output;
  } catch (err) {
    // Record failure metrics
    ctx.addAgentMetrics({
      agentName: this.name,
      startTime,
      endTime: Date.now(),
      durationMs: Date.now() - startTime,
      tokenUsage: ctx.getTokenUsage(),
      success: false,
      error: (err as Error).message,
    });

    throw err;
  }
}
```

### StreamHandler Display Methods

Added to [src/runtime/StreamHandler.ts](../../runtime/StreamHandler.ts):

```typescript
/**
 * Display agent metrics in a formatted way
 */
displayAgentMetrics(metrics: AgentMetrics): void {
  const durationSec = (metrics.durationMs / 1000).toFixed(2);
  const status = metrics.success ? '✅' : '❌';

  let metricsLine = `${status} **${metrics.agentName}** - ${durationSec}s`;

  if (metrics.tokenUsage) {
    const totalTokens = metrics.tokenUsage.totalTokens.toLocaleString();
    metricsLine += ` | 🪙 ${totalTokens} tokens`;
  }

  if (metrics.error) {
    metricsLine += ` | Error: ${metrics.error}`;
  }

  this.markdown(metricsLine + '\n');
}

/**
 * Display summary of all agent metrics
 */
displayMetricsSummary(allMetrics: AgentMetrics[]): void {
  if (allMetrics.length === 0) {
    return;
  }

  const totalDurationMs = allMetrics.reduce((sum, m) => sum + m.durationMs, 0);
  const totalTokens = allMetrics.reduce((sum, m) => sum + (m.tokenUsage?.totalTokens || 0), 0);
  const successCount = allMetrics.filter(m => m.success).length;

  this.markdown('\n---\n\n');
  this.markdown('### 📊 Execution Summary\n\n');
  this.markdown(`- **Total Time:** ${(totalDurationMs / 1000).toFixed(2)}s\n`);
  this.markdown(`- **Total Tokens:** ${totalTokens.toLocaleString()}\n`);
  this.markdown(`- **Agents Executed:** ${successCount}/${allMetrics.length} successful\n`);
  this.markdown('\n');
}
```

### UnifiedFigmaTask Integration

Updated [src/tasks/UnifiedFigmaTask.ts](../../tasks/UnifiedFigmaTask.ts):

- Display metrics after each sequential agent execution
- Display metrics after parallel agent execution
- Display summary at the end of both build and iterative refinement pipelines

## Usage Example

When running `/gen-code` or `/fit-finish`:

```
## Building from Figma Design

Analyzing Intent
**Intent:** Build UI components from Figma design
**Selected Agents:** FigmaAnalyzer → DesignSystemAnalyzer → CodeGenerator

✅ **FigmaAnalyzer** - 3.45s | 🪙 2,341 tokens
✅ **DesignSystemAnalyzer** - 2.10s | 🪙 1,823 tokens
✅ **CodeGenerator** - 5.67s | 🪙 4,512 tokens

---

### 📊 Execution Summary

- **Total Time:** 11.22s
- **Total Tokens:** 8,676
- **Agents Executed:** 3/3 successful

## Summary

Generated 5 file changes using 3 agents
```

## Benefits

1. **Performance Monitoring**: Track which agents take the most time
2. **Cost Estimation**: Monitor token usage to estimate API costs
3. **Debugging**: Identify slow or failing agents quickly
4. **Transparency**: Users see exactly what's happening and how long it takes
5. **Optimization**: Data-driven insights for improving agent performance

## Token Estimation Accuracy

The token estimation uses a simple heuristic of ~4 characters per token:
- **Reasonable for**: English text, code
- **Less accurate for**: Special characters, non-English languages
- **Purpose**: Rough cost estimation, not billing

For exact token counts, the VSCode LM API would need to expose usage statistics, which is currently not available.

## Future Enhancements

1. **Exact Token Counting**: If VSCode API exposes token usage
2. **Cost Calculation**: Convert tokens to estimated costs based on model
3. **Performance Trends**: Track metrics across multiple runs
4. **Optimization Hints**: Suggest which agents could be optimized
5. **Export Metrics**: Save metrics to file for analysis

## Files Modified

- [src/contracts/common.ts](../../src/contracts/common.ts) - Added TokenUsage and AgentMetrics schemas
- [src/runtime/ExecutionContext.ts](../../runtime/ExecutionContext.ts) - Added metrics tracking
- [src/services/llmService.ts](../../services/llmService.ts) - Added token estimation
- [src/agents/base/Agent.ts](../../agents/base/Agent.ts) - Integrated metrics recording
- [src/runtime/StreamHandler.ts](../../runtime/StreamHandler.ts) - Added display methods
- [src/tasks/UnifiedFigmaTask.ts](../../tasks/UnifiedFigmaTask.ts) - Display metrics after each agent
- [src/participants/TaskOrchestrator.ts](../../participants/TaskOrchestrator.ts) - Fixed schema issues
