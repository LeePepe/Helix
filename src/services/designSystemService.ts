import * as vscode from 'vscode';
import { PromptService } from './promptService';
import { ConfigService } from './configService';
import { ChatService } from './chatService';

export class DesignSystemService {
  private designSystemPath: string | null = null;
  private promptService: PromptService;
  private configService: ConfigService;
  private chatService: ChatService;

  constructor(promptService: PromptService, configService: ConfigService, chatService: ChatService) {
    this.promptService = promptService;
    this.configService = configService;
    this.chatService = chatService;
  }

  /**
   * Load the design system guide content from file
   */
  async loadGuideContent(): Promise<string> {
    const configPath = this.configService.getDesignSystemPath();
    console.log(`[Helix]Loading design system guide from path: ${configPath}`);
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open. Please open a workspace to use Helix.');
    }

    const designSystemUri = vscode.Uri.joinPath(workspaceFolder.uri, configPath);
    this.designSystemPath = designSystemUri.fsPath;

    try {
      const fileContent = await vscode.workspace.fs.readFile(designSystemUri);
      console.log(`[Helix]Design system guide loaded from: ${this.designSystemPath}`);
      return Buffer.from(fileContent).toString('utf8');
    } catch (error) {
      throw new Error(
        `Failed to load design system guide at "${configPath}". ` +
        `Please ensure the file exists or update the path in settings (helix.designSystemPath).`
      );
    }
  }

  /**
   * Check if the design system guide file exists
   */
  async checkDesignSystemExists(): Promise<boolean> {
    const configPath = this.configService.getDesignSystemPath();
    console.log(`[Helix]Checking for design system guide at path: ${configPath}`);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return false;
    }

    const designSystemUri = vscode.Uri.joinPath(workspaceFolder.uri, configPath);
    this.designSystemPath = designSystemUri.fsPath;

    try {
      await vscode.workspace.fs.stat(designSystemUri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure design system guide exists, initialize if it doesn't
   */
  async ensureInitialized(stream: vscode.ChatResponseStream, request: vscode.ChatRequest, token: vscode.CancellationToken): Promise<boolean> {
    const exists = await this.checkDesignSystemExists();

    if (exists) {
      return true;
    }

    // Guide doesn't exist - start initialization
    stream.markdown(`## Design System Guide Not Found\n\n`);
    stream.markdown(`I need to create a design system guide for your project.\n\n`);
    stream.markdown(`This will analyze your codebase to extract:\n`);
    stream.markdown(`- Platform/framework and programming language\n`);
    stream.markdown(`- Color tokens and naming patterns\n`);
    stream.markdown(`- Typography definitions\n`);
    stream.markdown(`- Spacing/sizing scales\n`);
    stream.markdown(`- Component patterns\n`);
    stream.markdown(`- Localization approach\n`);
    stream.markdown(`- Coding conventions\n\n`);

    stream.progress('Generating design system guide...');

    // Generate design system guide
    await this.generateDesignSystemGuide(request, stream, token);

    stream.markdown(`✅ **Design System Guide Created**\n\n`);
    stream.markdown(`Saved to: \`${this.designSystemPath}\`\n\n`);
    return false;
  }

  /**
   * Generate a design system guide from codebase analysis
   */
  private async generateDesignSystemGuide(request: vscode.ChatRequest, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<string> {
    // Load generation prompt from external file
    const promptFileContent = await this.promptService.loadInitializationPrompt('design-system-rules-prompt.md');

    const messages = [vscode.LanguageModelChatMessage.User(promptFileContent)];
    
    return await this.chatService.sendRequest(messages, { request, stream, token });
  }

  /**
   * Save the design system guide to the workspace
   */
  async saveDesignSystem(content: string): Promise<void> {
    const configPath = this.configService.getDesignSystemPath();

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }

    const designSystemUri = vscode.Uri.joinPath(workspaceFolder.uri, configPath);
    this.designSystemPath = designSystemUri.fsPath;

    // Create directory if it doesn't exist
    const dirUri = vscode.Uri.joinPath(workspaceFolder.uri, configPath.substring(0, configPath.lastIndexOf('/')));
    try {
      await vscode.workspace.fs.createDirectory(dirUri);
    } catch {
      // Directory might already exist, that's fine
    }

    // Write the file
    const fileContent = Buffer.from(content, 'utf8');
    await vscode.workspace.fs.writeFile(designSystemUri, fileContent);

    console.log(`[Helix]Design system guide saved to: ${this.designSystemPath}`);
  }


  /**
   * Get the path to the design system guide
   */
  getGuidePath(): string | null {
    return this.designSystemPath;
  }
}

