import * as vscode from 'vscode';
import { PromptService } from './promptService';

export class DesignSystemService {
  private designSystemContent: string | null = null;
  private designSystemPath: string | null = null;
  private promptService: PromptService;

  constructor(promptService: PromptService) {
    this.promptService = promptService;
  }

  /**
   * Load the design system guide from the workspace
   */
  async loadDesignSystem(): Promise<void> {
    const config = vscode.workspace.getConfiguration('helix');
    const configPath = config.get<string>('designSystemPath', '.github/design-system-guide.md');

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open. Please open a workspace to use Helix.');
    }

    const designSystemUri = vscode.Uri.joinPath(workspaceFolder.uri, configPath);
    this.designSystemPath = designSystemUri.fsPath;

    try {
      const fileContent = await vscode.workspace.fs.readFile(designSystemUri);
      this.designSystemContent = Buffer.from(fileContent).toString('utf8');
      console.log(`Design system guide loaded from: ${this.designSystemPath}`);
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
    const config = vscode.workspace.getConfiguration('helix');
    const configPath = config.get<string>('designSystemPath', '.github/design-system-guide.md');

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return false;
    }

    const designSystemUri = vscode.Uri.joinPath(workspaceFolder.uri, configPath);

    try {
      await vscode.workspace.fs.stat(designSystemUri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load design system guide or initialize if it doesn't exist
   * Semi-automatic: analyze codebase, show summary, request approval
   */
  async loadOrInitialize(stream: vscode.ChatResponseStream): Promise<void> {
    const exists = await this.checkDesignSystemExists();

    if (exists) {
      // Load existing guide
      stream.markdown('🎨 Loading design system guide...\n\n');
      await this.loadDesignSystem();
      return;
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

    stream.progress('Analyzing codebase...');

    // Analyze codebase
    const analysis = await this.analyzeCodebase();

    // Show analysis summary
    stream.markdown(`### Analysis Results\n\n`);
    stream.markdown(`**Detected Platform**: ${analysis.platform}\n`);
    stream.markdown(`**Programming Language**: ${analysis.language}\n`);
    stream.markdown(`**Color Tokens Found**: ${analysis.colorTokens.length}\n`);
    stream.markdown(`**Typography Patterns**: ${analysis.typographyPatterns.length}\n`);
    stream.markdown(`**Component Files**: ${analysis.componentFiles.length}\n`);
    stream.markdown(`**Localization Format**: ${analysis.localizationFormat}\n\n`);

    // Generate design system guide
    stream.progress('Generating design system guide...');
    const guideContent = await this.generateDesignSystemGuide(analysis);

    // Save the guide
    await this.saveDesignSystem(guideContent);

    // Load into memory
    this.designSystemContent = guideContent;

    stream.markdown(`✅ **Design System Guide Created**\n\n`);
    stream.markdown(`Saved to: \`${this.designSystemPath}\`\n\n`);
  }

  /**
   * Analyze the codebase to detect design system patterns
   */
  private async analyzeCodebase(): Promise<CodebaseAnalysis> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }

    // Use VSCode's language model to analyze the codebase
    const models = await vscode.lm.selectChatModels({
      vendor: 'copilot',
      family: 'gpt-4'
    });

    if (models.length === 0) {
      throw new Error('No language model available for codebase analysis');
    }

    // Load analysis prompt from external file
    const analysisPrompt = await this.promptService.loadPrompt('analyze-codebase.prompt.md');

    const messages = [vscode.LanguageModelChatMessage.User(analysisPrompt)];
    const response = await models[0].sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

    let fullResponse = '';
    for await (const fragment of response.text) {
      fullResponse += fragment;
    }

    // Parse JSON response
    const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback defaults if analysis fails
    return {
      platform: 'Unknown',
      language: 'Unknown',
      colorTokens: [],
      typographyPatterns: [],
      componentFiles: [],
      localizationFormat: 'Unknown'
    };
  }

  /**
   * Generate a design system guide from codebase analysis
   */
  private async generateDesignSystemGuide(analysis: CodebaseAnalysis): Promise<string> {
    const models = await vscode.lm.selectChatModels({
      vendor: 'copilot',
      family: 'gpt-4'
    });

    if (models.length === 0) {
      throw new Error('No language model available for guide generation');
    }

    // Load generation prompt from external file
    let generationPrompt = await this.promptService.loadPrompt('generate-design-guide.prompt.md');

    // Replace placeholder with actual analysis JSON
    generationPrompt = generationPrompt.replace(
      '{{ANALYSIS_JSON}}',
      JSON.stringify(analysis, null, 2)
    );

    const messages = [vscode.LanguageModelChatMessage.User(generationPrompt)];
    const response = await models[0].sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

    let fullResponse = '';
    for await (const fragment of response.text) {
      fullResponse += fragment;
    }

    return fullResponse;
  }

  /**
   * Save the design system guide to the workspace
   */
  async saveDesignSystem(content: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('helix');
    const configPath = config.get<string>('designSystemPath', '.github/design-system-guide.md');

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

    console.log(`Design system guide saved to: ${this.designSystemPath}`);
  }

  /**
   * Get the loaded design system content
   */
  getGuideContent(): string {
    if (!this.designSystemContent) {
      throw new Error('Design system guide not loaded. Call loadDesignSystem() first.');
    }
    return this.designSystemContent;
  }

  /**
   * Check if the design system is loaded
   */
  isLoaded(): boolean {
    return this.designSystemContent !== null;
  }

  /**
   * Get the path to the design system guide
   */
  getGuidePath(): string | null {
    return this.designSystemPath;
  }
}

/**
 * Codebase analysis result
 */
interface CodebaseAnalysis {
  platform: string;
  language: string;
  colorTokens: string[];
  typographyPatterns: string[];
  componentFiles: string[];
  localizationFormat: string;
}
