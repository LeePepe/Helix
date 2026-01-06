import { AgentRegistry } from '../base/AgentRegistry';
import { DynamicAgentFactory } from '../base/DynamicAgentFactory';
import { AgentInput, AgentOutput, DimensionTask } from '../base/types';
import { ExecutionPlan } from '../planner/ExecutionPlan';
import { AggregatedResult, ResultAggregator } from './ResultAggregator';

/**
 * 动态编排器
 * 执行计划编排和 Agent 动态创建
 */
export class DynamicOrchestrator {
	constructor(
		private registry: AgentRegistry,
		private factory: DynamicAgentFactory
	) {}

	/**
	 * 执行完整的执行计划
	 */
	async execute(plan: ExecutionPlan, baseInput: AgentInput): Promise<AggregatedResult> {
		const results = new Map<string, AgentOutput>();

		// 按并行组执行
		for (let i = 0; i < plan.parallelGroups.length; i++) {
			const group = plan.parallelGroups[i];

			// 流式输出进度
			baseInput.context.stream.progress(
				`Executing parallel group ${i + 1}/${plan.parallelGroups.length} (${group.length} agents)...`
			);

			const groupResults = await this.executeParallelGroup(group, baseInput, results);
			groupResults.forEach((result, id) => results.set(id, result));
		}

		// 聚合结果
		const aggregator = new ResultAggregator();
		return aggregator.aggregate(results, plan);
	}

	/**
	 * 执行并行组
	 */
	private async executeParallelGroup(
		tasks: DimensionTask[],
		baseInput: AgentInput,
		previousResults: Map<string, AgentOutput>
	): Promise<Map<string, AgentOutput>> {
		const promises = tasks.map(async (task) => {
			try {
				// 检查是否需要创建动态 Agent
				await this.ensureAgentExists(task);

				// 构建 Agent 输入（包含前置结果）
				const agentInput: AgentInput = {
					data: {
						...baseInput.data,
						config: task.config,
						previousResults: this.extractDependencyResults(task, previousResults)
					},
					context: baseInput.context
				};

				// 执行 Agent
				const result = await this.registry.execute(task.id, agentInput);

				return [task.id, result] as [string, AgentOutput];
			} catch (error: any) {
				// 单个 Agent 失败不应该影响整个流程
				return [task.id, {
					success: false,
					error: `Failed to execute ${task.id}: ${error.message}`
				}] as [string, AgentOutput];
			}
		});

		const results = await Promise.all(promises);
		return new Map(results);
	}

	/**
	 * 确保 Agent 存在（如果需要则动态创建）
	 */
	private async ensureAgentExists(task: DimensionTask): Promise<void> {
		// 检查 Agent 是否已经注册
		const existingAgent = this.registry.get(task.id);

		if (existingAgent) {
			return;
		}

		// 检查是否是动态 Agent
		if (task.agentType === 'DynamicAgent' && task.config.dynamicDefinition) {
			const agent = this.factory.createAgent(task.config.dynamicDefinition);
			this.registry.register(task.id, agent);
			return;
		}

		// 预定义的 Agent 应该已经注册了
		// 如果没有，抛出错误
		throw new Error(`Agent "${task.id}" (type: ${task.agentType}) not found in registry`);
	}

	/**
	 * 提取依赖任务的结果
	 */
	private extractDependencyResults(
		task: DimensionTask,
		previousResults: Map<string, AgentOutput>
	): Record<string, any> {
		const depResults: Record<string, any> = {};

		for (const depId of task.dependencies) {
			const result = previousResults.get(depId);
			if (result && result.success) {
				depResults[depId] = result.data;
			}
		}

		return depResults;
	}

	/**
	 * 格式化执行计划为用户友好的文本
	 */
	formatPlan(plan: ExecutionPlan): string {
		const sections: string[] = [];

		sections.push(`## 执行计划`);
		sections.push(`- 总维度数: ${plan.metadata.totalDimensions}`);
		sections.push(`- 并行组数: ${plan.parallelGroups.length}`);
		sections.push(`- 预估时间: ${plan.metadata.estimatedTime.toFixed(1)}s`);
		sections.push('');

		plan.parallelGroups.forEach((group, i) => {
			sections.push(`**并行组 ${i + 1}:**`);
			group.forEach(task => {
				const mode = task.executionMode === 'llm' ? '🤖 LLM' : '🔧 Tool';
				sections.push(`  - ${mode} ${task.name}`);
			});
			sections.push('');
		});

		return sections.join('\n');
	}
}
