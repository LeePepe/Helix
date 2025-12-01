import * as vscode from 'vscode';
import { DesignSystemService } from '../../services/designSystemService';
import { FigmaService } from '../../services/figmaService';
import { FileService } from '../../services/fileService';
import { ReportService, ComparisonResult } from '../../services/reportService';

export class FitFinishHandler {
  private fileService: FileService;
  private reportService: ReportService;

  constructor(
    private designSystemService: DesignSystemService,
    private figmaService: FigmaService
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

    if (!figmaUrl || !codeFilePath) {
      stream.markdown('❌ **Usage**: `@helix /fit-finish <figma-url> <code-file-path>`\n\n');
      stream.markdown('**Example**:\n');
      stream.markdown('```\n');
      stream.markdown('@helix /fit-finish https://figma.com/file/ABC?node-id=123:456 src/Button.swift\n');
      stream.markdown('```\n');
      return;
    }

    stream.markdown(`\n## Fit & Finish Analysis\n\n`);
    stream.markdown(`- **Figma**: ${figmaUrl}\n`);
    stream.markdown(`- **Code**: ${codeFilePath}\n\n`);

    try {
      // Step 1: Fetch Figma design specs
      stream.progress('Fetching Figma design specifications...');
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
      const reportPath = await this.reportService.saveComparisonReport(
        comparison,
        figmaUrl,
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
    // Extract Figma URL pattern
    const figmaUrlMatch = prompt.match(/https:\/\/(?:www\.)?figma\.com\/[^\s]+/);

    // Extract file path (anything after the URL that looks like a path)
    const parts = prompt.split(/\s+/);
    const codeFilePath = parts.find(part =>
      part.includes('/') && !part.startsWith('http') &&
      (part.endsWith('.swift') || part.endsWith('.ts') || part.endsWith('.tsx') ||
       part.endsWith('.js') || part.endsWith('.jsx') || part.endsWith('.vue') ||
       part.endsWith('.py') || part.endsWith('.java') || part.endsWith('.kt'))
    );

    return {
      figmaUrl: figmaUrlMatch?.[0],
      codeFilePath
    };
  }

  private async performComparison(
    figmaSpec: any,
    codeContent: string,
    codeFilePath: string,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<ComparisonResult> {
    // Use VSCode's language model to analyze differences
    const designSystemGuide = this.designSystemService.getGuideContent();

    const systemPrompt = `You are a design QA specialist. Compare the Figma design with the code implementation.

Design System Guide (for token reference):
${designSystemGuide.substring(0, 8000)} ... [truncated]

Figma Specification:
${JSON.stringify(figmaSpec, null, 2)}

Code Implementation (${codeFilePath}):
\`\`\`
${codeContent}
\`\`\`

Analyze and report differences across these categories:
1. **Colors** (background, text, borders)
2. **Typography** (font family, size, weight, line height)
3. **Spacing** (padding, margins)
4. **Dimensions** (width, height, corner radius)
5. **Layout** (alignment, direction)
6. **Visual effects** (shadows, opacity)

For each difference, determine:
- **Severity**: "critical" (affects visual appearance significantly) or "minor" (subtle difference)
- **Property**: Name of the property (e.g., "Background Color", "Font Size")
- **Figma Value**: Value in Figma design
- **Code Value**: Value in code
- **Fix**: Specific change needed (e.g., "Change background from #F0F0F0 to #FFFFFF")

Also identify properties that MATCH between Figma and code.

Return ONLY valid JSON (no markdown, no explanation):
{
  "componentName": "string (extract from Figma or code)",
  "matchRate": number (0-100),
  "totalDifferences": number,
  "criticalDifferences": number,
  "minorDifferences": number,
  "differences": [
    {
      "category": "color|typography|spacing|dimension|layout|effect",
      "severity": "critical|minor",
      "property": "string",
      "figmaValue": "string",
      "codeValue": "string",
      "fix": "string"
    }
  ],
  "matches": ["list of matching properties"]
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
        throw new Error(`Failed to parse comparison result: ${parseError}`);
      }
    }

    throw new Error('Failed to extract comparison result from LLM response');
  }
}
