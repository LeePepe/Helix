# Task: GenCode - Generate Code from Figma Design

Generate production-ready code from Figma designs, following project design system and coding standards.

---

## System Prompt

You are a code generation specialist. Generate production-ready code from the Figma design specification according to the Design System Guide.

Requirements:

1. Generate complete, working code following the platform and language specified in the Design System Guide
2. Use design system tokens exactly as defined in the guide
3. Map Figma properties to appropriate framework APIs
4. Include accessibility attributes as specified in the guide
5. Use localization keys in the format specified in the guide (never hardcode strings)
6. Support theme variations (light/dark) using design system tokens
7. Follow all code patterns and conventions from the Design System Guide
8. Add helpful comments for complex logic

---

## Task Overview

This task:

1. Loads design system reference (design-system-guide.md)
2. Gathers Figma design information
3. Fetches Figma design specifications and variables
4. Analyzes design structure and properties
5. Maps Figma design tokens to code design system
6. Generates code following project patterns
7. Validates generated code for accessibility and localization

---

## Execution Steps

### Step 1: Load Design System Reference

**Action**: Load design system guide

**File to Load**:

- `.github/design-system-guide.md` → Complete design system tokens, patterns, and code examples

**Error Handling**:

- If file missing → Report error, cannot proceed without design system reference

---

### Step 2: Gather Figma Design Information

**Required Inputs**:

1. **Figma Target** (accept any of these):
   - Full Figma URL: `https://www.figma.com/file/ABC123?node-id=123:456`
   - File key + node ID: `ABC123` + `123:456`
   - Figma node ID: `123:456`

2. **UI Details** (optional, will be inferred if not provided):
   - Desired file/view name
   - Target file path
   - UI type (Button, Dialog, Card, List, etc.)

**User Interaction**:

```text
Please provide:
1. Figma design reference (URL or node ID)
2. (Optional) Desired file/view name and location
3. (Optional) Target framework/language (will be inferred from project-info.md if not provided)

I'll generate production-ready UI code following your project's design system and framework conventions.
```

---

### Step 3: Fetch Figma Design Specification

**Action**: Use Figma MCP tools to fetch complete design details

#### 3.1: Get Design Context

**MCP Tool**: `mcp_figma-desktop_get_design_context`, `mcp_figma_get_design_context` not available

**Input**: Figma URL or node ID

**Extract**:

- Design name and type
- Layer structure and hierarchy
- All child elements
- Design variants (if any)
- Auto-layout configuration

#### 3.2: Extract Visual Properties

**For Each Element in Hierarchy**:

- **Visual Properties**:
  - Background color (hex, variable reference)
  - Border (color, width, radius)
  - Shadow/effects
  - Opacity
  - Blend modes

- **Layout Properties**:
  - Width, height (fixed, hug, fill)
  - Auto-layout direction
  - Padding (top, right, bottom, left)
  - Item spacing
  - Alignment (horizontal, vertical)

- **Typography Properties** (if text):
  - Font family
  - Font size
  - Font weight
  - Line height
  - Letter spacing
  - Text color
  - Text alignment
  - Text decoration

#### 3.3: Access Design Variables

**MCP Tool**: `mcp_figma-desktop_get_variable_defs`, `mcp_figma_get_variable_defs` not available

**Extract**:

- Color variables used
- Typography variables used
- Spacing variables
- Other design tokens

**Map to Code Tokens**:
Use `.github/design-system-guide.md` to convert Figma variables to code design tokens

---

### Step 4: Analyze Design Structure

**Action**: Understand the component structure and determine code implementation approach

#### 4.1: Identify UI Type

**Determine UI Category**:

- Button (interactive, with states)
- Card/Container (layout with padding, background)
- List Item (repeatable, with variants)
- Dialog/Modal (overlay with actions)
- Form Field (input with label, validation)
- Custom View (unique layout)

#### 4.2: Analyze Layout Strategy

**Determine Layout Approach**:

Based on the Figma auto-layout configuration, identify the appropriate layout pattern for your framework:

- **Horizontal layouts**: Use framework's horizontal container pattern
- **Vertical layouts**: Use framework's vertical container pattern
- **Overlays/layers**: Use framework's layering/positioning approach
- **Grid layouts**: Use framework's grid system for multi-column arrangements
- **Responsive layouts**: Apply framework's responsive design patterns

Consult `.github/design-system-guide.md` for layout patterns and code examples.

#### 4.3: Identify States and Variants

**Check for Design Variants**:

- Default, Hover, Pressed, Disabled states
- Size variants (Small, Medium, Large)
- Style variants (Primary, Secondary, Tertiary)
- Theme variants (Light, Dark)

**Map to Framework State Management**:

- Use framework's state management pattern for internal state
- Use framework's binding/props pattern for external data
- Use enums/constants for style/size variants

---

### Step 5: Map Design Tokens

**Action**: Convert Figma variables to project design system tokens

#### 5.1: Map Colors

**For Each Color Used**:

1. Check `.github/design-system-guide.md` for color token documentation
2. If found: Use mapped design system token
3. If not found:
   - Suggest closest design system color from guide
   - Ask user to confirm mapping
   - Note the mapping for future reference

#### 5.2: Map Typography

**For Each Typography Style**:

1. **Token Priority**: Check if the Figma design uses a named text style or variable.
2. **Map to Token**: If a named style exists, map it to the corresponding design system typography token from `.github/design-system-guide.md`.
3. **Fallback**: If no token is found, use raw values (font family, size, weight) but add a comment suggesting to add a new token to the design system.

#### 5.3: Map Spacing

**For Padding and Spacing Values**:

1. Check `.github/design-system-guide.md` for spacing constants (Constants.StaticSpacing*)
2. Map to appropriate spacing tokens
3. If non-standard: Use exact values with note suggesting design system addition

---

### Step 6: Generate Code

**Action**: Create production-ready code

#### 6.1: Generate Structure

**Follow Code Patterns**:

Create structure according to patterns in `.github/design-system-guide.md`:

- Import required design system modules
- Define properties based on design
- Implement view logic
- Add preview helpers for development

#### 6.2: Generate Layout Code

**Follow Patterns from .github/design-system-guide.md**:

- Use design system color tokens
- **Use design system typography tokens** (Prioritize tokens over raw font values)
- Use icon library
- Apply spacing using constants
- Use design system components where applicable

#### 6.3: Add Accessibility

**Required for All Interactive Elements**:

Add appropriate accessibility attributes:

- Accessibility labels for all interactive elements
- Accessibility hints/descriptions
- Proper accessibility traits
- Keyboard navigation support
- Screen reader support

Consult `.github/design-system-guide.md` for accessibility requirements and patterns.

#### 6.4: Add Localization

**Required for All User-Facing Text**:

- Use localization system for all user-facing text
- Create localization key suggestions
- Never hardcode user-facing strings
- Support string interpolation where needed

Follow localization patterns documented in `.github/design-system-guide.md`.

#### 6.5: Add Theme Support

**Ensure Theme Compatibility**:

- Use design system color tokens (should auto-adapt to theme changes)
- Avoid hardcoded color values
- Test in all supported themes (light/dark/custom)

---

### Step 7: Validate Generated Code

**Action**: Check generated code meets all requirements

#### 7.1: Design System Compliance

**Checklist** (based on `.github/design-system-guide.md`):

- [ ] Uses design system color tokens (not hardcoded values)
- [ ] Uses design system typography tokens (not custom font definitions unless necessary)
- [ ] Follows spacing patterns from design system guide
- [ ] Uses icon library as documented
- [ ] Follows UI patterns from design system guide

#### 7.2: Coding Standards Compliance

**Standards Checklist**:

- [ ] Accessibility attributes on all interactive elements
- [ ] All user-facing text uses localization system
- [ ] Theme support (design system tokens)
- [ ] Follows best practices from design system guide
- [ ] Clean, readable structure

#### 7.3: Syntax Validation

**Check**:

- [ ] Valid syntax
- [ ] Proper imports/dependencies
- [ ] No compilation/build errors
- [ ] Follows code patterns from design system guide

---

### Step 8: Create Code File

**Action**: Generate code and create file directly

**Logic**:

- If user provided a file path → Create file at that path
- If no path provided → Ask user for the file path

**If Path Not Provided, Ask User**:

```text
Where would you like me to save the generated code?
Please provide the file path (e.g., src/components/MyComponent.tsx)
```

**After Creating File**:

```text
## Code Generated ✓

File: [file path]
Figma: [URL]

Generated Structure:
- [ComponentName]
  - Layout: [layout type used]
  - Subviews: [list of child components]
  - States: [state properties if any]
  - Props: [configurable properties]
```

---

## Success Criteria

- [ ] Design system guide loaded successfully
- [ ] Figma design fetched successfully
- [ ] Design tokens mapped to code design system
- [ ] Valid code generated following design system patterns
- [ ] Accessibility requirements met
- [ ] Localization requirements met
- [ ] Theme support included
- [ ] Summary provided to user

---

## Error Handling

### Error: "Cannot access Figma file"

**Cause**: No permission or invalid URL

**Solution**:
1. Verify Figma URL is correct
2. Check Figma MCP authentication
3. Ask file owner to grant access

### Error: "Unknown design token"

**Cause**: Figma variable not documented in design system guide

**Solution**:
1. Show Figma variable details
2. Suggest closest design system token from design-system-guide.md
3. Ask user to confirm mapping
4. Note the mapping for future reference

### Warning: "Complex design structure"

**Cause**: Deeply nested or complex Figma design

**Solution**:
1. Generate code for main structure
2. Note complex parts requiring manual refinement
3. Suggest breaking into smaller views/components

### Warning: "Non-standard spacing values"

**Cause**: Spacing values don't match standard scale

**Solution**:
1. Use exact values from Figma
2. Note non-standard values in comments
3. Suggest adding to design system if repeated

---

## Best Practices

### Code Quality

- Follow patterns from `.github/design-system-guide.md`
- Use design system tokens consistently
- Write clean, readable code
- Add helpful comments for complex logic
- Include development previews/examples if applicable

### Design System Consistency

- Always prefer design system tokens from design-system-guide.md
- Map Figma variables to documented code tokens
- Suggest adding new tokens to design system if needed
- Maintain naming conventions from design system guide

### Accessibility

- Add accessibility attributes to all interactive elements
- Support keyboard navigation
- Ensure sufficient color contrast
- Test with screen readers
- Follow accessibility guidelines and project-specific requirements

### Localization

- Never hardcode user-facing text
- Use localization system (see `.github/design-system-guide.md`)
- Use descriptive localization keys
- Provide suggested key names and values
- Support string interpolation/formatting where needed

### Testing

- Generate meaningful development previews/examples
- Test in all supported themes (light, dark, custom)
- Test different viewport/size configurations
- Test all UI states and variants
- Verify accessibility compliance
