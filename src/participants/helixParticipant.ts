import * as vscode from 'vscode';
import * as chatUtils from '@vscode/chat-extension-utils';
import { TaskHandler } from './commandHandlers/taskHandler';
import { DesignSystemService } from '../services/designSystemService';
import { FigmaService } from '../services/figmaService';
import { PromptService } from '../services/promptService';
import { FileService } from '../services/fileService';
import { ConfigService } from '../services/configService';

export class HelixParticipant {
  private taskHandler: TaskHandler;
  private designSystemService: DesignSystemService;
  private figmaService: FigmaService;
  private promptService: PromptService;
  private fileService: FileService;
  private configService: ConfigService;

  constructor(private context: vscode.ExtensionContext) {
    this.promptService = new PromptService(context.extensionUri);
    this.configService = new ConfigService();
    this.designSystemService = new DesignSystemService(this.promptService, this.configService);
    this.figmaService = new FigmaService();
    this.fileService = new FileService();

    // Inject services into unified task handler
    this.taskHandler = new TaskHandler(
      this.designSystemService,
      this.figmaService,
      this.promptService,
      context.extensionMode
    );
  }

  async handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    try {
      // Load design system guide once (or initialize if doesn't exist)
      if (!this.designSystemService.isLoaded()) {
        stream.progress('Loading design system guide...');
        await this.designSystemService.loadOrInitialize(stream);
      }

      // Route based on slash command
      switch (request.command) {
        case 'fit-finish':
          return await this.taskHandler.handle('fit-finish', request, context, stream, token);
        case 'gen-code':
          return await this.taskHandler.handle('gen-code', request, context, stream, token);
        default:
          // No command specified - show help
          return await this.showHelp(request, context, stream, token);
      }
    } catch (error) {
      stream.markdown(`\n\n❌ **Error**: ${error instanceof Error ? error.message : String(error)}\n`);
      console.error('Helix chat participant error:', error);
      return {};
    }
  }

  private async showHelp(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    // Check Figma MCP availability
    const figmaStatus = this.figmaService.checkToolsAvailable();
    
    // Load help content from docs
    let helpContent = '';
    try {
      helpContent = await this.fileService.readFile('docs/readme/helix-help.md');
    } catch (e) {
      helpContent = `# Helix Design Workflows\n\nHelp file not found. Expected at \`docs/readme/helix-help.md\`.\n`;
    }

    // Build status information
    let statusInfo = `### Design System Guide\n`;
    if (this.designSystemService.isLoaded()) {
      statusInfo += `✅ Loaded from: \`${this.designSystemService.getGuidePath()}\`\n\n`;
    } else {
      statusInfo += `❌ Not loaded. Configure path in settings: \`helix.designSystemPath\`\n\n`;
    }

    statusInfo += `### Figma MCP Tools\n`;
    if (figmaStatus.available) {
      if (figmaStatus.hasDesktop) {
        statusInfo += `✅ **Desktop MCP**: Available (selection-based access)\n`;
      }
      if (figmaStatus.hasRemote) {
        statusInfo += `✅ **Remote MCP**: Available (URL-based access)\n`;
      }
      statusInfo += `\n**Available Figma MCP tools** (${figmaStatus.toolNames.length}):\n`;
      figmaStatus.toolNames.forEach(name => {
        statusInfo += `- \`${name}\`\n`;
      });
    } else {
      statusInfo += `❌ Not installed. Please configure Figma MCP servers in \`.vscode/mcp.json\`\n`;
    }

    statusInfo += `\n---\n\nNeed help? Just ask me about these workflows!\n`;

    // Build system prompt for help
    const systemPrompt = `You are Helix, a design-to-code assistant. Answer the user's question based on the following help documentation and status information.

# Help Documentation
${helpContent}

# Current Status
${statusInfo}

If the user has no specific question, provide a friendly overview of your capabilities.`;

    // Use chat-extension-utils
    const libResult = chatUtils.sendChatParticipantRequest(
      request,
      context,
      {
        prompt: systemPrompt,
        responseStreamOptions: {
          stream,
          references: true,
          responseText: true
        },
        extensionMode: this.context.extensionMode
      },
      token
    );

    return await libResult.result;
  }
}
