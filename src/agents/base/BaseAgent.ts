import * as vscode from 'vscode';
import {
	Agent,
	AgentInput,
	AgentOutput,
	AgentContext
} from './types';

/**
 * Agent 基类，提供通用功能
 */
export abstract class BaseAgent<TInput = any, TOutput = any> implements Agent<TInput, TOutput> {
	abstract name: string;
	abstract description: string;
	abstract executionMode: 'llm' | 'tool';

	/**
	 * 执行 Agent 任务
	 */
	abstract execute(input: AgentInput<TInput>): Promise<AgentOutput<TOutput>>;

	/**
	 * 调用 LLM
	 */
	protected async callLLM(
		prompt: string | vscode.LanguageModelChatMessage[],
		context: AgentContext
	): Promise<string> {
		// 选择模型
		const models = await vscode.lm.selectChatModels({
			family: 'claude-sonnet-4.5'
		});

		if (models.length === 0) {
			throw new Error('No LLM model available');
		}

		const model = models[0];

		// 构建消息
		const messages = Array.isArray(prompt)
			? prompt
			: [vscode.LanguageModelChatMessage.User(prompt)];

		// 发送请求
		const request = await model.sendRequest(
			messages,
			{},
			context.token
		);

		// 收集响应
		let response = '';
		for await (const chunk of request.text) {
			response += chunk;
		}

		return response.trim();
	}

	/**
	 * 流式输出到用户
	 */
	protected streamMarkdown(text: string, context: AgentContext): void {
		context.stream.markdown(text);
	}

	/**
	 * 输出进度消息
	 */
	protected streamProgress(message: string, context: AgentContext): void {
		context.stream.progress(message);
	}

	/**
	 * 验证输入
	 */
	protected validate(input: AgentInput<TInput>): boolean {
		return true;
	}

	/**
	 * 计算执行时间
	 */
	protected async executeWithTiming(
		fn: () => Promise<TOutput>
	): Promise<{ result: TOutput; executionTime: number }> {
		const startTime = Date.now();
		const result = await fn();
		const executionTime = Date.now() - startTime;
		return { result, executionTime };
	}

	/**
	 * 错误处理
	 */
	protected handleError(error: any): AgentOutput<TOutput> {
		return {
			success: false,
			error: error.message || String(error),
			metadata: {
				agentName: this.name,
				executionMode: this.executionMode
			}
		};
	}
}
