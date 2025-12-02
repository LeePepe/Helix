import * as vscode from 'vscode';
import { DesignSystemService } from '../../services/designSystemService';
import { FigmaService } from '../../services/figmaService';
import { FileService } from '../../services/fileService';
import { PromptService } from '../../services/promptService';
import { ConfigService } from '../../services/configService';

export interface GeneratedCode {
  code: string;
  componentName: string;
  suggestedPath: string;
  designTokensUsed: {
    colors: string[];
    typography: string[];
    icons: string[];
    other: string[];
  };
  localizationKeys: Array<{
    key: string;
    description: string;
  }>;
}

export class GenCodeHandler {
  private fileService: FileService;
  private configService: ConfigService;

  constructor(
    private designSystemService: DesignSystemService,
    private figmaService: FigmaService,
    private promptService: PromptService
  ) {
    this.fileService = new FileService();
    this.configService = new ConfigService();
  }

  async handle(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    stream.progress('Starting code generation from Figma...');

    // Parse input: check for Figma URL
    const figmaUrl = this.parseFigmaUrl(request.prompt);

    stream.markdown(`\n## Generate Code from Figma\n\n`);
    if (figmaUrl) {
      stream.markdown(`- **Source**: ${figmaUrl}\n`);
    } else {
      stream.markdown(`- **Source**: Figma Desktop selection\n`);
    }
    stream.markdown(`- **User Input**: ${request.prompt}\n\n`);

    try {
      // Step 1: Fetch Figma design specs (from URL or Desktop selection)
      stream.progress(figmaUrl ? 'Fetching Figma design from URL...' : 'Fetching Figma design from Desktop selection...');
      const figmaSpec = await this.figmaService.getDesignContext(figmaUrl);

      // Step 2: Generate code using LLM
      stream.progress('Generating production-ready code...');
      const generatedCode = await this.generateCode(
        figmaSpec,
        request.prompt,
        stream,
        token
      );

      // Step 3: Display generated code
      stream.markdown(`\n### Generated Code: ${generatedCode.componentName}\n\n`);

      // Show the code
      stream.markdown(`\`\`\`swift\n${generatedCode.code}\n\`\`\`\n\n`);

      // Show design system usage
      stream.markdown(`### Design System Usage\n\n`);
      if (generatedCode.designTokensUsed.colors.length > 0) {
        stream.markdown(`**Colors**: ${generatedCode.designTokensUsed.colors.join(', ')}\n\n`);
      }
      if (generatedCode.designTokensUsed.typography.length > 0) {
        stream.markdown(`**Typography**: ${generatedCode.designTokensUsed.typography.join(', ')}\n\n`);
      }
      if (generatedCode.designTokensUsed.icons.length > 0) {
        stream.markdown(`**Icons**: ${generatedCode.designTokensUsed.icons.join(', ')}\n\n`);
      }

      // Show localization keys
      if (generatedCode.localizationKeys.length > 0) {
        stream.markdown(`### Localization Keys Required\n\n`);
        generatedCode.localizationKeys.forEach(loc => {
          stream.markdown(`- \`${loc.key}\`: ${loc.description}\n`);
        });
        stream.markdown(`\n`);
      }

      // Show suggested file path
      stream.markdown(`### Suggested File Path\n\n`);
      stream.markdown(`\`${generatedCode.suggestedPath}\`\n\n`);

      // Offer to create the file
      stream.markdown(`### Next Steps\n\n`);
      stream.markdown(`1. Review the generated code\n`);
      stream.markdown(`2. Add localization keys to your localization file\n`);
      stream.markdown(`3. I can create the file at the suggested path for you\n`);
      stream.markdown(`4. Test in all supported themes (light/dark)\n`);
      stream.markdown(`5. Run build and lint commands\n\n`);

      stream.markdown(`💡 **Tip**: Ask me to "create the file" and I'll save it to the suggested path!\n`);

    } catch (error) {
      throw new Error(`Code generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async generateCode(
    figmaSpec: any,
    userInput: string,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<GeneratedCode> {
    // Show loading notifications
    stream.markdown('🎨 Loading design system guide...\n\n');
    stream.markdown('📋 Loading task prompt...\n\n');

    // Load design system guide
    const designSystemGuide = this.designSystemService.getGuideContent();

    // Load task prompt (now includes both base prompt and workflow guide)
    const basePrompt = await this.promptService.loadTaskPrompt('gen-code');

    // Compose final prompt (simple concatenation)
    const systemPrompt = this.promptService.composePrompt(
      basePrompt,
      designSystemGuide,
      figmaSpec,
      { userInput }
    );

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

    let fullResponse = '';
    for await (const fragment of response.text) {
      fullResponse += fragment;
    }

    // Parse JSON from response
    const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const result = JSON.parse(jsonMatch[0]);
        return result;
      } catch (parseError) {
        throw new Error(`Failed to parse generated code: ${parseError}`);
      }
    }

    throw new Error('Failed to extract generated code from LLM response');
  }

  private parseFigmaUrl(prompt: string): string | undefined {
    // Extract Figma URL if present (starts with https://figma.com or www.figma.com)
    const urlMatch = prompt.match(/(https?:\/\/(?:www\.)?figma\.com\/[^\s]+)/);
    return urlMatch?.[1];
  }
}
