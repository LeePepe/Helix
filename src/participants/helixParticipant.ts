import * as vscode from 'vscode';
import { FitFinishHandler } from './commandHandlers/fitFinishHandler';
import { GenCodeHandler } from './commandHandlers/genCodeHandler';
import { DesignSystemService } from '../services/designSystemService';
import { FigmaService } from '../services/figmaService';
import { PromptService } from '../services/promptService';
import { FileService } from '../services/fileService';

export class HelixParticipant {
  private fitFinishHandler: FitFinishHandler;
  private genCodeHandler: GenCodeHandler;
  private designSystemService: DesignSystemService;
  private figmaService: FigmaService;
  private promptService: PromptService;
  private fileService: FileService;

  constructor(private context: vscode.ExtensionContext) {
    this.promptService = new PromptService();
    this.designSystemService = new DesignSystemService(this.promptService);
    this.figmaService = new FigmaService();
    this.fileService = new FileService();

    // Inject services into handlers
    this.fitFinishHandler = new FitFinishHandler(
      this.designSystemService,
      this.figmaService,
      this.promptService
    );
    this.genCodeHandler = new GenCodeHandler(
      this.designSystemService,
      this.figmaService,
      this.promptService
    );
  }

  async handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    try {
      // Load design system guide once (or initialize if doesn't exist)
      if (!this.designSystemService.isLoaded()) {
        stream.progress('Loading design system guide...');
        await this.designSystemService.loadOrInitialize(stream);
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
    // Load help content from docs
    try {
      const helpMarkdown = await this.fileService.readFile('docs/readme/helix-help.md');
      stream.markdown(helpMarkdown);
    } catch (e) {
      stream.markdown(`# Helix Design Workflows\n\nHelp file not found. Expected at \`docs/readme/helix-help.md\`.\n`);
    }

    // Show status of prerequisites
    stream.markdown(`### Design System Guide\n`);
    if (this.designSystemService.isLoaded()) {
      stream.markdown(`✅ Loaded from: \`${this.designSystemService.getGuidePath()}\`\n\n`);
    } else {
      stream.markdown(`❌ Not loaded. Configure path in settings: \`helix.designSystemPath\`\n\n`);
    }

    stream.markdown(`### Figma MCP Tools\n`);
    if (figmaStatus.available) {
      if (figmaStatus.hasDesktop) {
        stream.markdown(`✅ **Desktop MCP**: Available (selection-based access)\n`);
      }
      if (figmaStatus.hasRemote) {
        stream.markdown(`✅ **Remote MCP**: Available (URL-based access)\n`);
      }
      stream.markdown(`\n**Available tools** (${figmaStatus.toolNames.length}):\n`);
      figmaStatus.toolNames.forEach(name => {
        stream.markdown(`- \`${name}\`\n`);
      });
    } else {
      stream.markdown(`❌ Not installed. Please configure Figma MCP servers in \`.vscode/mcp.json\`:\n\n`);
      stream.markdown(`**For Desktop MCP** (selection-based):\n`);
      stream.markdown(`\`\`\`json\n`);
      stream.markdown(`{\n`);
      stream.markdown(`  "servers": {\n`);
      stream.markdown(`    "figma-desktop": {\n`);
      stream.markdown(`      "type": "http",\n`);
      stream.markdown(`      "url": "http://127.0.0.1:3845/mcp"\n`);
      stream.markdown(`    }\n`);
      stream.markdown(`  }\n`);
      stream.markdown(`}\n`);
      stream.markdown(`\`\`\`\n\n`);
      stream.markdown(`**For Remote MCP** (URL-based):\n`);
      stream.markdown(`\`\`\`json\n`);
      stream.markdown(`{\n`);
      stream.markdown(`  "servers": {\n`);
      stream.markdown(`    "figma": {\n`);
      stream.markdown(`      "type": "http",\n`);
      stream.markdown(`      "url": "https://mcp.figma.com/mcp"\n`);
      stream.markdown(`    }\n`);
      stream.markdown(`  }\n`);
      stream.markdown(`}\n`);
      stream.markdown(`\`\`\`\n`);
    }

    stream.markdown(`\n---\n\nNeed help? Just ask me about these workflows!\n`);
  }
}
