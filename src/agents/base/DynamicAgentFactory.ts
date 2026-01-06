import { Agent, DynamicAgentDefinition } from './types';
import { LLMDrivenAgent } from '../dynamic/LLMDrivenAgent';
import { ToolDrivenAgent } from '../dynamic/ToolDrivenAgent';

/**
 * 动态 Agent 工厂
 * 根据定义在运行时创建 Agent
 */
export class DynamicAgentFactory {
	/**
	 * 创建 Agent
	 */
	createAgent(definition: DynamicAgentDefinition): Agent {
		if (definition.executionMode === 'llm') {
			return new LLMDrivenAgent(definition);
		} else {
			return new ToolDrivenAgent(definition);
		}
	}

	/**
	 * 验证 Agent 定义
	 */
	validate(definition: DynamicAgentDefinition): boolean {
		if (!definition.name || !definition.description) {
			return false;
		}

		if (definition.executionMode === 'llm' && !definition.prompt) {
			return false;
		}

		if (definition.executionMode === 'tool' && !definition.toolConfig) {
			return false;
		}

		return true;
	}
}
