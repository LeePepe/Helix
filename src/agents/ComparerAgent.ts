import * as vscode from 'vscode';
import { BaseAgent } from './base/Agent';
import { CompareResult, CompareResultSchema } from '../contracts';
import { FigmaAnalysisResult } from '../contracts/figma';
import { DesignSystemAnalysisResult } from '../contracts/designSystem';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ToolRegistry } from '../runtime/ToolRegistry';
import { StreamHandler } from '../runtime/StreamHandler';
import promptContent from './prompts/comparer.md';

export interface ComparerInput {
  // Direct data input from previous agents
  figmaData?: FigmaAnalysisResult;
  designSystem?: DesignSystemAnalysisResult | null;
  codeFiles?: { files: Record<string, string> };
}


export class ComparerAgent extends BaseAgent<ComparerInput, CompareResult> {
  readonly name = 'Comparer';
  readonly description = 'Compares implementation against Figma designs';
  readonly outputSchema = CompareResultSchema;

  protected async execute(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: ComparerInput,
    stream?: StreamHandler
  ): Promise<CompareResult> {
    const figmaData = input.figmaData;
    const designSystem = input.designSystem;
    const codeFiles = input.codeFiles;

    console.log('[Helix] [ComparerAgent] Input figmaData:', JSON.stringify(figmaData, null, 2));
    console.log('[Helix] [ComparerAgent] Input designSystem:', JSON.stringify(designSystem, null, 2));
    console.log('[Helix] [ComparerAgent] Input codeFiles:', JSON.stringify(codeFiles, null, 2));

    // Perform comparison
    const prompt = promptContent;
    const messages = [
      vscode.LanguageModelChatMessage.User(prompt),
      vscode.LanguageModelChatMessage.User(
        `Figma Design:\n${JSON.stringify(figmaData, null, 2)}\n\n` +
        `Design System:\n${JSON.stringify(designSystem, null, 2)}\n\n` +
        `Implementation:\n${JSON.stringify(codeFiles, null, 2)}`
      ),
    ];

    const llmResult = await tools.invoke(ctx, 'llm.chatJSON', {
      messages,
      schema: {
        name: 'CompareResult',
        description: 'Comparison of design vs implementation',
        schema: CompareResultSchema,
      },
    });

    if (!llmResult.ok) {
      throw new Error(`LLM request failed: ${llmResult.error?.message}`);
    }

    const result = llmResult.data as CompareResult;
    
    console.log('[Helix] [ComparerAgent] LLM Result Score:', result.score);
    
    if (stream) {
      stream.markdown(`### Comparison Analysis (Score: ${result.score}/100)\n\n`);
        
      if (result.diffs.length > 0) {
          stream.markdown('#### Key Differences\n');
          result.diffs.forEach(diff => {
              const severityIcon = diff.severity === 'high' ? '🔴' : diff.severity === 'medium' ? '🟡' : '⚪';
              stream.markdown(`- ${severityIcon} **${diff.category}**: ${diff.description}\n`);
          });
          stream.markdown('\n');
      }

      if (result.nextActions.length > 0) {
          stream.markdown('#### Recommended Actions\n');
          result.nextActions.forEach(action => {
              stream.markdown(`- **${action.title}**: ${action.description}\n`);
          });
      }
    }

    if (!result.trace) {
      result.trace = [];
    }
    result.trace.push(...ctx.getTraceEvents());

    // Output formatted diff preview
    if (stream && result.diffs.length > 0) {
      stream.markdown(`\n#### Detailed Diff Preview\n${this.formatComparerPreview(result.diffs)}\n`);
    }

    return result;
  }

  private formatComparerPreview(diffs: any[]): string {
    const lines: string[] = [];

    const toTitleCase = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

    const preview = diffs.slice(0, 10);
    preview.forEach((diff: any, idx: number) => {
      const severity = (diff?.severity || 'low').toLowerCase();
      const severityIcon = severity === 'high' ? '🔴' : severity === 'medium' ? '🟡' : '⚪';
      const category = toTitleCase(diff?.category || 'Other');
      const description = (diff?.description || `Diff #${idx + 1}`).trim();

      let filesPart = 'n/a';
      if (Array.isArray(diff?.filePaths) && diff.filePaths.length > 0) {
        const first = diff.filePaths[0];
        const more = diff.filePaths.length - 1;
        filesPart = more > 0 ? `${first} +${more} more` : first;
      }

      lines.push(`- ${severityIcon} **${category}** — ${description}`);
      lines.push(`  - Files: ${filesPart}`);
    });

    if (diffs.length > preview.length) {
      lines.push(`- …and ${diffs.length - preview.length} more differences`);
    }

    return lines.join('\n');
  }
}
