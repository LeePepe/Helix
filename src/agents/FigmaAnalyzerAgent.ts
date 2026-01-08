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
    input: FigmaAnalyzerInput,
    stream?: any
  ): Promise<FigmaAnalysisResult> {
    ctx.trace('agent', 'figma-analyzer-execute', { nodeId: input.nodeId });

    // 1. Get design context from Figma
    stream?.markdown(`\n**🎨 Fetching Figma design context...**\n`);
    stream?.markdown(`- Node ID: \`${input.nodeId || 'not provided'}\`\n`);
    stream?.markdown(`- Force Code: ${input.forceCode || false}\n\n`);

    console.log('[Helix] [FigmaAnalyzer] 🎨 Fetching Figma design context...');
    console.log('[Helix] [FigmaAnalyzer] Input nodeId:', input.nodeId);
    console.log('[Helix] [FigmaAnalyzer] Input forceCode:', input.forceCode);

    const designContextResult = await tools.invoke(ctx, 'figma.getDesignContext', {
      nodeId: input.nodeId,
      forceCode: input.forceCode,
    });

    console.log('[Helix] [FigmaAnalyzer] Design Context Result OK:', designContextResult.ok);
    if (!designContextResult.ok) {
      stream?.markdown(`\n❌ **Failed to get design context**\n`);
      stream?.markdown(`Error: ${designContextResult.error?.message}\n\n`);
      console.error('[Helix] [FigmaAnalyzer] ❌ Failed to get design context');
      console.error('[Helix] [FigmaAnalyzer] Error:', JSON.stringify(designContextResult.error, null, 2));
      throw new Error(`Failed to get Figma design context: ${designContextResult.error?.message}`);
    }

    const designContext = designContextResult.data.content;
    const isEmpty = !designContext || designContext.length === 0;

    stream?.markdown(`\n✅ **Design Context Retrieved**\n`);
    stream?.markdown(`- Length: ${designContext?.length || 0} characters\n`);
    stream?.markdown(`- Empty: ${isEmpty ? '⚠️ YES' : 'No'}\n`);
    if (!isEmpty) {
      stream?.markdown(`- Preview: \`${designContext?.substring(0, 100)}...\`\n\n`);
    } else {
      stream?.markdown(`\n⚠️ **Warning: Design context is empty!**\n\n`);
    }

    console.log('[Helix] [FigmaAnalyzer] ✅ Design Context Retrieved');
    console.log('[Helix] [FigmaAnalyzer] Design Context Length:', designContext?.length);
    console.log('[Helix] [FigmaAnalyzer] Design Context Type:', typeof designContext);
    console.log('[Helix] [FigmaAnalyzer] Design Context is Empty?:', isEmpty);
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
    console.log('[Helix] [FigmaAnalyzer] LLM Result full data:', JSON.stringify(llmResult.data, null, 2).substring(0, 2000));
    const result = llmResult.data as FigmaAnalysisResult;
    console.log('[Helix] [FigmaAnalyzer] Result schemaVersion:', result.schemaVersion);
    console.log('[Helix] [FigmaAnalyzer] Result root keys:', Object.keys(result.root || {}));
    console.log('[Helix] [FigmaAnalyzer] Result cases length:', result.cases?.length);

    // Add trace events
    console.log('[Helix] [FigmaAnalyzer] Adding trace events');
    console.log('[Helix] [FigmaAnalyzer] Current trace:', result.trace?.length || 0);
    console.log('[Helix] [FigmaAnalyzer] Context trace events:', ctx.getTraceEvents().length);

    if (!result.trace) {
      result.trace = [];
    }
    result.trace.push(...ctx.getTraceEvents());

    console.log('[Helix] [FigmaAnalyzer] Final trace length:', result.trace.length);
    console.log('[Helix] [FigmaAnalyzer] Returning result with keys:', Object.keys(result));

    return result;
  }
}
