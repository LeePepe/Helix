import * as vscode from 'vscode';
import { BaseAgent } from './base/Agent';
import { PlanResultSchema, PlanResult } from '../contracts';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ToolRegistry } from '../runtime/ToolRegistry';
import promptContent from './prompts/planner.md';
import { SummarizedContext } from './utils/contextSummarizer';

export interface PlannerInput {
  goal: string;
  context: SummarizedContext; // Summarized context to avoid token limits
}

export class PlannerAgent extends BaseAgent<PlannerInput, PlanResult> {
  readonly name = 'Planner';
  readonly description = 'Creates execution plans with subtask DAG or agent workflow';
  readonly outputSchema = PlanResultSchema as any; // Type assertion needed for optional fields

  protected async execute(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: PlannerInput,
    stream?: any
  ): Promise<PlanResult> {
    const prompt = promptContent;
    const messages = [
      vscode.LanguageModelChatMessage.User(prompt),
      vscode.LanguageModelChatMessage.User(
        `Goal: ${input.goal}\n\nContext:\n${JSON.stringify(input.context, null, 2)}`
      ),
    ];

    const llmResult = await tools.invoke(ctx, 'llm.chatJSON', {
      messages,
      schema: {
        name: 'PlanResult',
        description: 'Execution plan with subtasks DAG',
        schema: PlanResultSchema,
      },
    });

    if (!llmResult.ok) {
      throw new Error(`LLM request failed: ${llmResult.error?.message}`);
    }

    const result = llmResult.data as PlanResult;
    if (!result.trace) {
      result.trace = [];
    }
    result.trace.push(...ctx.getTraceEvents());

    return result;
  }
}
