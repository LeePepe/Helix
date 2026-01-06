import * as vscode from 'vscode';
import { TaskHandler } from './commandHandlers/taskHandler';
import { DesignSystemService } from '../services/designSystemService';
import { FigmaService } from '../services/figmaService';
import { PromptService } from '../services/promptService';
import { FileService } from '../services/fileService';
import { ConfigService } from '../services/configService';
import { ChatService } from '../services/chatService';
import { AgentBootstrap } from '../agents/AgentBootstrap';
import { AgentContext } from '../agents/base/types';
import { FrameworkDetector } from '../utils/frameworkDetector';

export class HelixParticipant {
  private taskHandler: TaskHandler;
  private designSystemService: DesignSystemService;
  private figmaService: FigmaService;
  private promptService: PromptService;
  private fileService: FileService;
  private configService: ConfigService;
  private chatService: ChatService;
  private agentBootstrap: AgentBootstrap;
  private frameworkDetector: FrameworkDetector;

  constructor(private context: vscode.ExtensionContext) {
    this.promptService = new PromptService(context.extensionUri);
    this.configService = new ConfigService();
    this.chatService = new ChatService(this.configService);
    this.designSystemService = new DesignSystemService(this.promptService, this.configService, this.chatService);
    this.figmaService = new FigmaService();
    this.fileService = new FileService();

    // Initialize framework detector
    this.frameworkDetector = new FrameworkDetector();

    // Initialize new Agent system
    this.agentBootstrap = new AgentBootstrap();

    // Inject services into unified task handler
    this.taskHandler = new TaskHandler(
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

      // Check MCP Status
      stream.progress('Validating Figma MCP status...');
      await this.figmaService.validateMcpStatus(stream);

      // Ensure design system guide exists
      let isInitialized = await this.designSystemService.ensureInitialized(stream, request, token);

      // Route based on slash command
      switch (request.command) {
        case 'fit-finish':
          // Use new Agent system for fit-finish
          await this.handleFitFinishWithAgents(request, stream, token);
          break;
        case 'gen-code':
          // Use new Agent system for gen-code
          await this.handleGenCodeWithAgents(request, stream, token);
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

  /**
   * Handle fit-finish command using the new Agent system
   */
  private async handleFitFinishWithAgents(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    // Extract Figma URL from request
    const figmaUrl = this.extractFigmaUrl(request.prompt);

    if (!figmaUrl) {
      stream.markdown('❌ Please provide a Figma URL. Example: `@helix /fit-finish https://figma.com/file/...`\n');
      return;
    }

    // Get workspace files (if needed)
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    // Create Agent context
    const agentContext: AgentContext = {
      workspaceRoot,
      stream,
      token,
      extensionContext: this.context
    };

    // Execute Fit & Finish Agent
    const fitFinishAgent = this.agentBootstrap.getFitFinishAgent();

    const result = await fitFinishAgent.execute({
      data: {
        figmaUrl,
        files: [], // TODO: Load relevant workspace files
        userRequest: request.prompt
      },
      context: agentContext
    });

    if (!result.success) {
      stream.markdown(`\n❌ **Error**: ${result.error}\n`);
    }
  }

  /**
   * Handle gen-code command using the new Agent system
   */
  private async handleGenCodeWithAgents(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    // Extract Figma URL from request
    const figmaUrl = this.extractFigmaUrl(request.prompt);

    if (!figmaUrl) {
      stream.markdown('❌ Please provide a Figma URL. Example: `@helix /gen-code https://figma.com/file/...`\n');
      return;
    }

    // Get workspace root
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    // Detect framework using hybrid approach
    let targetFramework: string | undefined;
    try {
      const designSystemGuide = await this.designSystemService.loadGuideContent();

      // Use FrameworkDetector with structured config + file system + keywords
      targetFramework = await this.frameworkDetector.detectFramework(
        designSystemGuide,
        workspaceRoot
      );

      console.log('[Helix] Framework detected:', targetFramework);

      // If still no framework detected, try LLM analysis
      if (!targetFramework) {
        console.log('[Helix] Trying LLM-based framework detection...');
        targetFramework = await this.frameworkDetector.detectWithLLM(
          designSystemGuide,
          async (prompt) => {
            // Use LLM to analyze design system guide
            const models = await vscode.lm.selectChatModels({
              family: this.configService.getModelFamily()
            });
            if (models.length === 0) {
              throw new Error('No language model available');
            }
            const messages = [vscode.LanguageModelChatMessage.User(prompt)];
            const response = await models[0].sendRequest(messages, {}, token);
            let text = '';
            for await (const part of response.stream) {
              if (part instanceof vscode.LanguageModelTextPart) {
                text += part.value;
              }
            }
            return text;
          }
        );
      }
    } catch (error) {
      console.warn('[Helix] Framework detection failed:', error);
      targetFramework = undefined;
    }

    // Allow prompt to override the detected framework
    const promptFramework = this.extractTargetFrameworkFromPrompt(request.prompt);
    if (promptFramework) {
      console.log('[Helix] Framework overridden by prompt:', promptFramework);
      targetFramework = promptFramework;
    }

    // Default to React if no framework detected
    if (!targetFramework) {
      targetFramework = 'React with TypeScript';
      console.log('[Helix] No framework detected, defaulting to:', targetFramework);
    }

    // Create Agent context
    const agentContext: AgentContext = {
      workspaceRoot,
      stream,
      token,
      extensionContext: this.context
    };

    // Execute Code Generation Agent
    const codeGenAgent = this.agentBootstrap.getCodeGenerationAgent();

    const result = await codeGenAgent.execute({
      data: {
        figmaUrl,
        targetFramework,
        userRequest: request.prompt
      },
      context: agentContext
    });

    if (!result.success) {
      stream.markdown(`\n❌ **Error**: ${result.error}\n`);
    }
  }

  /**
   * Extract Figma URL from prompt
   */
  private extractFigmaUrl(prompt: string): string | null {
    const figmaUrlRegex = /https?:\/\/(?:www\.)?figma\.com\/(?:file|design)\/[^\s]+/i;
    const match = prompt.match(figmaUrlRegex);
    return match ? match[0] : null;
  }

  /**
   * Extract target framework from prompt (for override)
   */
  private extractTargetFrameworkFromPrompt(prompt: string): string | undefined {
    // Check for common framework mentions
    const lowerPrompt = prompt.toLowerCase();

    console.log('[Helix] Extracting framework from prompt:', prompt);
    console.log('[Helix] Lower case prompt:', lowerPrompt);

    if (lowerPrompt.includes('swiftui') || lowerPrompt.includes('swift ui')) {
      console.log('[Helix] Detected framework: SwiftUI');
      return 'SwiftUI';
    } else if (lowerPrompt.includes('vue')) {
      console.log('[Helix] Detected framework: Vue 3');
      return 'Vue 3 with TypeScript';
    } else if (lowerPrompt.includes('angular')) {
      console.log('[Helix] Detected framework: Angular');
      return 'Angular with TypeScript';
    } else if (lowerPrompt.includes('svelte')) {
      console.log('[Helix] Detected framework: Svelte');
      return 'Svelte with TypeScript';
    } else if (lowerPrompt.includes('react')) {
      console.log('[Helix] Detected framework: React');
      return 'React with TypeScript';
    }

    // Return undefined if no framework mentioned in prompt
    console.log('[Helix] No framework mentioned in prompt');
    return undefined;
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
