import * as vscode from 'vscode';
import { BaseAgent } from './base/Agent';
import { CodegenResult, CodegenResultSchema } from '../contracts';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ToolRegistry } from '../runtime/ToolRegistry';
import promptContent from './prompts/code-generator.md';
import { Subtask } from '../contracts'; // Ensure Subtask is imported if previously missing or implicit

export interface CodeGeneratorInput {
  subtask: Subtask;
  context: any;
}

export class CodeGeneratorAgent extends BaseAgent<CodeGeneratorInput, CodegenResult> {
  readonly name = 'CodeGenerator';
  readonly description = 'Generates production-quality code from specifications';
  readonly outputSchema = CodegenResultSchema;

  protected async execute(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: CodeGeneratorInput
  ): Promise<CodegenResult> {
    const prompt = promptContent;
    const messages = [
      vscode.LanguageModelChatMessage.User(prompt),
      vscode.LanguageModelChatMessage.User(
        `Subtask:\n${JSON.stringify(input.subtask, null, 2)}\n\n` +
        `Context:\n${JSON.stringify(input.context, null, 2)}`
      ),
    ];

    const llmResult = await tools.invoke(ctx, 'llm.chatJSON', {
      messages,
      schema: {
        name: 'CodegenResult',
        description: 'Code generation result with file changes',
        schema: CodegenResultSchema,
      },
    });

    if (!llmResult.ok) {
      throw new Error(`LLM request failed: ${llmResult.error?.message}`);
    }

    const result = llmResult.data as CodegenResult;
    if (!result.trace) {
      result.trace = [];
    }
    result.trace.push(...ctx.getTraceEvents());

    return result;
  }
}
