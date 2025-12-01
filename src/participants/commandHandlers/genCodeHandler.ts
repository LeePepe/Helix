import * as vscode from 'vscode';
import { DesignSystemService } from '../../services/designSystemService';
import { FigmaService } from '../../services/figmaService';
import { FileService } from '../../services/fileService';

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

  constructor(
    private designSystemService: DesignSystemService,
    private figmaService: FigmaService
  ) {
    this.fileService = new FileService();
  }

  async handle(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    stream.progress('Starting code generation from Figma...');

    // Parse input: extract Figma URL
    const figmaUrl = this.parseInput(request.prompt);

    if (!figmaUrl) {
      stream.markdown('❌ **Usage**: `@helix /gen-code <figma-url>`\n\n');
      stream.markdown('**Example**:\n');
      stream.markdown('```\n');
      stream.markdown('@helix /gen-code https://figma.com/file/ABC?node-id=789:012\n');
      stream.markdown('```\n');
      return;
    }

    stream.markdown(`\n## Generate Code from Figma\n\n`);
    stream.markdown(`- **Figma**: ${figmaUrl}\n\n`);

    try {
      // Step 1: Fetch Figma design specs
      stream.progress('Fetching Figma design specifications...');
      const figmaSpec = await this.figmaService.getDesignContext(figmaUrl);

      // Step 2: Generate code using LLM
      stream.progress('Generating production-ready code...');
      const generatedCode = await this.generateCode(
        figmaSpec,
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
      stream.markdown(`2. Add localization keys to your .xcstrings file\n`);
      stream.markdown(`3. I can create the file at the suggested path for you\n`);
      stream.markdown(`4. Test in all supported themes (light/dark)\n`);
      stream.markdown(`5. Run build and lint commands\n\n`);

      stream.markdown(`💡 **Tip**: Ask me to "create the file" and I'll save it to the suggested path!\n`);

    } catch (error) {
      throw new Error(`Code generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private parseInput(prompt: string): string | undefined {
    // Extract Figma URL pattern
    const figmaUrlMatch = prompt.match(/https:\/\/(?:www\.)?figma\.com\/[^\s]+/);
    return figmaUrlMatch?.[0];
  }

  private async generateCode(
    figmaSpec: any,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<GeneratedCode> {
    // Use VSCode's language model to generate code
    const designSystemGuide = this.designSystemService.getGuideContent();

    const systemPrompt = `You are a SwiftUI code generation specialist. Generate production-ready SwiftUI code from the Figma design specification.

Design System Guide (use these tokens):
${designSystemGuide.substring(0, 10000)} ... [truncated]

Figma Design Specification:
${JSON.stringify(figmaSpec, null, 2)}

Requirements:
1. Generate complete, working SwiftUI code
2. Use design system tokens from the guide (Color.Theme.*, Typography.*, etc.)
3. Map Figma properties to appropriate SwiftUI modifiers
4. Include accessibility attributes for all interactive elements
5. Use localization keys for all user-facing text (never hardcode strings)
6. Support both light and dark themes via design system tokens
7. Follow SwiftUI best practices
8. Add helpful comments for complex logic

Return ONLY valid JSON (no markdown, no explanation):
{
  "code": "string (complete SwiftUI code)",
  "componentName": "string (component/view name)",
  "suggestedPath": "string (suggested file path like 'src/Views/ComponentName.swift')",
  "designTokensUsed": {
    "colors": ["Color.Theme.primary", "Color.Theme.background"],
    "typography": [".font(.titleLarge)", ".font(.bodyDefault)"],
    "icons": ["FluentIcon.add", "FluentIcon.checkmark"],
    "other": ["Constants.cornerRadius", "Shadow.medium"]
  },
  "localizationKeys": [
    {
      "key": "button.submit.title",
      "description": "Submit button title"
    }
  ]
}`;

    const models = await vscode.lm.selectChatModels({
      vendor: 'copilot',
      family: 'gpt-4'
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
}
