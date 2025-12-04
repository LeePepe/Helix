# Design System Rules Generation Prompt

This document provides a **universal prompt template** for generating design system integration guides for any codebase. Use this with Figma MCP tools (`mcp_figma_create_design_system_rules` or `mcp_figma-desktop_create_design_system_rules`) to create project-specific design system documentation.

---

## Universal Prompt Template

Copy and use the following prompt to analyze any codebase and generate a comprehensive design system rules document:

---

### Prompt

```text
Please generate a comprehensive `design-system-guide.md` for this project by combining Figma design rules with codebase analysis.

First, call the `mcp_figma-desktop_create_design_system_rules` tool (or `mcp_figma_create_design_system_rules`) to retrieve the prompt that generate a design system rules from Figma.

Then, analyze this codebase thoroughly to understand the implementation details.

In addition to the analysis requested by the Figma tool, please specifically analyze:

## 1. Localization

- How are strings localized?
- What is the localization file format?
- What is the pattern for defining and using localized strings?

## 2. Accessibility

- What accessibility standards are followed?
- What are the contrast requirements?
- How are accessibility labels applied?
- How is keyboard navigation handled?
- How is screen reader support implemented?

## Output Format

Please provide the final `design-system-guide.md` content as structured markdown. It must integrate the Figma rules with the codebase patterns:

1. **Quick Reference** - A summary table of the most important tokens and their usage
2. **Token Mapping Tables** - Explicit mapping between Figma token names (from tool output) and Code token names (from analysis)
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
