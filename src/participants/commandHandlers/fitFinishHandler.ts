import * as vscode from 'vscode';
import { DesignSystemService } from '../../services/designSystemService';
import { FigmaService } from '../../services/figmaService';
import { FileService } from '../../services/fileService';
import { ReportService, ComparisonResult } from '../../services/reportService';
import { PromptService } from '../../services/promptService';

export class FitFinishHandler {
  private fileService: FileService;
  private reportService: ReportService;

  constructor(
    private designSystemService: DesignSystemService,
    private figmaService: FigmaService,
    private promptService: PromptService
  ) {
    this.fileService = new FileService();
    this.reportService = new ReportService();
  }

  async handle(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    stream.progress('Starting Fit & Finish comparison...');

    // Parse input: extract Figma URL and code file path
    const { figmaUrl, codeFilePath } = this.parseInput(request.prompt);

    if (!codeFilePath) {
      stream.markdown('❌ **Usage**: `@helix /fit-finish [figma-url] <code-file-path>`\n\n');
      stream.markdown('**Examples**:\n');
      stream.markdown('```\n');
      stream.markdown('# With Figma URL:\n');
      stream.markdown('@helix /fit-finish https://figma.com/file/ABC?node-id=123:456 src/Button.swift\n\n');
      stream.markdown('# With Desktop selection (no URL):\n');
      stream.markdown('@helix /fit-finish src/Button.swift\n');
      stream.markdown('```\n');
      return;
    }

    stream.markdown(`\n## Fit & Finish Analysis\n\n`);
    if (figmaUrl) {
      stream.markdown(`- **Figma**: ${figmaUrl}\n`);
    } else {
      stream.markdown(`- **Figma**: Desktop selection\n`);
    }
    stream.markdown(`- **Code**: ${codeFilePath}\n\n`);

    try {
      // Step 1: Fetch Figma design specs (from URL or Desktop selection)
      stream.progress(figmaUrl ? 'Fetching Figma design from URL...' : 'Fetching Figma design from Desktop selection...');
      const figmaSpec = await this.figmaService.getDesignContext(figmaUrl);

      // Step 2: Read code file
      stream.progress('Reading code implementation...');
      const codeContent = await this.fileService.readFile(codeFilePath);

      // Step 3: Compare using LLM
      stream.progress('Analyzing differences...');
      const comparison = await this.performComparison(
        figmaSpec,
        codeContent,
        codeFilePath,
        stream,
        token
      );

      // Step 4: Generate report
      stream.progress('Generating report...');
      const figmaSource = figmaUrl || 'figma-desktop-selection';
      const reportPath = await this.reportService.saveComparisonReport(
        comparison,
        figmaSource,
        codeFilePath
      );

      // Step 5: Display results
      stream.markdown(`\n### Summary\n\n`);
      stream.markdown(`- **Match Rate**: ${comparison.matchRate}%\n`);
      stream.markdown(`- **Total Differences**: ${comparison.totalDifferences}\n`);
      stream.markdown(`- **Critical**: ${comparison.criticalDifferences}\n`);
      stream.markdown(`- **Minor**: ${comparison.minorDifferences}\n`);
      stream.markdown(`- **Report**: \`${reportPath}\`\n\n`);

      // Add button to open report
      const workspaceRoot = this.fileService.getWorkspaceRoot();
      if (workspaceRoot) {
        const reportUri = vscode.Uri.file(`${workspaceRoot}/${reportPath}`);
        stream.button({
          command: 'vscode.open',
          title: 'Open Report',
          arguments: [reportUri]
        });
      }

      // Show quick summary of critical differences
      if (comparison.criticalDifferences > 0) {
        stream.markdown(`\n### Critical Differences\n\n`);
        const criticalDiffs = comparison.differences.filter(d => d.severity === 'critical');
        criticalDiffs.slice(0, 5).forEach((diff, index) => {
          stream.markdown(`${index + 1}. **${diff.property}**: Figma \`${diff.figmaValue}\` ≠ Code \`${diff.codeValue}\`\n`);
        });

        if (criticalDiffs.length > 5) {
          stream.markdown(`\n_...and ${criticalDiffs.length - 5} more (see report)_\n`);
        }

        stream.markdown(`\n💡 **Tip**: I can help you fix these differences. Just ask me to apply the fixes!\n`);
      } else {
        stream.markdown(`\n✅ **Great!** No critical differences found.\n`);
      }

    } catch (error) {
      throw new Error(`Fit-Finish failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private parseInput(prompt: string): { figmaUrl?: string; codeFilePath?: string } {
    const parts = prompt.split(/\s+/);

    // Extract Figma URL if present
    const figmaUrl = parts.find(part =>
      part.startsWith('http') && part.includes('figma.com')
    );

    // Extract file path (looks like a code file path, not a URL)
    const codeFilePath = parts.find(part =>
      part.includes('/') && !part.startsWith('http') &&
      (part.endsWith('.swift') || part.endsWith('.ts') || part.endsWith('.tsx') ||
       part.endsWith('.js') || part.endsWith('.jsx') || part.endsWith('.vue') ||
       part.endsWith('.py') || part.endsWith('.java') || part.endsWith('.kt'))
    );

    return { figmaUrl, codeFilePath };
  }

  private async performComparison(
    figmaSpec: any,
    codeContent: string,
    codeFilePath: string,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<ComparisonResult> {
    // Show loading notifications
    stream.markdown('🎨 Loading design system guide...\n\n');
    stream.markdown('📋 Loading task prompt...\n\n');

    // Load design system guide
    const designSystemGuide = this.designSystemService.getGuideContent();

    // Load task prompt (now includes both base prompt and workflow guide)
    const basePrompt = await this.promptService.loadTaskPrompt('fit-finish');

    // Compose final prompt (simple concatenation)
    const systemPrompt = this.promptService.composePrompt(
      basePrompt,
      designSystemGuide,
      figmaSpec,
      { codeContent, codeFilePath }  // Additional context
    );

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
        throw new Error(`Failed to parse comparison result: ${parseError}`);
      }
    }

    throw new Error('Failed to extract comparison result from LLM response');
  }
}
