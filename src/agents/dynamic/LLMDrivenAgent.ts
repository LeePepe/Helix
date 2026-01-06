import { BaseAgent } from '../base/BaseAgent';
import { AgentInput, AgentOutput, DynamicAgentDefinition } from '../base/types';

/**
 * 通用 LLM 驱动 Agent
 * 运行时动态创建，用于执行 LLM 任务
 */
export class LLMDrivenAgent extends BaseAgent {
	name: string;
	description: string;
	executionMode: 'llm' | 'tool' = 'llm';
	private promptTemplate: string;

	constructor(private definition: DynamicAgentDefinition) {
		super();
		this.name = definition.name;
		this.description = definition.description;
		this.promptTemplate = definition.prompt || '';
	}

	async execute(input: AgentInput): Promise<AgentOutput> {
		try {
			// 替换模板变量
			const prompt = this.buildPrompt(input.data);

			// 调用 LLM
			const llmResponse = await this.callLLM(prompt, input.context);

			// 尝试解析 JSON 响应
			let data: any;
			try {
				data = JSON.parse(llmResponse);
			} catch {
				// 如果不是 JSON，直接返回文本
				data = llmResponse;
			}

			return {
				success: true,
				data,
				metadata: {
					agentName: this.name,
					executionMode: 'llm',
					dynamicallyCreated: true
				}
			};
		} catch (error: any) {
			return this.handleError(error);
		}
	}

	/**
	 * 构建提示词
	 * 替换模板中的变量，如 {{figmaData}}, {{codeData}}
	 */
	private buildPrompt(data: any): string {
		let prompt = this.promptTemplate;

		// 替换所有 {{variable}} 格式的变量
		const variables = prompt.match(/\{\{(\w+)\}\}/g);

		if (variables) {
			for (const variable of variables) {
				const key = variable.replace(/\{\{|\}\}/g, '');
				const value = data[key];

				if (value !== undefined) {
					const stringValue = typeof value === 'string'
						? value
						: JSON.stringify(value, null, 2);
					prompt = prompt.replace(variable, stringValue);
				}
			}
		}

		return prompt;
	}
}
