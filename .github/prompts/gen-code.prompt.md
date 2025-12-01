---
description: 'Generate production-ready code from Figma design'
agent: 'DesignDev'
tools: ['edit', 'search', 'figma-desktop/*', 'figma/*', 'runCommands', 'vscodeAPI']
---

**Navigation**: [DesignDev Mode](../chatmodes/DesignDev.chatmode.md) > [Design System Guide](../design-system-guide.md) > [Workflow Guide](../ui-fit-finish/tasks/gen-code/GUIDE.md)

# GenCode: Generate Code from Figma

Generate production-ready SwiftUI code from Figma designs, following the project's design system and coding standards.

## Quick Start

1. **Get Figma URL**: Copy the Figma design URL or node ID
2. **Run generation**: Provide the Figma URL when prompted
3. **Review code**: Check generated code and design system token usage
4. **Create file**: Approve file creation at suggested path

**Example**: `"Generate code from https://figma.com/file/ABC?node-id=123:456"`

---

## Input Required

1. **Figma Target**: ${input:figmaUrl:Figma URL or node ID (e.g., https://figma.com/file/...?node-id=123:456)}
2. **Component Name** (Optional): ${input:componentName:Desired component name (will be inferred if not provided)}
3. **Target Path** (Optional): ${input:targetPath:Target file path (will be suggested if not provided)}

---

## Workflow

This task will:

1. Load design system reference (design-system-guide.md)
2. Fetch Figma design specs and variables using MCP tools
3. Analyze design structure and component hierarchy
4. Map Figma design tokens to code design system
5. Generate SwiftUI code following project patterns
6. Ensure generated code complies with Microsoft Accessibility Standards (MAS), including:
   - MAS 1.1.1 (Non-text Content): Provide alt text for images and non-text elements
   - MAS 2.4.4 (Link Purpose): Use descriptive link labels
   - MAS 4.1.2 (Name, Role, Value): Expose accessible names and roles for all UI components
   - MAS 2.1.1 (Keyboard): Support full keyboard navigation
7. Add localization keys (.xcstrings format)
8. Validate code compliance (design system, accessibility, localization)

**Detailed workflow**: [tasks/gen-code/GUIDE.md](../ui-fit-finish/tasks/gen-code/GUIDE.md)

---

## Output

- **Complete SwiftUI component code**
- **Design system token usage summary** (colors, typography, icons used)
- **Suggested localization keys** (with descriptions)
- **Recommended file path** (based on component category)

---

## Design System Usage

Generated code will use project's design system:

- **Colors**: `Color.Theme.*` tokens
- **Typography**: `.font(.baseStrong)` etc.
- **Icons**: `FluentIcon.*` library
- **Shadows**: `.applyShadow(.medium)`
- **Corner Radius**: `.cornerRadiusModifier(cornerRadius: 8)`

See [design-system-guide.md](../design-system-guide.md) for complete token reference.

---

## Next Steps After Generation

1. Review generated code
2. Add localization keys to `.xcstrings` file
3. Create file at suggested path (or specify custom path)
4. Test component in all supported themes (light/dark)
5. Run project build and lint commands

---

## Troubleshooting

### Figma MCP Not Available

**Error**: MCP tools not found

**Solution**:

1. Ensure Figma Desktop app is running
2. Enable Dev Mode in Figma (Shift+D)
3. Check MCP server configuration
4. See: [figma-mcp-install.md](../ui-fit-finish/initialization/figma-mcp-install.md)

### Unknown Design Token

**Error**: Figma color/token has no exact match

**Solution**:

1. AI suggests closest match from design-system-guide.md
2. Review suggestion and similarity score
3. Approve to use suggested token OR request new token addition

### Cannot Access Figma File

**Error**: Permission denied or invalid URL

**Solution**:

1. Verify Figma URL is correct
2. Check Figma file permissions
3. Ensure you have view access to the file
