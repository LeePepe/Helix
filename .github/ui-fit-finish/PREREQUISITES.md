# Prerequisites Check

All design tasks (Fit & Finish, GenCode, QA Reports) require these prerequisites to be verified before execution.

---

## 1. Figma MCP Tools

**Required MCP Servers** (at least one):

### Figma Desktop MCP (Local)

- **Tools**: `mcp__figma-desktop__*`
  - `mcp__figma-desktop__get_design_context`
  - `mcp__figma-desktop__get_variable_defs`
  - `mcp__figma-desktop__get_screenshot`
  - `mcp__figma-desktop__get_code_connect_map`
- **Requirements**: Figma Desktop app must be running with MCP server enabled
- **Use Case**: Real-time access to currently selected designs in Figma Desktop

### Figma Remote MCP

- **Tools**: `mcp__figma__*`
  - `mcp__figma__get_design_context`
  - `mcp__figma__get_variable_defs`
  - `mcp__figma__get_screenshot`
  - `mcp__figma__get_code_connect_map`
- **Requirements**: OAuth authentication with Figma account
- **Use Case**: Access any Figma file via URL without requiring desktop app

**Check**: Look for either `mcp__figma-desktop__*` or `mcp__figma__*` tools in available tools list

**If Not Available**:

- Follow installation guide: [initialization/figma-mcp-install.md](initialization/figma-mcp-install.md)
- Restart VS Code after installation
- Re-run this check

---

## 2. Design System Guide

**Required File**:

- `.github/design-system-guide.md` - Design system tokens, patterns, and code examples

**Check**:

- Verify file exists and is readable
- Ensure it contains design system token documentation

**If Missing**:

- Use Figma MCP tool to generate: `mcp__figma__create_design_system_rules` or `mcp__figma-desktop__create_design_system_rules`
- Reference template: [context/design-system-rules-prompt.md](context/design-system-rules-prompt.md)
- Follow the universal prompt template to analyze codebase

---

## 3. Directory Structure

**Required Directories**:

- `initialization/` - Setup procedures
- `tasks/` - Workflow guides (fit-finish, gen-code)
- `reports/` - Generated comparison reports

**Auto-Action**: Create missing directories automatically

---

## Health Check Output Examples

### ✅ All Prerequisites Met

```text
✅ Figma MCP: Available
   - figma-desktop: 4 tools detected
   - figma: 4 tools detected (authenticated)
✅ Design System Guide: Valid
   - design-system-guide.md: Found with complete token documentation
✅ Directory Structure: Complete

→ Environment ready for design tasks
```

### ❌ Prerequisites Missing

```text
❌ Figma MCP: Not available
   - figma-desktop: Not detected
   - figma: Not detected
   → Action: Install at least one Figma MCP server
   → Guide: .github/ui-fit-finish/initialization/figma-mcp-install.md

⚠️ Design System Guide: Missing
   → Action: Generate using Figma MCP create_design_system_rules
   → Template: .github/ui-fit-finish/context/design-system-rules-prompt.md

✅ Directory Structure: Complete
```

### ⚠️ Partial Issues

```text
✅ Figma MCP: Partially available
   - figma-desktop: 4 tools detected
   - figma: Not authenticated
   → Recommendation: Authenticate figma remote server for URL-based access
⚠️ Design System Guide: Incomplete
   → Action: Add missing token documentation
   → Reference: context/design-system-rules-prompt.md for required sections
✅ Directory Structure: Complete

→ Proceed with caution or fix issues first
```

---

## Task-Specific Requirements

### Fit & Finish Task

- Requires: Figma MCP + Design System Guide
- Optional: Previous reports for comparison

### GenCode Task

- Requires: Figma MCP + Design System Guide
- Critical: design-system-guide.md must have complete design system token documentation

### QA Report Task

- Requires: Design System Guide
- Requires: reports/ directory with existing review reports
- Optional: Figma MCP (for re-validation)

---

## Troubleshooting

### "Figma MCP tools not responding"

- Verify Figma Desktop app is running
- Check MCP server status in VS Code
- Restart VS Code

### "Design system guide missing"

- Use Figma MCP `create_design_system_rules` tool to generate
- Reference template at context/design-system-rules-prompt.md
- Analyze codebase to extract design tokens

### "Design system guide incomplete"

- Check for missing sections (colors, typography, spacing)
- Add token documentation following the template
- Validate all required design token categories are present
