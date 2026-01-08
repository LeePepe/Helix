import * as vscode from 'vscode';
import { BaseAgent } from './base/Agent';
import { CompareResult, CompareResultSchema } from '../contracts';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ToolRegistry } from '../runtime/ToolRegistry';
import promptContent from './prompts/comparer.md';

export interface ComparerInput {
  // Direct data input from previous agents
  figmaData?: any;
  implementationContext?: any;
}

export class ComparerAgent extends BaseAgent<ComparerInput, CompareResult> {
  readonly name = 'Comparer';
  readonly description = 'Compares implementation against Figma designs';
  readonly outputSchema = CompareResultSchema;

  protected async execute(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: ComparerInput,
    stream?: any
  ): Promise<CompareResult> {
    const figmaData = input.figmaData;
    const implementationContext = input.implementationContext;

    // Perform comparison
    const prompt = promptContent;
    const messages = [
      vscode.LanguageModelChatMessage.User(prompt),
      vscode.LanguageModelChatMessage.User(
        `Figma Design:\n${JSON.stringify(figmaData, null, 2)}\n\n` +
        `Implementation:\n${JSON.stringify(implementationContext, null, 2)}`
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
    if (!result.trace) {
      result.trace = [];
    }
    result.trace.push(...ctx.getTraceEvents());

    return result;
  }
}
