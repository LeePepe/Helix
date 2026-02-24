# Helix Skill Pack 架构总览

## 目录结构

```
helix-skill/
├── helix/                          # 主路由 Skill + 共享资源
│   ├── SKILL.md                    # 路由入口，分发到三个子 Skill
│   ├── agents/
│   │   └── openai.yaml             # Agent 接口配置
│   ├── references/                 # 子流程 Prompt 与参考文档
│   │   ├── mcp-precheck.md         # Figma MCP 可用性预检
│   │   ├── figma-input.md          # Figma 输入格式说明
│   │   ├── figma-collector.md      # Figma 上下文采集器
│   │   ├── design-system-analyzer.md        # 设计系统指南加载/摘要
│   │   ├── design-system-figma-rules.md     # 从 Figma 获取设计系统规则
│   │   ├── design-system-codebase-analysis.md # 代码库设计系统模式分析
│   │   ├── design-system-rules-prompt.md    # Design System Init 编排器
│   │   ├── code-analyzer.md        # 代码 UI 属性提取
│   │   ├── code-generator.md       # 代码生成器
│   │   ├── comparer.md             # Figma ↔ Code 比较器
│   │   ├── fit-finish.md           # Fit-Finish 编排器
│   │   └── gen-code.md             # Gen-Code 编排器
├── helix-design-system-init/       # 子 Skill: 设计系统初始化
│   └── SKILL.md
├── helix-fit-finish/               # 子 Skill: 适配度检查
│   └── SKILL.md
└── helix-gen-code/                 # 子 Skill: 代码生成
    └── SKILL.md
```

---

## 整体架构

```
用户请求
  │
  ▼
helix/SKILL.md (路由)
  │
  ├─ MCP 预检 (mcp-precheck.md)
  │
  ├──▶ helix-fit-finish    → Figma vs Code 适配度对比
  ├──▶ helix-gen-code       → 从 Figma 生成生产级代码
  └──▶ helix-design-system-init → 生成 .github/design-system-guide.md
```

路由 Skill 根据用户意图将请求分发到三个专用子 Skill。所有工作流都依赖 **Figma MCP** 和一个集中的 **设计系统指南** (`.github/design-system-guide.md`)。

---

## 与 src (Chat Extension) 的对照关系

Skill Pack 是 `src/` 中 Chat Extension 架构到 Agent Code Skill 环境的迁移。下表展示对应关系：

| src 中的组件 | Skill Pack 对应 | 关键差异 |
|---|---|---|
| `IntentAnalyzerAgent.ts` | helix/SKILL.md (路由) | src 用 LLM 做 intent 分析；Skill 靠路由关键词 |
| `FigmaAnalyzerAgent.ts` (调 MCP) | `figma-collector.md` | src 直接调 `figmaService.ts`；Skill 需手动调 MCP tool |
| `DesignSystemAnalyzerAgent.ts` | `design-system-analyzer.md` | src 用 LLM 动态发现 domain；Skill 同样动态发现 |
| `CodeAnalyzerAgent.ts` | `code-analyzer.md` | 基本对齐 |
| `ComparerAgent.ts` | `comparer.md` | src 做 UIPart × Domain 笛卡尔积并行；Skill 是扁平比较 |
| `CodeGeneratorAgent.ts` | `code-generator.md` | 基本对齐 (BUILD/FIX 双模式) |
| `PlannerAgent.ts` | 无对应 | src 有独立 Planner 做实现计划，Skill 未实现 |
| `UnifiedFigmaTask.ts` | `fit-finish.md` / `gen-code.md` | src 是统一编排器；Skill 拆成两个独立编排器 |
| `commandPresets.ts` | 各 SKILL.md 中的 pipeline 定义 | 对齐 |

---

## 核心概念

### 1. 设计域 (Design Domains) — 动态发现

**src 中的做法** (`DesignSystemAnalyzerAgent.ts:249-334`):

Domain 不是硬编码的。`DesignSystemAnalyzerAgent` 用 LLM 分析 design-system-guide.md 的内容，**动态发现**项目实际使用的所有域：

```
Design System Guide (markdown)
         │
         ▼
  LLM: "Identify ALL design domains present in this documentation.
        Do NOT limit yourself to predefined domains."
         │
         ▼
  动态域列表，例如:
  ┌────────────────────────────────────────┐
  │ colors, typography, spacing, layout,   │
  │ effects, iconography, motion, ...      │
  └────────────────────────────────────────┘
```

每个域包含 `{ name, description, tokens }` 结构。下游的 Comparer 和 CodeGenerator 按这些动态域工作。

### 2. Intent 分析与 Focus Areas

**src 中的做法** (`IntentAnalyzerAgent.ts:91-208`):

1. LLM 分析用户 prompt，判断意图
2. 从 prompt 中提取 **focusAreas**（如 "typography, colors"）
3. focusAreas 贯穿整个 pipeline，每个 Agent 都据此过滤工作范围
4. `ComparerAgent.splitIntoTasks()` 用 focusAreas 过滤 domain 列表

### 3. 设计系统指南

位于 `.github/design-system-guide.md`，是所有工作流的核心参考：
- 由 `helix-design-system-init` 生成/更新
- 搜索路径：从当前目录向上至 git root
- 包含 Token 定义、组件规范、可访问性/本地化模式

---

## 三大工作流详解

### 工作流 1: Design System Init (设计系统初始化)

**目标**: 从 Figma 规则 + 代码库分析生成设计系统指南

**入口**: `helix-design-system-init/SKILL.md`

```
┌─────────────────────┐    ┌──────────────────────────┐
│ Figma Rules Fetcher  │    │ Codebase Analyzer        │
│ (design-system-      │    │ (design-system-codebase- │
│  figma-rules.md)     │    │  analysis.md)            │
│                      │    │                          │
│ 调 MCP:              │    │ 扫描代码中的 Token/       │
│ create_design_       │    │ 主题/组件模式/框架        │
│ system_rules         │    │                          │
└────────┬────────────┘    └────────┬─────────────────┘
         │                          │
         ▼                          ▼
    ┌────────────────────────────────────┐
    │       Synthesizer                  │
    │  (design-system-rules-prompt.md)   │
    └────────────────┬───────────────────┘
                     ▼
        .github/design-system-guide.md
```

---

### 工作流 2: Fit-Finish (适配度检查)

**目标**: 对比 Figma 设计稿与代码实现，找出视觉/布局差异，生成修复建议

**入口**: `helix-fit-finish/SKILL.md`

**必需输入**: Figma 目标 (node ID 或 URL) + 代码文件路径

#### src 中的 Pipeline (参考 `commandPresets.ts:52-92`)

```
  Phase 1 (并行):
  ┌──────────────────────┐  ┌──────────────────────┐
  │ DesignSystemAnalyzer  │  │ CodeAnalyzer          │
  │ (parallelGroup: 1)   │  │ (parallelGroup: 1)   │
  │                       │  │                       │
  │ 加载 guide →          │  │ 读代码 → 提取         │
  │ LLM 动态发现域 →      │  │ UI 属性和 Token 用法  │
  │ 输出 domains[]        │  │                       │
  └──────────┬────────────┘  └──────────┬────────────┘
             │                          │
             ▼                          │
  Phase 2:                              │
  ┌──────────────────────┐              │
  │ FigmaAnalyzer         │              │
  │ (parallelGroup: 2)   │              │
  │                       │              │
  │ 调 MCP 获取每个 node  │              │
  │ 的 design context +   │              │
  │ variables + screenshot│              │
  └──────────┬────────────┘              │
             │  ┌────────────────────────┘
             ▼  ▼
  Phase 3:
  ┌──────────────────────────────────────────────┐
  │ Comparer (parallelGroup: 3)                  │
  │                                              │
  │ splitIntoTasks():                            │
  │   UIParts × Domains → ComparisonTask[]       │
  │                                              │
  │ Promise.all(tasks.map(compareTask))          │
  │ → 每个 task 一次 LLM 调用                    │
  │ → mergeResults()                             │
  └──────────┬───────────────────────────────────┘
             ▼
  Phase 4:
  ┌──────────────────────┐
  │ CodeGenerator (FIX)  │
  │ (parallelGroup: 4)   │
  │                       │
  │ 根据 Comparer 差异    │
  │ 自动修复代码          │
  └──────────────────────┘
```

#### 5 个 Node 的完整执行示例

假设 Design System Guide 动态发现了 6 个域：`colors, typography, spacing, layout, effects, iconography`

FigmaAnalyzer 从 5 个 node 中提取出 8 个 UIParts（一些 node 有多个子组件）

Comparer 生成任务矩阵：`8 UIParts × 6 Domains = 48 个 ComparisonTask`

```
输入: 5 Figma nodes + 1 code file
  │
  ▼ Phase 1 (并行)
  ┌────────────────────────────────┬────────────────────────────────┐
  │ DesignSystemAnalyzer           │ CodeAnalyzer                   │
  │                                │                                │
  │ 1. 加载 design-system-guide    │ 1. 读代码文件                  │
  │ 2. LLM 分析 → 发现 6 个域:    │ 2. 提取 UI 属性                │
  │    colors, typography,         │ 3. 标记 Token 用法 vs 硬编码   │
  │    spacing, layout,            │                                │
  │    effects, iconography        │ 输出: implementationContext    │
  │ 3. 每个域含 tokens 列表        │    { files: Record<path, src> }│
  │                                │                                │
  │ 输出: { domains: Domain[] }    │                                │
  └───────────────┬────────────────┴───────────────┬────────────────┘
                  │                                │
                  ▼ Phase 2                        │
  ┌────────────────────────────────┐               │
  │ FigmaAnalyzer                  │               │
  │                                │               │
  │ 对每个 node 调 MCP:            │               │
  │ ┌─ node1: get_design_context  │               │
  │ │         get_variable_defs   │               │
  │ │         get_screenshot      │               │
  │ ├─ node2: ...                 │               │
  │ ├─ node3: ...                 │               │
  │ ├─ node4: ...                 │               │
  │ └─ node5: ...                 │               │
  │                                │               │
  │ 解析出 8 个 UIParts            │               │
  │ (root.children)               │               │
  │                                │               │
  │ 输出: FigmaAnalysisResult     │               │
  │   { root: { children: [8] } } │               │
  └───────────────┬────────────────┘               │
                  │  ┌─────────────────────────────┘
                  ▼  ▼ Phase 3
  ┌─────────────────────────────────────────────────────────────┐
  │ Comparer                                                     │
  │                                                               │
  │ splitIntoTasks(figmaData, designSystem, focusAreas):         │
  │   8 UIParts × 6 Domains = 48 ComparisonTasks                │
  │                                                               │
  │ Promise.all(48 tasks):                                       │
  │ ┌──────────────────┬──────────────────┬──────────────────┐  │
  │ │ part1 × colors   │ part1 × typo     │ part1 × spacing  │  │
  │ │ part1 × layout   │ part1 × effects  │ part1 × icon     │  │
  │ │ part2 × colors   │ part2 × typo     │ ...              │  │
  │ │ ...               │ ...              │ part8 × icon     │  │
  │ └──────────────────┴──────────────────┴──────────────────┘  │
  │                                                               │
  │ 每个 task → 一次 LLM 调用 (带 prompt + UIPart + Domain)      │
  │ → mergeResults() 合并 48 个结果                               │
  │                                                               │
  │ 输出: CompareResult { diffs[], summary, nextAction }         │
  └────────────────────────────┬────────────────────────────────┘
                               ▼ Phase 4
  ┌─────────────────────────────────────────────┐
  │ CodeGenerator (FIX mode)                     │
  │                                               │
  │ 输入: compareResult + existingCode            │
  │ 按 diff 列表做最小修改                         │
  │                                               │
  │ 输出: 修正后的代码文件                          │
  └─────────────────────────────────────────────┘
```

---

### 工作流 3: Gen-Code (代码生成)

**目标**: 从 Figma 设计稿生成生产级代码，遵循项目设计系统约束

**入口**: `helix-gen-code/SKILL.md`

#### src 中的 Pipeline (参考 `commandPresets.ts:14-45`)

```
  Phase 1:
  ┌──────────────────────┐
  │ DesignSystemAnalyzer  │
  │ (parallelGroup: 1)   │
  │                       │
  │ 加载 guide →          │
  │ LLM 动态发现域 →      │
  │ 输出 domains[]        │
  └──────────┬────────────┘
             │
             ▼ Phase 2
  ┌──────────────────────┐
  │ FigmaAnalyzer         │
  │ (parallelGroup: 2)   │
  │                       │
  │ 调 MCP 获取每个 node  │
  │ design context +      │
  │ variables             │
  │                       │
  │ 输出: UIParts[]       │
  └──────────┬────────────┘
             │
             ▼ Phase 3
  ┌──────────────────────┐
  │ Planner               │
  │ (parallelGroup: 3)   │
  │                       │
  │ 综合 Figma 分析 +     │
  │ Design System →       │
  │ 生成实现计划           │
  └──────────┬────────────┘
             │
             ▼ Phase 4
  ┌──────────────────────────────────────────────┐
  │ CodeGenerator (BUILD mode)                   │
  │ (parallelGroup: 4)                           │
  │                                              │
  │ 按域映射:                                     │
  │  - 每个 Domain 的 tokens → 代码中的具体引用    │
  │  - UIPart 结构 → 组件层级                     │
  │  - 可访问性/本地化/主题支持                    │
  │                                              │
  │ 输出: 完整代码文件                             │
  └──────────────────────────────────────────────┘
```

**Code Generator 两种模式**:
- **BUILD**: 从 Figma + 设计系统全新生成代码
- **FIX**: 根据 Comparator 结果修正已有代码（Fit-Finish 的 Phase 4）

---

## 共享组件 (references/)

| 组件 | 文件 | 角色 | 调用的 MCP 工具 |
|---|---|---|---|
| **MCP 预检** | `mcp-precheck.md` | 验证 Figma MCP 配置可用 | 检查 `.vscode/mcp.json` |
| **Figma 输入** | `figma-input.md` | 定义两种输入格式：桌面端选中 / URL+node-id | — |
| **Figma 采集器** | `figma-collector.md` | 采集设计上下文、变量、截图 | `get_design_context`, `get_variable_defs`, `get_metadata`, `get_screenshot` |
| **设计系统分析器** | `design-system-analyzer.md` | 加载并分析设计系统指南 | — |
| **代码分析器** | `code-analyzer.md` | 从代码中提取 UI 属性和 Token 用法 | — |
| **比较器** | `comparer.md` | UIPart × Domain 逐域对比，输出差异报告 | — |
| **代码生成器** | `code-generator.md` | 生成/修正代码 (BUILD/FIX 双模式) | — |

---

## 数据流总结

```
Figma MCP ──▶ Figma Context + Variables
                     │
                     ▼
.github/design-system-guide.md ◀── Design System Init
         │
         │  LLM 动态发现 Domains
         ▼
  ┌─ domains[] ──────────────────────────────┐
  │  (从 guide 内容动态提取，非硬编码)          │
  │                                           │
  │     ┌─────────────┬─────────────┐         │
  │     ▼             ▼             ▼         │
  │  Fit-Finish    Gen-Code      focusAreas  │
  │  (UIPart×Dom)  (按域映射)    (可选过滤)   │
  │     │             │                       │
  │     ▼             ▼                       │
  │  reports/     output.(txt|tsx|swift)      │
  └───────────────────────────────────────────┘
```

---

---

## Fit-Finish 完整流程 (以 5 Nodes 为例)

```
输入: 5 Figma node URLs + code file path
  │
  ▼ Step 0: MCP 预检
  验证 Figma MCP 可用
  │
  ▼ Step 1: Design System Analyzer (必须先行)
  ┌──────────────────────────────────────────────────┐
  │ 1. 加载 .github/design-system-guide.md           │
  │ 2. LLM 分析 → 动态发现域:                        │
  │    [colors, typography, spacing, layout,          │
  │     effects, iconography, motion]                 │
  │ 3. 每个域含完整 token 清单                        │
  │ 4. 可选: focusAreas 过滤                          │
  └──────────────────────┬───────────────────────────┘
                         │
                         │ domains[]
                         ▼
  ▼ Step 2 (并行): Figma Collector + Code Analyzer
  ┌──────────────────────────┐  ┌──────────────────────────┐
  │ Figma Collector           │  │ Code Analyzer             │
  │                           │  │                           │
  │ 对 5 个 node 并行调 MCP:  │  │ 读代码文件 →              │
  │ ┌─ node1:                │  │ 按 domains[] 提取         │
  │ │  get_design_context    │  │ 各域的 UI 属性            │
  │ │  get_variable_defs     │  │ + Token 用法              │
  │ │  get_screenshot        │  │ + 硬编码值检测            │
  │ ├─ node2: ...            │  │                           │
  │ ├─ node3: ...            │  │ 输出:                     │
  │ ├─ node4: ...            │  │ implementationContext     │
  │ └─ node5: ...            │  │ { files, tokenUsage,     │
  │                           │  │   hardcodedValues }      │
  │ 解析出 N 个 UIParts       │  │                           │
  │                           │  │                           │
  │ 输出:                     │  │                           │
  │ FigmaAnalysisResult      │  │                           │
  │ { root.children: [...] } │  │                           │
  └────────────┬─────────────┘  └────────────┬─────────────┘
               │                             │
               ▼                             ▼
  ▼ Step 3: Comparator (严格等待 Step 1 + Step 2)
  ┌──────────────────────────────────────────────────────────┐
  │ splitIntoTasks(figmaData, domains, focusAreas):          │
  │   N UIParts × M Domains = N×M ComparisonTasks           │
  │                                                          │
  │ 并行执行 (Promise.all / ThreadPool):                     │
  │   每个 task = 1 次 LLM 调用                              │
  │   输入: UIPart 数据 + Domain tokens + Code 实现          │
  │   输出: diffs[] + severity + fix recommendation         │
  │                                                          │
  │ mergeResults() → 按域分组的完整报告                       │
  └──────────────────────┬───────────────────────────────────┘
                         ▼
  ▼ Step 4 (可选): CodeGenerator (FIX mode)
  ┌──────────────────────────────────────────┐
  │ 根据 CompareResult 的 diff 列表           │
  │ 做最小化代码修复                           │
  └──────────────────────────────────────────┘
```

---

## Gen-Code 完整流程

```
输入: 5 Figma node URLs + 可选 output path
  │
  ▼ Step 0: MCP 预检
  │
  ▼ Step 1 (并行):
  ┌──────────────────────────┐  ┌──────────────────────────┐
  │ Design System Analyzer    │  │ Figma Collector           │
  │                           │  │                           │
  │ guide → LLM →             │  │ 5 nodes 并行调 MCP:      │
  │ domains[] + tokens        │  │  get_design_context      │
  │                           │  │  get_variable_defs       │
  │                           │  │                           │
  │                           │  │ 输出: UIParts[]           │
  └────────────┬─────────────┘  └────────────┬─────────────┘
               │                             │
               ▼                             ▼
  ▼ Step 2: Planner (综合上下文)
  ┌──────────────────────────────────────────────────┐
  │ 输入: Figma UIParts + Design System Domains      │
  │                                                  │
  │ 输出: 实现计划                                    │
  │  - 组件层级结构                                   │
  │  - 每个 UIPart × Domain 的 token 映射决策        │
  │  - 文件结构建议                                   │
  └──────────────────────┬───────────────────────────┘
                         │
                         ▼
  ▼ Step 3: Code Generator (BUILD mode)
  ┌──────────────────────────────────────────────────┐
  │ 按域生成:                                         │
  │  - 每个 Domain → 对应的 token 引用                │
  │  - UIPart 结构 → 组件代码                         │
  │  - 可访问性 + 本地化 + 主题支持                    │
  │                                                  │
  │ 输出: 完整代码文件                                 │
  └──────────────────────────────────────────────────┘
```
