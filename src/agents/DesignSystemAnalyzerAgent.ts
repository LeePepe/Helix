import * as vscode from 'vscode';
import { BaseAgent } from './base/Agent';
import {
  DesignSystemMappingResult,
  DesignSystemMappingResultSchema,
  FigmaAnalysisResult,
  FigmaAnalysisResultSchema,
} from '../contracts';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ToolRegistry } from '../runtime/ToolRegistry';
import promptContent from './prompts/design-system-mapper.md';

export interface DesignSystemAnalyzerInput {
  figmaAnalysis: FigmaAnalysisResult;
  designSystemPath?: string;
}

export class DesignSystemAnalyzerAgent extends BaseAgent<
  DesignSystemAnalyzerInput,
  DesignSystemMappingResult
> {
  readonly name = 'DesignSystemAnalyzer';
  readonly description = 'Maps Figma designs to design system components and tokens';
  readonly outputSchema = DesignSystemMappingResultSchema;

  protected async execute(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: DesignSystemAnalyzerInput
  ): Promise<DesignSystemMappingResult> {
    // 1. Read design system documentation if available
    let designSystemInfo = 'No design system documentation provided.';
    if (input.designSystemPath) {
      const readResult = await tools.invoke(ctx, 'workspace.readFile', {
        filePath: input.designSystemPath,
      });
      if (readResult.ok) {
        designSystemInfo = readResult.data.content;
      }
    }

    // 2. Load prompt and call LLM
    const prompt = promptContent;
    const messages = [
      vscode.LanguageModelChatMessage.User(prompt),
      vscode.LanguageModelChatMessage.User(
        `Figma Analysis:\n${JSON.stringify(input.figmaAnalysis, null, 2)}\n\n` +
        `Design System:\n${designSystemInfo}`
      ),
    ];

    const llmResult = await tools.invoke(ctx, 'llm.chatJSON', {
      messages,
      schema: {
        name: 'DesignSystemMappingResult',
        description: 'Mapping between Figma and design system',
        schema: DesignSystemMappingResultSchema,
      },
    });

    if (!llmResult.ok) {
      throw new Error(`LLM request failed: ${llmResult.error?.message}`);
    }

    const result = llmResult.data as DesignSystemMappingResult;
    if (!result.trace) {
      result.trace = [];
    }
    result.trace.push(...ctx.getTraceEvents());

    return result;
  }
}
