# Helix 多 Agent 架构 - 快速开始指南

## 🚀 快速开始

### 使用 fit-finish 命令

检查 Figma 设计与代码的一致性：

```typescript
@helix /fit-finish https://figma.com/file/YOUR_FILE_KEY
```

**工作流程**:
1. 自动获取 Figma 设计数据
2. 生成设计系统指南（含 tokens）
3. LLM 分析并生成执行计划
4. 并行执行多个维度检查
5. 输出一致性报告

### 使用 gen-code 命令

从 Figma 设计生成高质量代码：

```typescript
@helix /gen-code https://figma.com/file/YOUR_FILE_KEY

// 系统会自动从 design-system-guide.md 中检测项目使用的框架
// 例如：SwiftUI, React, Vue, Angular, Svelte

// 也可以在命令中明确指定框架（会覆盖自动检测结果）
@helix /gen-code https://figma.com/file/YOUR_FILE_KEY use Vue
@helix /gen-code https://figma.com/file/YOUR_FILE_KEY use SwiftUI
```

**工作流程**:
1. 获取 Figma 设计数据
2. 分析组件结构
3. 生成代码脚手架
4. 细化样式和交互
5. 优化代码（性能 + 可访问性）
6. 输出高质量代码 + 质量报告

## 📁 项目结构

```
src/agents/
├── base/                    # 基础架构
│   ├── types.ts            # 核心类型定义
│   ├── BaseAgent.ts        # Agent 基类
│   ├── AgentRegistry.ts    # Agent 注册表
│   └── DynamicAgentFactory.ts
│
├── dimensions/              # 维度检查 Agents
│   ├── configs/            # 维度配置
│   ├── utils/              # 工具类
│   │   ├── extractors/    # 提取器
│   │   ├── comparators/   # 对比器
│   │   └── normalizers/   # 规范化器
│   ├── ToolDrivenConsistencyAgent.ts  # 统一工具驱动 Agent
│   ├── SemanticConsistencyAgent.ts    # 语义检查
│   ├── LayoutConsistencyAgent.ts      # 布局检查
│   └── AccessibilityAgent.ts          # 可访问性检查
│
├── codegen/                 # 代码生成 Agents
│   ├── ComponentAnalyzerAgent.ts      # 组件结构分析
│   ├── CodeScaffoldAgent.ts           # 代码脚手架
│   ├── StyleRefinerAgent.ts           # 样式细化
│   └── CodeOptimizerAgent.ts          # 代码优化
│
├── planner/                 # 执行计划
│   ├── ExecutionPlan.ts
│   └── PlannerAgent.ts     # 动态计划生成
│
├── orchestrator/            # 编排器
│   ├── DynamicOrchestrator.ts         # 动态编排
│   └── ResultAggregator.ts            # 结果聚合
│
├── domain/                  # 领域 Agents
│   └── DesignSystemAgent.ts           # 设计系统生成
│
├── tasks/                   # 任务 Agents
│   ├── FitFinishAgent.ts              # 一致性检查
│   └── CodeGenerationAgent.ts         # 代码生成
│
├── dynamic/                 # 动态 Agents
│   ├── LLMDrivenAgent.ts
│   └── ToolDrivenAgent.ts
│
└── AgentBootstrap.ts        # 启动器
```

## 🔧 如何扩展

### 添加新的维度检查（工具模式）

1. 创建配置文件:

```typescript
// src/agents/dimensions/configs/icon.config.ts
export const iconDimensionConfig: DimensionConfig = {
  name: 'icon',
  description: 'Icon consistency check',
  extractor: {
    type: 'token',
    tokenPath: 'tokens.icon'
  },
  comparator: {
    type: 'exact'
  }
};
```

2. 添加到配置列表:

```typescript
// src/agents/dimensions/configs/index.ts
export { iconDimensionConfig } from './icon.config';

export const allDimensionConfigs: DimensionConfig[] = [
  // ... existing configs
  iconDimensionConfig
];
```

### 添加新的维度检查（LLM 模式）

```typescript
// src/agents/dimensions/MotionConsistencyAgent.ts
export class MotionConsistencyAgent extends BaseAgent {
  name = 'motion-consistency';
  executionMode = 'llm';

  async execute(input: AgentInput) {
    const prompt = `Check animation consistency...`;
    const result = await this.callLLM(prompt, input.context);
    return { success: true, data: result };
  }
}

// 在 AgentBootstrap.ts 中注册
this.registry.register('motion-consistency', new MotionConsistencyAgent());
```

### 添加新的代码生成阶段

```typescript
// src/agents/codegen/CodeReviewAgent.ts
export class CodeReviewAgent extends BaseAgent {
  name = 'code-review';
  executionMode = 'llm';

  async execute(input: AgentInput) {
    // 审查代码并提供改进建议
  }
}

// 在 CodeGenerationAgent 中添加
const reviewResult = await codeReviewAgent.execute({
  data: { optimizedCode },
  context: input.context
});
```

## 🎯 关键概念

### Agent

基本执行单元，每个 Agent 负责特定任务。

```typescript
interface Agent {
  name: string;
  description: string;
  executionMode: 'llm' | 'tool';
  execute(input: AgentInput): Promise<AgentOutput>;
}
```

### ExecutionPlan

动态生成的执行计划，包含维度、依赖关系和并行组。

```typescript
interface ExecutionPlan {
  dimensions: DimensionTask[];        // 要执行的任务
  dependencies: Map<string, string[]>; // 依赖关系
  parallelGroups: DimensionTask[][];   // 并行执行组
}
```

### DimensionConfig

维度配置，定义如何检查特定维度。

```typescript
interface DimensionConfig {
  name: string;
  extractor: ExtractorConfig;   // 如何提取数据
  comparator: ComparatorConfig;  // 如何对比
  normalizer?: NormalizerConfig; // 如何规范化
}
```

## 📊 性能提示

### fit-finish 优化

- **使用 tokens**: 如果设计系统有结构化 tokens，工具模式更快
- **减少维度**: 只检查必要的维度
- **缓存设计系统**: 避免重复生成

### gen-code 优化

- **明确框架**: 指定目标框架可以生成更精确的代码
- **简化设计**: 复杂设计可能需要更多时间
- **复用组件**: 将常用组件抽象到设计系统

## 🐛 调试技巧

### 查看执行计划

执行 fit-finish 时，会显示生成的执行计划：

```
## 执行计划
- 检查维度: 6
- 并行组: 2
- 预估时间: 4.5s

**并行组 1:**
  - 🔧 Tool Color Consistency Check
  - 🔧 Tool Typography Consistency Check
```

### 查看 Agent 输出

每个 Agent 的进度和输出都会实时显示在 VSCode Chat 中。

### 检查质量评分

gen-code 完成后会显示详细的质量评分：

```
### 质量评分
- 🎯 整体得分: 92/100
- ♿ 可访问性: 95/100
- ⚡ 性能: 88/100
- 🛠️ 可维护性: 92/100
```

## 📚 深入阅读

- **fit-finish 详细文档**: [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)
- **gen-code 详细文档**: [GEN_CODE_IMPLEMENTATION.md](GEN_CODE_IMPLEMENTATION.md)
- **完整总结**: [FINAL_SUMMARY.md](FINAL_SUMMARY.md)

## ❓ 常见问题

### Q: fit-finish 和 gen-code 的区别？

**A**:
- `fit-finish`: 检查现有代码与 Figma 设计的一致性
- `gen-code`: 从 Figma 设计生成新的代码

### Q: 支持哪些框架？

**A**: 目前支持：
- React (默认)
- Vue 3
- Angular
- Svelte

### Q: 如何提高代码生成质量？

**A**:
1. 确保 Figma 设计完整且规范
2. 提供详细的设计系统指南
3. 使用设计系统 tokens
4. 明确指定目标框架

### Q: 执行时间多长？

**A**:
- fit-finish: 3-6 秒
- gen-code: 8-15 秒（取决于组件复杂度）

### Q: 成本如何？

**A**:
- 相比单次大型 LLM 调用，Token 消耗降低 40-50%
- 每次 fit-finish: ~3-6K tokens
- 每次 gen-code: ~8-12K tokens

## 🎉 开始使用

现在你已经了解了 Helix 多 Agent 架构的基础知识，可以开始使用了：

```typescript
// 1. 检查设计一致性
@helix /fit-finish https://figma.com/file/YOUR_FILE

// 2. 生成代码
@helix /gen-code https://figma.com/file/YOUR_FILE

// 3. 查看帮助
@helix
```

祝使用愉快！🚀
