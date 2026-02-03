import * as vscode from 'vscode';
import { TaskOrchestrator } from './TaskOrchestrator';
import { DesignSystemService } from '../services/designSystemService';
import { FigmaService } from '../services/figmaService';
import { PromptService } from '../services/promptService';
import { ConfigService } from '../services/configService';

export class HelixParticipant {
  private taskOrchestrator: TaskOrchestrator;
  private designSystemService: DesignSystemService;
  private figmaService: FigmaService;
  private promptService: PromptService;
  private configService: ConfigService;

  constructor(private context: vscode.ExtensionContext) {
    this.promptService = new PromptService(context.extensionUri);
    this.configService = new ConfigService();
    this.designSystemService = new DesignSystemService(this.promptService, this.configService);
    this.figmaService = new FigmaService();

    // Initialize new task orchestrator
    this.taskOrchestrator = new TaskOrchestrator();
  }

  async handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    try {

      // Check MCP Status (configuration and Figma Desktop connection)
      stream.progress('Validating Figma MCP status...');
      const mcpStatus = await this.figmaService.validateMcpStatus(stream);

      // If MCP is not available, still allow proceeding but commands may fail
      if (!mcpStatus.available) {
        // Only block if a command is specified that requires Figma
        if (request.command === 'fit-finish' || request.command === 'gen-code') {
          stream.markdown('❌ **Cannot proceed without Figma connection.** Please complete the setup above and try again.\n\n');
          return;
        }
      }

      // Ensure design system guide exists
      let isInitialized = await this.designSystemService.ensureInitialized(stream, token, request.toolInvocationToken);

      // Route based on slash command
      switch (request.command) {
        case 'fit-finish':
          // Use new refactored architecture
          await this.taskOrchestrator.fitAndFinish(request, stream, token);
          break;
        case 'gen-code':
          // Use new refactored architecture
          await this.taskOrchestrator.buildFromFigma(request, stream, token);
          break;
        default:
          // No command specified - show help only if project was already initialized
          if (isInitialized) {
            await this.showHelp(stream);
          }
      }
    } catch (error) {
      stream.markdown(`\n\n❌ **Error**: ${error instanceof Error ? error.message : String(error)}\n`);
      console.error('Helix chat participant error:', error);
    }
  }

  private async showHelp(stream: vscode.ChatResponseStream): Promise<void> {
    // Check Figma MCP availability
    const figmaStatus = this.figmaService.checkToolsAvailable();
    // Load help content from extension's docs folder
    try {
      const helpFileUri = vscode.Uri.joinPath(this.context.extensionUri, 'docs', 'readme', 'helix-help.md');
      const helpContent = await vscode.workspace.fs.readFile(helpFileUri);
      const helpMarkdown = Buffer.from(helpContent).toString('utf8');
      stream.markdown(helpMarkdown);
    } catch (e) {
      stream.markdown(`# Helix Design Workflows\n\nHelp file not found. Expected at \`docs/readme/helix-help.md\`.\n`);
    }

    // Show status of prerequisites
    stream.markdown(`### Design System Guide\n`);
    if (await this.designSystemService.checkDesignSystemExists()) {
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
      stream.markdown(`\n**Available Figma MCP tools** (${figmaStatus.toolNames.length}):\n`);
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
