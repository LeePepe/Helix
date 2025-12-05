# Helix: Design-to-Code Workflows

A VSCode extension that provides AI-powered chat commands for comparing Figma designs with code implementations and generating production-ready code from Figma designs.

## Features

### `/fit-finish` - Design QA Comparison
Compare Figma designs with code implementation to identify visual differences across:
- Colors (background, text, borders)
- Typography (font family, size, weight, line height)
- Spacing (padding, margins)
- Dimensions (width, height, corner radius)
- Layout (alignment, direction)
- Visual effects (shadows, opacity)

Generates detailed reports with match rates and actionable fixes.

### `/gen-code` - Code Generation
Generate production-ready code from Figma designs with:
- Design system token usage
- Accessibility attributes
- Localization keys
- Theme support (light/dark)
- Best practices and patterns

## Installation

### From Marketplace (Coming Soon)
1. Search for "Helix Design Workflows" in VSCode Extensions
2. Click Install

### From Source
1. Clone this repository
2. Run `npm install`
3. Run `npm run esbuild`
4. Press F5 to launch Extension Development Host

## Prerequisites

### Required
1. **Design System Guide**: Create `.github/design-system-guide.md` with your design tokens
2. **Figma MCP Server**: Install for Figma integration
   - Install from Extensions view > MCP Servers
   - Or see [Figma MCP Installation Guide](docs/initialization/figma-mcp-install.md)
3. **AI Provider**: GitHub Copilot or compatible language model

### Optional
- Workspace with code files to compare

## Usage

### Fit & Finish Command

Compare a Figma design with your code:

```
@helix /fit-finish https://figma.com/file/ABC?node-id=123:456 src/components/Button.swift
```

**Output**:
- Match rate percentage
- List of critical and minor differences
- Detailed markdown report saved to `.github/helix/reports/`
- Actionable fix recommendations

### Gen-Code Command

Generate code from a Figma design:

```
@helix /gen-code https://figma.com/file/ABC?node-id=789:012
```

**Output**:
- Complete production-ready code
- Design system tokens used
- Localization keys needed
- Suggested file path
- Next steps for integration

## Configuration

Configure the extension in VSCode settings:

```json
{
  "helix.designSystemPath": ".github/design-system-guide.md",
  "helix.reportsPath": ".github/helix/reports",
  "helix.enableRemoteFigma": false,
  "helix.modelFamily": "claude-sonnet-4.5",
  "helix.tools": ["figma-desktop", "copilot_", "usages", "vscodeAPI", "problems", "changes"]
}
```

## Examples

### Example 1: Compare Button Component
```
@helix /fit-finish https://figma.com/file/myproject?node-id=42:1337 src/Button.swift
```

### Example 2: Generate Navigation Bar
```
@helix /gen-code https://figma.com/file/myproject?node-id=89:2048
```

## Project Structure

```
.github/
├── design-system-guide.md      # Your design system reference
└── helix/
    ├── tasks/                   # Workflow guides
    ├── reports/                 # Generated comparison reports
    └── initialization/          # Setup guides

src/
├── extension.ts                 # Extension entry point
├── participants/
│   ├── helixParticipant.ts     # Chat participant
│   └── commandHandlers/
│       └── taskHandler.ts      # Unified task handler
└── services/
    ├── chatService.ts          # Chat interaction service
    ├── configService.ts        # Configuration management
    ├── designSystemService.ts  # Design system loading
    ├── figmaService.ts         # Figma MCP integration
    ├── fileService.ts          # File operations
    ├── promptService.ts        # Prompt management
    └── reportService.ts        # Report generation
```

## Development

### Building
```bash
npm install
npm run esbuild          # Build once
npm run esbuild-watch    # Build and watch
```

### Debugging
1. Press F5 in VSCode to launch Extension Development Host
2. Open a workspace with your design system guide
3. Open Chat and type `@helix`

### Packaging
```bash
npm run package          # Creates .vsix file
```

## Troubleshooting

### "Figma MCP tools not found"
- Install Figma MCP server from Extensions > MCP Servers
- Ensure Figma Desktop app is running
- Check MCP configuration in `.vscode/mcp.json`
- See [installation guide](docs/initialization/figma-mcp-install.md)

### "Design system guide not found"
- Verify `.github/design-system-guide.md` exists
- Or update path in settings: `helix.designSystemPath`

### "No language model available"
- Install GitHub Copilot or compatible AI provider
- Ensure AI provider is active and authenticated

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT

## Related Documentation

- [Fit-Finish Workflow Guide](docs/tasks/fit-finish.md)
- [Gen-Code Workflow Guide](docs/tasks/gen-code.md)
- [Prerequisites](docs/initialization/PREREQUISITES.md)
