# 正确的 Helix 工作流程

## 🎯 核心理念

```
Figma 设计 + design-system-guide.md (标准) + Task → 最终结果
```

- **design-system-guide.md** = 项目的设计规范"真理来源"
- **FigmaAnalyzer** = 分析 Figma "是什么"（组件类型、变体）
- **DesignSystemAgent** = 提供"怎么做"（加载设计规范）

## 📋 正确的流程

### Fit-Finish 流程
```
1. 分析 Figma 设计 (FigmaAnalyzerAgent)
   → 识别组件类型、变体、状态

2. 加载 design-system-guide.md (DesignSystemAgent)
   → 获取设计规范标准（颜色、间距、字体等）

3. 加载代码实现
   → 读取项目代码

4. 基于 design-system-guide.md 作为评判标准
   对比 Figma + 代码 → 找出不一致之处
```

### Gen-Code 流程
```
1. 分析 Figma 设计 (FigmaAnalyzerAgent)
   → 识别组件类型、变体、状态

2. 加载 design-system-guide.md (DesignSystemAgent)
   → 获取设计规范标准

3. 基于 design-system-guide.md 作为实现指导
   根据 Figma 分析结果 → 生成符合规范的代码
```

## 🔧 三个关键 Agent 的角色

### 1. FigmaAnalyzerAgent
- **输入**: Figma URL + 用户需求
- **职责**: 分析 Figma **是什么**
- **输出**:
  ```json
  {
    "componentTypes": ["Dialog - Default", "Dialog - Loading"],
    "patterns": ["Multi-state Component"],
    "recommendations": ["使用单一组件 + 变体属性"]
  }
  ```

### 2. DesignSystemAgent
- **输入**: 无（直接读文件）
- **职责**: 提供 **怎么做** 的标准
- **输出**: design-system-guide.md 的内容
  ```markdown
  ## Tokens
  ```json
  {
    "color": { "primary": "#007AFF" },
    "spacing": { "md": "16px" }
  }
  ```

  ## Semantic Rules
  - Primary Color: 用于主要操作按钮
  - Spacing MD: 相关元素之间的标准间距
  ```

### 3. ComponentAnalyzerAgent
- **输入**: Figma分析 + 设计系统 + 框架
- **职责**: 规划组件结构
- **输出**:
  ```typescript
  {
    componentName: "Dialog",
    props: [
      { name: "type", type: "'default' | 'loading'" }
    ],
    styling: {
      background: tokens.color.primary,
      padding: tokens.spacing.md
    }
  }
  ```

## 📊 实际示例

### 示例 1: 生成 Dialog 组件

**输入**: `@helix /gen-code https://figma.com/.../Dialog`

**步骤**:

1️⃣ **FigmaAnalyzer 分析 Figma**:
```json
{
  "summary": "包含 8 种 Dialog 类型",
  "componentTypes": [
    { "name": "Dialog - Default", "nodeId": "..." },
    { "name": "Dialog - Loading", "nodeId": "..." },
    { "name": "Dialog - Sign In", "nodeId": "..." }
  ]
}
```

2️⃣ **DesignSystemAgent 加载规范** (从 design-system-guide.md):
```json
{
  "color": {
    "dialogBackground": "#FFFFFF",
    "overlay": "rgba(0,0,0,0.5)"
  },
  "spacing": {
    "dialogPadding": "24px",
    "dialogGap": "16px"
  },
  "borderRadius": {
    "dialog": "12px"
  }
}
```

3️⃣ **ComponentAnalyzer 结合两者生成结构**:
```typescript
// 知道有哪些类型（来自 FigmaAnalyzer）
type DialogType = 'default' | 'loading' | 'signin';

// 知道用什么样式（来自 DesignSystemAgent）
const styles = {
  background: tokens.color.dialogBackground,
  padding: tokens.spacing.dialogPadding,
  borderRadius: tokens.borderRadius.dialog
};
```

### 示例 2: 检查一致性

**输入**: `@helix /fit-finish https://figma.com/.../Dialog`

**步骤**:

1️⃣ **FigmaAnalyzer**: "Figma 有 8 种 Dialog 类型"

2️⃣ **DesignSystemAgent**: "规范要求 Dialog 背景 #FFFFFF，圆角 12px"

3️⃣ **一致性检查**:
```typescript
// 标准（来自 design-system-guide.md）
standard = { background: "#FFFFFF", borderRadius: "12px" }

// Figma 值
figma = { background: "#FFFFFF", borderRadius: "12px" } ✅

// 代码值
code = { background: "#F5F5F5", borderRadius: "8px" } ❌

// 报告
{
  differences: [
    {
      property: "background",
      standard: "#FFFFFF",
      figma: "#FFFFFF",
      code: "#F5F5F5",
      fix: "改为 #FFFFFF 以符合设计系统"
    }
  ]
}
```

## ✅ 关键要点

1. **design-system-guide.md 是"真理来源"**
   - 定义项目的设计规范
   - 所有代码生成遵循它
   - 所有检查以它为标准

2. **FigmaAnalyzer 只分析结构**
   - 识别组件类型和变体
   - 不提取具体的颜色、间距值
   - 那些值来自设计系统

3. **DesignSystemAgent 只加载文件**
   - 不生成新的设计系统
   - 不需要 Figma 数据
   - 直接读取项目中已有的文档

## 🚀 优势

**正确流程**:
```
Figma 分析 (结构) + design-system-guide.md (规范) → 代码/检查
```

**优势**:
- ✅ 设计系统固定，标准一致
- ✅ Figma 分析专注于结构
- ✅ 生成的代码符合项目规范
- ✅ 检查结果基于统一标准
