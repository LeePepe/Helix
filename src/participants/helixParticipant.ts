import * as vscode from 'vscode';
import { FitFinishHandler } from './commandHandlers/fitFinishHandler';
import { GenCodeHandler } from './commandHandlers/genCodeHandler';
import { DesignSystemService } from '../services/designSystemService';
import { FigmaService } from '../services/figmaService';

export class HelixParticipant {
  private fitFinishHandler: FitFinishHandler;
  private genCodeHandler: GenCodeHandler;
  private designSystemService: DesignSystemService;
  private figmaService: FigmaService;

  constructor(private context: vscode.ExtensionContext) {
    this.designSystemService = new DesignSystemService();
    this.figmaService = new FigmaService();
    this.fitFinishHandler = new FitFinishHandler(this.designSystemService, this.figmaService);
    this.genCodeHandler = new GenCodeHandler(this.designSystemService, this.figmaService);
  }

  async handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    try {
      // Load design system guide once
      if (!this.designSystemService.isLoaded()) {
        stream.progress('Loading design system guide...');
        await this.designSystemService.loadDesignSystem();
      }

      // Route based on slash command
      switch (request.command) {
        case 'fit-finish':
          await this.fitFinishHandler.handle(request, context, stream, token);
          break;
        case 'gen-code':
          await this.genCodeHandler.handle(request, context, stream, token);
          break;
        default:
          // No command specified - show help
          await this.showHelp(stream);
      }
    } catch (error) {
      stream.markdown(`\n\n❌ **Error**: ${error instanceof Error ? error.message : String(error)}\n`);
      console.error('Helix chat participant error:', error);
    }
  }

  private async showHelp(stream: vscode.ChatResponseStream): Promise<void> {
    // Check Figma MCP availability
    const figmaStatus = this.figmaService.checkToolsAvailable();

    stream.markdown(`
# Helix Design Workflows

I can help you with Figma design-to-code workflows:

## Available Commands

### /fit-finish
Compare Figma design with code implementation and identify differences.

**Usage**: \`@helix /fit-finish <figma-url> <code-file-path>\`

**Example**:
\`\`\`
@helix /fit-finish https://figma.com/file/ABC?node-id=123:456 src/components/Button.swift
\`\`\`

### /gen-code
Generate production-ready code from Figma design.

**Usage**: \`@helix /gen-code <figma-url>\`

**Example**:
\`\`\`
@helix /gen-code https://figma.com/file/ABC?node-id=789:012
\`\`\`

## Prerequisites

`);

    // Show status of prerequisites
    stream.markdown(`### Design System Guide\n`);
    if (this.designSystemService.isLoaded()) {
      stream.markdown(`✅ Loaded from: \`${this.designSystemService.getGuidePath()}\`\n\n`);
    } else {
      stream.markdown(`❌ Not loaded. Configure path in settings: \`helix.designSystemPath\`\n\n`);
    }

    stream.markdown(`### Figma MCP Tools\n`);
    if (figmaStatus.available) {
      stream.markdown(`✅ Available tools:\n`);
      figmaStatus.toolNames.forEach(name => {
        stream.markdown(`- \`${name}\`\n`);
      });
    } else {
      stream.markdown(`❌ Not installed. Please install Figma MCP server:\n`);
      stream.markdown(`1. Install from Extensions view > MCP Servers\n`);
      stream.markdown(`2. Or configure in \`.vscode/mcp.json\`\n`);
      stream.markdown(`3. See \`.github/ui-fit-finish/initialization/figma-mcp-install.md\` for details\n`);
    }

    stream.markdown(`\n---\n\nNeed help? Just ask me about these workflows!\n`);
  }
}
