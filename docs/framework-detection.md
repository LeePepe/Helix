# 框架检测系统

## 概述

Helix 使用混合策略来自动检测项目使用的框架，无需用户手动指定。检测系统按优先级使用以下策略：

## 检测策略（按优先级）

### 1. 结构化配置检测（最高优先级）

从 `design-system-guide.md` 中提取明确的框架配置。

**支持的格式**：

#### A. YAML-like 格式
```markdown
Framework: SwiftUI
```

或

```markdown
- Framework: SwiftUI
```

#### B. Markdown 表格格式
```markdown
| Configuration | Value |
|--------------|-------|
| Framework    | SwiftUI |
```

#### C. JSON 配置块
````markdown
```json
{
  "framework": "SwiftUI",
  "platform": "iOS"
}
```
````

#### D. Project Configuration 部分
```markdown
## Project Configuration

- **Framework**: SwiftUI
- **Platform**: iOS/macOS
- **Language**: Swift
```

### 2. 文件系统检测

检查项目中的关键文件来推断框架。

**检测规则**：

| 文件/目录 | 推断框架 |
|----------|---------|
| `*.xcodeproj`, `*.xcworkspace` | SwiftUI |
| `angular.json` | Angular with TypeScript |
| `package.json` + `@angular/core` | Angular with TypeScript |
| `package.json` + `vue` | Vue 3 with TypeScript |
| `package.json` + `svelte` | Svelte with TypeScript |
| `package.json` + `react` | React with TypeScript |
| `vite.config.ts` + vue 依赖 | Vue 3 with TypeScript |

**元框架支持**：
- `next` (package.json) → React with TypeScript
- `nuxt` (package.json) → Vue 3 with TypeScript

### 3. 关键词匹配

在 design-system-guide.md 中搜索框架相关关键词。

**关键词映射**：

| 关键词 | 框架 |
|-------|------|
| `swiftui`, `swift ui` | SwiftUI |
| `vue` | Vue 3 with TypeScript |
| `angular` | Angular with TypeScript |
| `svelte` | Svelte with TypeScript |
| `react` | React with TypeScript |
| `ios`, `macos`, `xcode` | SwiftUI |

### 4. LLM 智能推断（Fallback）

如果上述方法都无法检测到框架，使用 LLM 分析 design-system-guide 的内容。

LLM 会分析：
- 文件引用
- 代码示例
- 术语使用
- 设计模式

## 覆盖机制

用户可以在命令中明确指定框架来覆盖自动检测：

```
@helix /gen-code <Figma URL> use SwiftUI
@helix /gen-code <Figma URL> use Vue
@helix /gen-code <Figma URL> use React
```

## 支持的框架

| 框架名称 | 标准化名称 |
|---------|----------|
| SwiftUI | `SwiftUI` |
| React | `React with TypeScript` |
| Vue | `Vue 3 with TypeScript` |
| Angular | `Angular with TypeScript` |
| Svelte | `Svelte with TypeScript` |

## 调试

所有检测步骤都会输出到控制台，带有 `[Helix]` 前缀：

```
[Helix] FrameworkDetector - Starting framework detection...
[Helix] FrameworkDetector - Checking structured config...
[Helix] FrameworkDetector - Found YAML-like config: SwiftUI
[Helix] Framework detected: SwiftUI
```

查看调试日志：
1. 打开 VSCode 的 "Output" 面板
2. 选择 "Extension Host" 或查看开发者控制台

## 实现细节

检测器位于 `/src/utils/frameworkDetector.ts`，提供以下方法：

```typescript
class FrameworkDetector {
  // 主检测方法：结构化配置 + 文件系统 + 关键词
  async detectFramework(
    designSystemGuide: string,
    workspaceRoot: string
  ): Promise<string | undefined>

  // LLM 智能推断（fallback）
  async detectWithLLM(
    designSystemGuide: string,
    llmCallback: (prompt: string) => Promise<string>
  ): Promise<string | undefined>
}
```

## 最佳实践

### 推荐方式 1：在 design-system-guide.md 中明确声明

```markdown
# Design System Guide

## Project Configuration

- **Framework**: SwiftUI
- **Platform**: iOS/macOS
- **Minimum Version**: iOS 15.0
```

### 推荐方式 2：依赖文件系统检测

确保项目根目录有正确的配置文件：
- SwiftUI 项目：保留 `.xcodeproj` 或 `.xcworkspace`
- Web 项目：确保 `package.json` 中有正确的依赖

### Fallback：LLM 会自动分析

如果以上都失败，系统会自动使用 LLM 分析 design-system-guide 的内容。

## 示例

### SwiftUI 项目

**design-system-guide.md**:
```markdown
# iOS Design System

Framework: SwiftUI

## Colors
...
```

**检测结果**: `SwiftUI`

### React 项目

**package.json**:
```json
{
  "dependencies": {
    "react": "^18.0.0"
  }
}
```

**检测结果**: `React with TypeScript`

### Vue 项目（明确配置）

**design-system-guide.md**:
```markdown
# Design System

| Configuration | Value |
|--------------|-------|
| Framework    | Vue 3 |
```

**检测结果**: `Vue 3 with TypeScript`
