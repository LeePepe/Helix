import * as vscode from 'vscode';
import { DesignSystemService } from '../../services/designSystemService';
import { FigmaService } from '../../services/figmaService';
import { PromptService } from '../../services/promptService';
import { ConfigService } from '../../services/configService';

export class FitFinishHandler {
  private configService: ConfigService;

  constructor(
    private designSystemService: DesignSystemService,
    private figmaService: FigmaService,
    private promptService: PromptService
  ) {
    this.configService = new ConfigService();
  }

  async handle(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    stream.progress('Starting Fit & Finish comparison...');

    // Parse input: extract Figma URL if present
    const figmaUrl = this.extractFigmaUrl(request.prompt);

    stream.markdown(`\n## Fit & Finish Analysis\n\n`);
    if (figmaUrl) {
      stream.markdown(`- **Figma**: ${figmaUrl}\n`);
    } else {
      stream.markdown(`- **Figma**: Desktop selection\n`);
    }
    stream.markdown(`- **User Input**: ${request.prompt}\n\n`);

    try {
      // Step 1: Fetch Figma design specs (from URL or Desktop selection)
      stream.progress(figmaUrl ? 'Fetching Figma design from URL...' : 'Fetching Figma design from Desktop selection...');
      const figmaSpec = await this.figmaService.getDesignContext(figmaUrl);

      // Step 2: Load design system guide and task prompt
      stream.progress('Loading design system guide and task prompt...');
      const designSystemGuide = this.designSystemService.getGuideContent();
      const taskPrompt = await this.promptService.loadTaskPrompt('fit-finish');

      // Step 3: Compose the system prompt with all context
      const systemPrompt = this.composeSystemPrompt(
        taskPrompt,
        designSystemGuide,
        figmaSpec,
        request.prompt
      );

      // Step 4: Start chat with the LLM
      stream.progress('Analyzing with AI...');

      const modelFamily = this.configService.getModelFamily();
      const models = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: modelFamily
      });

      if (models.length === 0) {
        throw new Error('No language model available. Please ensure GitHub Copilot or another AI provider is active.');
      }

      const messages = [
        vscode.LanguageModelChatMessage.User(systemPrompt)
      ];

      const response = await models[0].sendRequest(messages, {}, token);

      // Stream the response back to the user
      for await (const fragment of response.text) {
        stream.markdown(fragment);
      }

    } catch (error) {
      throw new Error(`Fit-Finish failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract Figma URL from user input if present
   */
  private extractFigmaUrl(prompt: string): string | undefined {
    const parts = prompt.split(/\s+/);
    return parts.find(part =>
      part.startsWith('http') && part.includes('figma.com')
    );
  }

  /**
   * Compose the system prompt with all necessary context
   */
  private composeSystemPrompt(
    taskPrompt: string,
    designSystemGuide: string,
    figmaSpec: any,
    userInput: string
  ): string {
    let prompt = '';

    // Add task prompt
    prompt += '# Task Instructions\n\n';
    prompt += taskPrompt;
    prompt += '\n\n';

    // Add design system guide
    prompt += '# Design System Guide\n\n';
    prompt += designSystemGuide;
    prompt += '\n\n';

    // Add Figma specification
    prompt += '# Figma Design Specification\n\n';
    prompt += '```json\n';
    prompt += JSON.stringify(figmaSpec, null, 2);
    prompt += '\n```\n\n';

    // Add user input
    prompt += '# User Request\n\n';
    prompt += userInput;
    prompt += '\n\n';

    return prompt;
  }
}
