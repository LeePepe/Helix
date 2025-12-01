# Design System Rules Generation Prompt

This document provides a **universal prompt template** for generating design system integration guides for any codebase. Use this with Figma MCP tools (`mcp_figma_create_design_system_rules` or `mcp_figma-desktop_create_design_system_rules`) to create project-specific design system documentation.

---

## Universal Prompt Template

Copy and use the following prompt to analyze any codebase and generate a comprehensive design system rules document:

---

### Prompt

```text
Please analyze this codebase thoroughly and provide a comprehensive rules document (e.g., CLAUDE.md, .cursor/rules/design_system_rules.mdc, or design-system-guide.md) on the following aspects to help integrate Figma designs using the Model Context Protocol:

## 1. Token Definitions

### Colors
- Where are color tokens defined? (file paths)
- What format/structure is used? (CSS variables, JSON, code constants, etc.)
- Is there a color hierarchy or naming convention?
- How are theme colors organized? (semantic vs primitive)
- Are there component-specific color tokens?
- How are interaction states handled? (hover, pressed, disabled, focus)
- Is dark mode supported? How?

### Typography
- Where are typography tokens defined?
- What properties are included? (size, weight, line-height, letter-spacing)
- Is there a type scale? Document the hierarchy.
- What font families are used?
- How do Figma text style names map to code tokens?

### Spacing
- Where are spacing tokens defined?
- What is the spacing scale? (e.g., 4pt grid, 8pt grid)
- Are there named spacing constants?

### Other Tokens
- Corner radius / border radius values
- Shadow / elevation definitions
- Border / stroke definitions
- Animation / motion tokens
- Breakpoints (if responsive)

## 2. Component Library

- Where are UI components defined? (directory structure)
- What component architecture is used? (atomic design, compound components, etc.)
- List the available pre-built components with their file paths
- What are the component variants and their APIs?
- Are there component documentation or storybooks?

## 3. Frameworks & Libraries

- What UI framework is used? (React, Vue, SwiftUI, Flutter, etc.)
- What styling approach? (CSS-in-JS, CSS Modules, Tailwind, native styling, etc.)
- What build system and bundler?
- What state management?
- What testing frameworks?

## 4. Asset Management

- How are assets (images, videos) stored and referenced?
- What asset optimization techniques are used?
- Are there CDN configurations?

## 5. Icon System

- Where are icons stored?
- What icon library is used? (if any)
- How are icons imported and used in components?
- What is the icon naming convention?
- What sizes and variants are available?

## 6. Styling Approach

- What CSS methodology is used?
- Are there global styles?
- How are responsive designs implemented?
- How are shadows/elevations applied?
- How are animations handled?

## 7. Localization

- How are strings localized?
- What is the localization file format?
- What is the pattern for defining and using localized strings?

## 8. Accessibility

- What accessibility standards are followed?
- What are the contrast requirements?
- How are accessibility labels applied?
- How is keyboard navigation handled?
- How is screen reader support implemented?

## 9. Project Structure

- What is the overall organization of the codebase?
- Are there specific patterns for feature organization?
- Where should new components be added?

## Output Format

Please provide your analysis as structured markdown with:

1. **Quick Reference** - A summary table of the most important tokens and their usage
2. **Token Mapping Tables** - Figma token name → Code token mapping
3. **Code Examples** - Real code snippets demonstrating usage patterns
4. **File Paths** - Exact paths to relevant files
5. **Implementation Checklist** - Steps to follow when implementing a Figma design
6. **Best Practices** - Do's and Don'ts for the design system
```

---

## Customization Options

Add any of the following to the prompt based on your specific needs:

### For Mobile Apps (iOS/Android)

```text
Additional mobile-specific questions:
- How are platform-specific designs handled?
- What are the safe area / notch considerations?
- How are gestures and haptics implemented?
- What are the minimum touch target sizes?
```

### For Web Applications

```text
Additional web-specific questions:
- What are the breakpoint definitions?
- How is responsive typography handled?
- What CSS reset or normalize is used?
- How are CSS custom properties organized?
```

### For Design Systems with Theming

```text
Additional theming questions:
- How many themes are supported?
- How is theme switching implemented?
- Are there brand-specific overrides?
- How are theme tokens structured?
```

### For Multi-Platform Projects

```text
Additional cross-platform questions:
- How are tokens shared across platforms?
- What is the token transformation pipeline?
- Are there platform-specific token overrides?
- What tools are used for token synchronization?
```

---

## Expected Output Structure

The generated design system guide should follow this structure:

```markdown
# [Project Name] Design System Guide

## Quick Reference
- Colors: `[token pattern]`
- Typography: `[token pattern]`
- Spacing: `[token pattern]`
- Components: `[location]`

## Table of Contents
1. Overview
2. Design Tokens
   - Colors
   - Typography
   - Spacing & Sizing
3. Icons
4. Components
5. Code Patterns
6. Accessibility
7. Best Practices

## [Detailed sections...]
```

---

## Usage with Figma MCP Tools

### Step 1: Invoke the Tool

```
Use mcp_figma_create_design_system_rules or mcp_figma-desktop_create_design_system_rules
```

### Step 2: Apply the Prompt

The tool will return a base prompt. Combine it with the universal template above for comprehensive results.

### Step 3: Analyze the Codebase

Let the AI analyze the codebase structure, token definitions, and component patterns.

### Step 4: Generate Documentation

The AI will produce a structured design system guide tailored to your specific project.

---

## Figma to Code Workflow

Once the design system guide is generated:

1. **Export design context** from Figma using MCP tools (`get_design_context`)
2. **Identify design tokens** in the exported context (colors, typography, spacing)
3. **Map to codebase tokens** using the generated mapping tables
4. **Check for existing components** before creating new ones
5. **Generate code** following the documented patterns
6. **Add accessibility** attributes as specified
7. **Apply localization** using the documented pattern
8. **Test implementation** in all supported themes/modes

---

## Implementation Checklist Template

When implementing any Figma design:

- [ ] Identify all colors → Map to design system color tokens
- [ ] Identify typography styles → Map to typography tokens
- [ ] Identify spacing values → Map to spacing tokens
- [ ] Identify icons → Use icon system with correct naming
- [ ] Check for existing components → Reuse before creating new
- [ ] Add accessibility labels for all interactive elements
- [ ] Ensure all user-facing strings are localized
- [ ] Test in all supported themes (light/dark/high-contrast)
- [ ] Verify all interaction states (hover/pressed/disabled/focus)
- [ ] Validate contrast ratios meet accessibility requirements
