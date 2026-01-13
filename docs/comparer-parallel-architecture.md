# ComparerAgent 并行架构设计

## 概述

ComparerAgent 已经重构为支持细粒度的并行比较，通过将 Figma UI 组件与 Design System 的不同维度（domains）进行交叉比较，大幅提升比较的准确性和性能。

## 架构设计

### 任务拆分策略

原有架构：单个 LLM 调用处理所有数据
```
Figma Data + Design System + Code → LLM → Result
```

新架构：矩阵式并行处理
```
UI Component 1 × Domain A → LLM → Result 1
UI Component 1 × Domain B → LLM → Result 2
UI Component 2 × Domain A → LLM → Result 3
UI Component 2 × Domain B → LLM → Result 4
...
↓
Merge All Results → Final Result
```

### 任务拆分逻辑

1. **提取 UI 组件**
   - 从 `figmaData.root.children` 中提取所有子组件
   - 如果没有子组件，使用 `root` 本身

2. **提取设计维度**
   - 从 `designSystem.domains` 中提取所有设计域
   - 每个 domain 代表一个设计维度（如 colors, typography, spacing 等）
   - 如果没有 domains，创建一个通用的 "general" 维度

3. **创建任务矩阵**
   - 对每个 UI 组件和每个设计域的组合创建一个独立的比较任务
   - 任务总数 = UI 组件数 × 设计域数

### 并行执行

使用 `Promise.all` 同时执行所有比较任务：

```typescript
const taskResults = await Promise.all(
  tasks.map(task => this.compareTask(ctx, tools, task, codeFiles, stream))
);
```

每个任务独立进行：
- 独立的 LLM 调用
- 独立的错误处理（失败不影响其他任务）
- 实时进度反馈

### 结果合并策略

1. **分数计算**
   - 计算所有任务结果的平均分数
   - `avgScore = round(sum(scores) / taskCount)`

2. **差异合并**
   - 收集所有任务的差异（diffs）
   - 保留所有差异信息，不去重

3. **行动建议合并**
   - 收集所有任务的 nextActions
   - 通过 title 去重（避免重复建议）

4. **追踪信息合并**
   - 合并所有任务的 trace 事件

## 数据结构

### ComparisonTask

```typescript
interface ComparisonTask {
  uiPart: UIPart;           // 要比较的 UI 组件
  domain: DesignDomain | null;  // 要比较的设计域
  domainName: string;        // 域名称（如 "colors", "typography"）
  taskId: string;            // 唯一任务 ID："uiPartId-domainName"
}
```

### 示例

假设有：
- 2 个 UI 组件：Button, Input
- 3 个设计域：colors, typography, spacing

将创建 6 个并行任务：
1. Button × colors
2. Button × typography
3. Button × spacing
4. Input × colors
5. Input × typography
6. Input × spacing

## 优势

### 1. 性能提升
- 所有比较任务并行执行
- 时间复杂度从 O(n) 降低到 O(1)（假设无限并发）

### 2. 更精细的比较
- 每个任务聚焦于特定的设计维度
- LLM 可以更专注地分析特定方面
- 减少上下文混淆

### 3. 更好的可扩展性
- 易于添加新的设计维度
- 易于调整拆分粒度

### 4. 容错性
- 单个任务失败不影响其他任务
- 部分结果总比完全失败好

### 5. 实时反馈
- 每个任务完成后立即显示进度
- 用户可以看到详细的比较进度

## 实时输出示例

```markdown
### Comparing 3 UI components × 4 design domains (12 tasks in parallel)...

- ✓ Button × colors: 85/100
- ✓ Button × typography: 90/100
- ✓ Button × spacing: 88/100
- ✓ Button × layout: 92/100
- ✓ Input × colors: 80/100
- ✓ Input × typography: 85/100
- ✓ Input × spacing: 87/100
- ✓ Input × layout: 89/100
- ✓ Modal × colors: 78/100
- ✓ Modal × typography: 82/100
- ✓ Modal × spacing: 85/100
- ✓ Modal × layout: 88/100

### Comparison Analysis (Score: 86/100)

#### Key Differences
- 🔴 **color**: Button background uses #FF0000 instead of theme primary color
- 🟡 **typography**: Input font size is 14px, design system specifies 16px
...
```

## 未来优化方向

1. **智能分组**
   - 根据相关性将某些任务分组
   - 相关任务共享上下文以提高准确性

2. **优先级排序**
   - 先执行高优先级的比较任务
   - 低优先级任务可选择性跳过

3. **缓存机制**
   - 缓存重复的比较结果
   - 减少冗余的 LLM 调用

4. **增量比较**
   - 只比较发生变化的部分
   - 提高响应速度

5. **自适应并发控制**
   - 根据系统负载动态调整并发数
   - 避免 API 限流

## 兼容性

- 向后兼容：如果 Design System 没有 domains，退化为单维度比较
- 如果 Figma 没有子组件，将 root 作为单个组件处理
- 错误容错：任何任务失败都会返回空结果而不是抛出异常
