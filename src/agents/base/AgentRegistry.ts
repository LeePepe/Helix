import { Agent, AgentInput, AgentOutput, ParallelTask, ParallelExecutionResult } from './types';

/**
 * Agent 注册表
 * 管理所有 Agent 的注册、查找和执行
 */
export class AgentRegistry {
	private agents: Map<string, Agent> = new Map();

	/**
	 * 注册 Agent
	 */
	register(name: string, agent: Agent): void {
		if (this.agents.has(name)) {
			console.warn(`Agent "${name}" is already registered, overwriting...`);
		}
		this.agents.set(name, agent);
	}

	/**
	 * 注销 Agent
	 */
	unregister(name: string): void {
		this.agents.delete(name);
	}

	/**
	 * 获取 Agent
	 */
	get(name: string): Agent | undefined {
		return this.agents.get(name);
	}

	/**
	 * 获取所有 Agent 名称
	 */
	getAgentNames(): string[] {
		return Array.from(this.agents.keys());
	}

	/**
	 * 执行单个 Agent
	 */
	async execute<T>(name: string, input: AgentInput): Promise<AgentOutput<T>> {
		const agent = this.agents.get(name);

		if (!agent) {
			return {
				success: false,
				error: `Agent "${name}" not found`
			};
		}

		try {
			const startTime = Date.now();
			const result = await agent.execute(input);
			const executionTime = Date.now() - startTime;

			// 添加执行时间元数据
			if (result.success && result.metadata) {
				result.metadata.executionTime = executionTime;
			}

			return result;
		} catch (error: any) {
			return {
				success: false,
				error: `Agent "${name}" execution failed: ${error.message}`,
				metadata: {
					agentName: name,
					executionMode: agent.executionMode
				}
			};
		}
	}

	/**
	 * 并行执行多个 Agent (自动处理依赖)
	 */
	async executeParallel(tasks: ParallelTask[]): Promise<ParallelExecutionResult> {
		const startTime = Date.now();
		const results = new Map<string, AgentOutput>();
		const executionOrder: string[] = [];

		// 构建依赖图
		const dependencyGraph = this.buildDependencyGraph(tasks);

		// 拓扑排序 + 分组
		const groups = this.groupTasksByDependency(tasks, dependencyGraph);

		// 按组执行
		for (const group of groups) {
			// 同组内的任务并行执行
			const groupPromises = group.map(async (task) => {
				const result = await this.execute(task.agentName, task.input);
				return { agentName: task.agentName, result };
			});

			const groupResults = await Promise.all(groupPromises);

			// 记录结果
			for (const { agentName, result } of groupResults) {
				results.set(agentName, result);
				executionOrder.push(agentName);
			}
		}

		const totalTime = Date.now() - startTime;

		return {
			results,
			executionOrder,
			totalTime
		};
	}

	/**
	 * 构建依赖图
	 */
	private buildDependencyGraph(tasks: ParallelTask[]): Map<string, string[]> {
		const graph = new Map<string, string[]>();

		for (const task of tasks) {
			graph.set(task.agentName, task.dependencies || []);
		}

		return graph;
	}

	/**
	 * 根据依赖关系将任务分组
	 */
	private groupTasksByDependency(
		tasks: ParallelTask[],
		dependencyGraph: Map<string, string[]>
	): ParallelTask[][] {
		const groups: ParallelTask[][] = [];
		const visited = new Set<string>();
		const levels = new Map<string, number>();

		// 计算每个任务的层级
		const calculateLevel = (taskName: string): number => {
			if (levels.has(taskName)) {
				return levels.get(taskName)!;
			}

			const dependencies = dependencyGraph.get(taskName) || [];

			if (dependencies.length === 0) {
				levels.set(taskName, 0);
				return 0;
			}

			const maxDepLevel = Math.max(
				...dependencies.map(dep => calculateLevel(dep))
			);

			const level = maxDepLevel + 1;
			levels.set(taskName, level);
			return level;
		};

		// 计算所有任务的层级
		for (const task of tasks) {
			calculateLevel(task.agentName);
		}

		// 按层级分组
		for (const task of tasks) {
			const level = levels.get(task.agentName) || 0;

			if (!groups[level]) {
				groups[level] = [];
			}

			groups[level].push(task);
		}

		return groups.filter(group => group.length > 0);
	}

	/**
	 * 检查循环依赖
	 */
	private detectCycles(graph: Map<string, string[]>): string | null {
		const visiting = new Set<string>();
		const visited = new Set<string>();

		const visit = (node: string, path: string[]): string | null => {
			if (visiting.has(node)) {
				return `Circular dependency detected: ${[...path, node].join(' -> ')}`;
			}

			if (visited.has(node)) {
				return null;
			}

			visiting.add(node);
			path.push(node);

			const dependencies = graph.get(node) || [];
			for (const dep of dependencies) {
				const cycle = visit(dep, [...path]);
				if (cycle) {
					return cycle;
				}
			}

			visiting.delete(node);
			visited.add(node);
			return null;
		};

		for (const node of graph.keys()) {
			const cycle = visit(node, []);
			if (cycle) {
				return cycle;
			}
		}

		return null;
	}
}
