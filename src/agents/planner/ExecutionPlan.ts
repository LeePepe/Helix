import { DimensionTask } from '../base/types';

/**
 * 执行计划类型定义
 */
export interface ExecutionPlan {
	dimensions: DimensionTask[];
	dependencies: Map<string, string[]>;
	parallelGroups: DimensionTask[][];
	metadata: {
		totalDimensions: number;
		estimatedTime: number;
		createdAt: Date;
	};
}

/**
 * Planner Agent 的输入
 */
export interface PlannerInput {
	userRequest: string;
	designSystemGuide: string;
	availableAgents: string[];
	figmaData?: any;
	codeData?: any;
}

/**
 * 执行计划构建器
 */
export class ExecutionPlanBuilder {
	private dimensions: DimensionTask[] = [];
	private dependencies: Map<string, string[]> = new Map();

	/**
	 * 添加维度任务
	 */
	addDimension(task: DimensionTask): this {
		this.dimensions.push(task);
		this.dependencies.set(task.id, task.dependencies);
		return this;
	}

	/**
	 * 构建并行组
	 */
	build(): ExecutionPlan {
		const parallelGroups = this.buildParallelGroups();
		const estimatedTime = this.estimateExecutionTime(parallelGroups);

		return {
			dimensions: this.dimensions,
			dependencies: this.dependencies,
			parallelGroups,
			metadata: {
				totalDimensions: this.dimensions.length,
				estimatedTime,
				createdAt: new Date()
			}
		};
	}

	/**
	 * 根据依赖关系构建并行组
	 */
	private buildParallelGroups(): DimensionTask[][] {
		const groups: DimensionTask[][] = [];
		const levels = new Map<string, number>();

		// 计算每个任务的层级
		const calculateLevel = (taskId: string, visited: Set<string> = new Set()): number => {
			if (levels.has(taskId)) {
				return levels.get(taskId)!;
			}

			// 检测循环依赖
			if (visited.has(taskId)) {
				throw new Error(`Circular dependency detected involving task: ${taskId}`);
			}

			const task = this.dimensions.find(d => d.id === taskId);
			if (!task) {
				return 0;
			}

			const dependencies = task.dependencies || [];

			if (dependencies.length === 0) {
				levels.set(taskId, 0);
				return 0;
			}

			visited.add(taskId);

			const maxDepLevel = Math.max(
				...dependencies.map(dep => calculateLevel(dep, new Set(visited)))
			);

			const level = maxDepLevel + 1;
			levels.set(taskId, level);

			return level;
		};

		// 计算所有任务的层级
		for (const task of this.dimensions) {
			calculateLevel(task.id);
		}

		// 按层级分组
		for (const task of this.dimensions) {
			const level = levels.get(task.id) || 0;

			if (!groups[level]) {
				groups[level] = [];
			}

			groups[level].push(task);
		}

		return groups.filter(group => group.length > 0);
	}

	/**
	 * 估算执行时间
	 */
	private estimateExecutionTime(parallelGroups: DimensionTask[][]): number {
		let totalTime = 0;

		for (const group of parallelGroups) {
			// 每组的执行时间是组内最慢任务的时间（因为并行）
			const groupTime = Math.max(
				...group.map(task => this.estimateTaskTime(task))
			);
			totalTime += groupTime;
		}

		return totalTime;
	}

	/**
	 * 估算单个任务的执行时间
	 */
	private estimateTaskTime(task: DimensionTask): number {
		// LLM 驱动的任务通常更慢
		if (task.executionMode === 'llm') {
			return 3; // 3秒
		}

		// 工具驱动的任务较快
		return 0.5; // 0.5秒
	}
}
