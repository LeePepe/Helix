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
