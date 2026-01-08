import * as vscode from 'vscode';
import { BaseAgent } from './base/Agent';
import { FigmaAnalysisResult, FigmaAnalysisResultSchema } from '../contracts';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ToolRegistry } from '../runtime/ToolRegistry';
import promptContent from './prompts/figma-analyzer.md';

/**
 * Agent input for Figma analysis
 */
export interface FigmaAnalyzerInput {
  nodeId?: string;
  forceCode?: boolean;
}

/**
 * Figma Analyzer Agent
 * Analyzes Figma designs and produces structured UI breakdown
 */
export class FigmaAnalyzerAgent extends BaseAgent<FigmaAnalyzerInput, FigmaAnalysisResult> {
  readonly name = 'FigmaAnalyzer';
  readonly description = 'Analyzes Figma designs and produces structured UI breakdown';
  readonly outputSchema = FigmaAnalysisResultSchema;

  protected async execute(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: FigmaAnalyzerInput
  ): Promise<FigmaAnalysisResult> {
    ctx.trace('agent', 'figma-analyzer-execute', { nodeId: input.nodeId });

    // 1. Get design context from Figma
    const designContextResult = await tools.invoke(ctx, 'figma.getDesignContext', {
      nodeId: input.nodeId,
      forceCode: input.forceCode,
    });

    if (!designContextResult.ok) {
      throw new Error(`Failed to get Figma design context: ${designContextResult.error?.message}`);
    }

    const designContext = designContextResult.data.content;
    console.log('[Helix] [FigmaAnalyzer] Design Context Length:', designContext?.length);
    console.log('[Helix] [FigmaAnalyzer] Design Context Preview:', designContext?.substring(0, 500));

    // 2. Load prompt
    const prompt = promptContent;

    // 3. Call LLM with design context
    const messages = [
      vscode.LanguageModelChatMessage.User(prompt),
      vscode.LanguageModelChatMessage.User(
        `Here is the Figma design data to analyze:\n\n${designContext}`
      ),
    ];

    console.log('[Helix] [FigmaAnalyzer] === LLM Request Start ===');
    console.log('[Helix] [FigmaAnalyzer] Prompt length:', prompt.length);
    console.log('[Helix] [FigmaAnalyzer] Messages count:', messages.length);
    console.log('[Helix] [FigmaAnalyzer] Schema:', JSON.stringify(FigmaAnalysisResultSchema, null, 2));

    const llmResult = await tools.invoke(ctx, 'llm.chatJSON', {
      messages,
      schema: {
        name: 'FigmaAnalysisResult',
        description: 'Structured analysis of Figma design',
        schema: FigmaAnalysisResultSchema,
      },
    });

    console.log('[Helix] [FigmaAnalyzer] === LLM Request Complete ===');
    console.log('[Helix] [FigmaAnalyzer] LLM Result OK:', llmResult.ok);

    if (!llmResult.ok) {
      console.error('[Helix] [FigmaAnalyzer] LLM Request Failed:', llmResult.error);
      console.error('[Helix] [FigmaAnalyzer] Error details:', JSON.stringify(llmResult.error, null, 2));
      throw new Error(`LLM request failed: ${llmResult.error?.message}`);
    }

    console.log('[Helix] [FigmaAnalyzer] LLM Result data keys:', Object.keys(llmResult.data || {}));
    const result = llmResult.data as FigmaAnalysisResult;
    console.log('[Helix] [FigmaAnalyzer] Result schemaVersion:', result.schemaVersion);

    // Add trace events
    if (!result.trace) {
      result.trace = [];
    }
    result.trace.push(...ctx.getTraceEvents());

    return result;
  }
}
