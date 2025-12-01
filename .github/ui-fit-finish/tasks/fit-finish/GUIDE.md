# Task: Fit & Finish - Compare Figma Design with Code

**Navigation**: [DesignDev Mode](../../../chatmodes/DesignDev.chatmode.md) > **Fit & Finish Workflow**

**Related**: [Design System Guide](../../../design-system-guide.md) | [Prerequisites](../../PREREQUISITES.md)

Compare Figma design specifications with code implementation, identify differences, and offer automated fixes to ensure pixel-perfect UI implementation.

## Task Overview

This task:

1. Loads design system reference (design-system-guide.md)
2. Gathers Figma and code file information
3. Fetches Figma design specifications
4. Reads code implementation
5. Compares systematically across all visual properties
6. Generates detailed comparison report
7. Offers automated fixes
8. Applies fixes (if requested)
9. Provides completion summary

---

## Execution Steps

### Step 1: Load Design System Reference

**Action**: Load design system guide

**File to Load**:

- `.github/design-system-guide.md` → Complete design system tokens, patterns, and code examples

**Validation**:

- [ ] File exists and is readable
- [ ] Contains design system token documentation

**Error Handling**:

- If file missing → Report error, cannot proceed without design system reference

---

### Step 2: Gather Target Information

**Required Inputs**:

1. **Figma Target** (accept any of these):
   - Full Figma URL: `https://www.figma.com/file/ABC123?node-id=123:456`
   - File key + node ID: `ABC123` + `123:456`
   - Figma component ID: `123:456`

2. **Code File Path**:
   - Absolute path: `/full/path/to/component.[ext]`
   - Relative path from project root

**User Interaction**:

```text
Please provide:
1. Figma design reference (URL or node ID)
2. Code file path (absolute or relative)
```

**Smart Suggestions**:

- If partial path provided → Suggest matching files from codebase
- If Figma URL provided → Parse and extract file key and node ID

---

### Step 3: Fetch Figma Design Specification

**Action**: Use Figma MCP tools to fetch design details

#### 3.1: Get Component Context

**MCP Tool**: `mcp__figma__get_design_context` or `mcp__figma-desktop__get_design_context`

**Input**: Figma URL or node ID

**Extract**:
- Component name and type
- Parent frame/page information
- Design system usage
- Component variants (if any)

#### 3.2: Read Component Specifications

**Extract**:

- **Visual Properties**:
  - Background color
  - Border color, width, radius
  - Shadow/effects
  - Opacity
- **Layout Properties**:
  - Width, height
  - Auto-layout configuration
  - Padding, spacing
  - Alignment
- **Typography Properties** (if text present):
  - Font token and usage / Font family, size, weight, Line height, letter spacing
  - Text color, alignment
  - Text decoration
- **Component Structure**:
  - Child elements
  - Layer hierarchy
  - Constraints

#### 3.3: Access Design Variables

**MCP Tool**: `mcp__figma__get_variable_defs` or `mcp__figma-desktop__get_variable_defs`

**Extract**:
- Color variables used
- Typography variables used
- Spacing/dimension variables
- Variable values and modes

#### 3.4: Generate Visual Reference (Optional)

**MCP Tool**: `mcp__figma__get_screenshots` or `mcp__figma-desktop__get_screenshot`

**Purpose**: Get visual reference for comparison

---

### Step 4: Read Code Implementation

**Action**: Read and parse the UI code file

**Refer to design-system-guide.md for**:

- Design system token naming conventions
- Code examples and syntax patterns
- Typical property/attribute patterns to look for

**What to Extract**:

#### 4.1: Visual Properties
- Background color
- Foreground/text color
- Border (style, width, color)
- Corner radius
- Shadow effects
- Opacity

#### 4.2: Layout Properties
- Dimensions (width, height, min/max)
- Padding (all sides)
- Margins
- Spacing (between elements)
- Alignment

#### 4.3: Typography Properties
- Font family
- Font size
- Font weight
- Line height/spacing
- Letter spacing/kerning
- Text alignment

#### 4.4: Design System Token Usage

Identify usage of design system tokens vs hardcoded values:

- Color tokens
- Typography tokens
- Spacing tokens
- Other design tokens

**Parsing Considerations**:

- Handle both explicit values and design system tokens
- Identify computed properties and methods
- Understand framework-specific syntax (refer to design-system-guide.md)
- Account for conditional styling (themes, responsive, states)

---

### Step 5: Analyze and Compare

**Action**: Systematically compare Figma design with code implementation

#### Comparison Categories

##### 5.1: Colors

**Compare**:
- Background color
- Foreground/text color
- Border color
- Tint/accent colors

**Example**:
```text
Figma: #0078D4 (Brand/Primary variable)
Code:  [design-system-token] → #0067C0
Status: ❌ Mismatch (lighter in Figma)
```

**Considerations**:
- Color space differences (sRGB vs Display P3)
- Light/dark mode variations
- Semantic equivalence (is the token name correct?)
- Alpha/opacity values

##### 5.2: Typography

**Compare**:
- Font family
- Font size (pt/px)
- Font weight (regular, medium, bold, etc.)
- Line height / line spacing
- Letter spacing / kerning
- Text alignment

**Example**:
```text
Figma:
  Family: Inter
  Size: 14pt
  Weight: Medium
  Line Height: 20pt

Code:
  Font: [typography-token] → Inter 13pt medium
  Line Height: 19pt (default)

Status: ❌ Font size mismatch (13pt vs 14pt)
        ❌ Line height mismatch (19pt vs 20pt)
```

##### 5.3: Spacing

**Compare**:
- Padding (all sides)
- Margins (if applicable)
- Container spacing
- Item spacing in lists/grids

**Example**:

```text
Figma: Padding 16px horizontal, 12px vertical
Code:  16px horizontal, 8px vertical
Status: ❌ Vertical padding mismatch (8px vs 12px)
```

##### 5.4: Dimensions

**Compare**:
- Width (fixed, min, max)
- Height (fixed, min, max)
- Aspect ratio
- Corner radius
- Border width

##### 5.5: Layout

**Compare**:
- Layout direction (horizontal/vertical)
- Alignment (start, center, end, top, bottom)
- Distribution (fill, equal spacing, packed)
- Flex/grow behavior

##### 5.6: Visual Effects

**Compare**:
- Shadows (radius, offset, color, opacity)
- Opacity
- Blend modes
- Borders (style, width, color)

---

### Step 6: Generate Comparison Report

**Action**: Create a concise markdown report and save to `reports/report-[component-name]-[timestamp].md`

**Report Format**:

```markdown
# [Component Name] - Design Review

**Date**: [YYYY-MM-DD HH:MM]
**Figma**: [Figma URL]
**Code**: [file path]

## Summary

**Match Rate**: [X]% | **Differences**: [N] ([critical count] critical, [minor count] minor)
**Fixes Applied**: [Y] ([if auto-fix was run])

## Differences

### ❌ Critical

1. **[Property]**: Figma `[value]` ≠ Code `[value]`
   - Fix: [specific change needed]
   - File: [path:line]
   - Status: [✓ Fixed | ⚠ Manual fix required]

### ⚠️ Minor

1. **[Property]**: Figma `[value]` ≠ Code `[value]`
   - Fix: [specific change needed]
   - File: [path:line]
   - Status: [✓ Fixed | ⚠ Manual fix required]

### ✅ Matches

- [Property]: `[value]`

## Actions

**[If fixes applied]**: Review changes with `git diff`
**[If fixes not applied]**: Critical fixes required before shipping.
```

**File Location**: `reports/report-[component-name]-[YYYYMMDD-HHMMSS].md`

---

### Step 7: Offer Auto-Fix

**Action**: Ask user if they want automated fixes

**User Prompt**:

```text
I found [N] differences between the Figma design and code.

Would you like me to:
1. Fix all critical issues (colors, typography, dimensions)
2. Fix all issues including minor spacing adjustments
3. Show proposed changes first for review
4. Skip auto-fix (I'll do it manually)

Enter choice (1-4):
```

**If User Chooses Auto-Fix**: Proceed to Step 8
**If User Wants to Review First**: Show proposed code changes with diff format, then ask for confirmation
**If User Declines**: Skip to Step 9 (Generate Summary)

---

### Step 8: Apply Automated Fixes

**Action**: Modify code files to match Figma design

#### 8.1: Plan Changes

**For Each Difference**:

1. Identify file(s) to modify
2. Locate exact code to change
3. Prepare new code
4. Validate change won't break other code

#### 8.2: Apply Changes

**Using Edit Tool**:

Modify the identified code sections to match Figma specifications. Refer to design-system-guide.md for syntax patterns and token usage.

**Change Categories**:

- **Local Changes**: Modify the specific component file only
- **Design System Changes**: Update shared token values (affects multiple components)
  - ⚠️ Warn user about broader impact
  - Ask for explicit confirmation

#### 8.3: Verify Changes

**Post-Fix Checks**:

- [ ] Code compiles (syntax is valid)
- [ ] No new linting errors introduced
- [ ] Changes match intended fixes
- [ ] No unintended modifications

#### 8.4: Format Code

**Run Formatting**:

Execute project-specific formatting commands (refer to design-system-guide.md for project commands)

**If Formatting Fails**:

- Report errors
- Ask user to manually format

---

### Step 9: Generate Summary

**Action**: Provide completion summary

**Summary Format**:

```text
## Review Complete ✓

Component: [Component Name]
Report: reports/report-[component-name]-[timestamp].md

Differences: [N] total ([critical] critical, [minor] minor)
Match Rate: [X]%

Changes Applied:
✓ [Change description]
✓ [Change description]
⚠ [Change requiring manual action]

Next Steps:
1. Review report: cat reports/report-[...].md
2. Review code changes: git diff
3. Test in all theme modes
4. Run linting and build commands (see design-system-guide.md)
```

---

## Success Criteria

- [ ] Design system guide loaded successfully
- [ ] Figma design fetched successfully
- [ ] Code read and parsed
- [ ] Comprehensive comparison performed
- [ ] Concise report saved to `reports/`
- [ ] Auto-fix applied (if requested)
- [ ] Summary provided to user with report path

---

## Error Handling

### Error: "Cannot access Figma file"

**Cause**: No permission or invalid URL

**Solution**:
1. Verify Figma URL is correct
2. Check Figma MCP authentication
3. Ask file owner to grant access

### Error: "Code file not found"

**Cause**: Invalid file path

**Solution**:
1. Verify file path is correct
2. Use absolute path or path relative to repo root
3. Search for file in codebase

### Error: "Cannot parse code"

**Cause**: Complex or non-standard code structure

**Solution**:
1. Manual review required
2. Report what could be parsed
3. Ask user for clarification on unclear sections

### Warning: "Design system token value mismatch"

**Cause**: Token value in code doesn't match Figma variable

**Solution**:
1. Report discrepancy
2. Ask which is correct (code or Figma)
3. Offer to update either source
4. Warn about impact on other components

---

## Best Practices

### Comparison Accuracy

- Account for platform rendering differences
- Understand semantic equivalence (logical vs visual matching)
- Consider dynamic values (responsive, themes, dynamic sizing)
- Validate design system token usage

### Code Modifications

- Always show proposed changes before applying
- Never modify without user confirmation for design system changes
- Preserve existing code style and patterns
- Run linting and formatting after changes
- Test in multiple scenarios (themes, sizes, states)
