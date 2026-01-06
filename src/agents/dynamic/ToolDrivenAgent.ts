import { BaseAgent } from '../base/BaseAgent';
import { AgentInput, AgentOutput, DynamicAgentDefinition } from '../base/types';

/**
 * 通用工具驱动 Agent
 * 运行时动态创建，用于执行工具任务
 */
export class ToolDrivenAgent extends BaseAgent {
	name: string;
	description: string;
	executionMode: 'llm' | 'tool' = 'tool';

	constructor(private definition: DynamicAgentDefinition) {
		super();
		this.name = definition.name;
		this.description = definition.description;
	}

	async execute(input: AgentInput): Promise<AgentOutput> {
		try {
			// 对于工具驱动的动态 Agent，暂时返回占位符
			// 具体实现需要根据 toolConfig 来动态选择提取器和对比器
			return {
				success: true,
				data: {
					message: `Tool-driven agent "${this.name}" executed`,
					config: this.definition.toolConfig
				},
				metadata: {
					agentName: this.name,
					executionMode: 'tool',
					dynamicallyCreated: true
				}
			};
		} catch (error: any) {
			return this.handleError(error);
		}
	}
}
