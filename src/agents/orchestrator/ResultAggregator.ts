import { AgentOutput } from '../base/types';
import { Difference } from '../dimensions/configs/dimensionConfigs';
import { ExecutionPlan } from '../planner/ExecutionPlan';

/**
 * 聚合结果类型
 */
export interface AggregatedResult {
	totalDimensions: number;
	overallMatchRate: number;
	dimensionResults: DimensionResult[];
	allDifferences: Difference[];
	criticalCount: number;
	minorCount: number;
	executionTime: number;
	summary: string;
}

/**
 * 单个维度的结果
 */
export interface DimensionResult {
	dimension: string;
	name: string;
	matchRate: number;
	differences: Difference[];
	executionMode?: 'llm' | 'tool';
	success: boolean;
	error?: string;
}

/**
 * 结果聚合器
 * 将多个 Agent 的结果聚合为统一的报告
 */
export class ResultAggregator {
	/**
	 * 聚合所有 Agent 结果
	 */
	aggregate(
		results: Map<string, AgentOutput>,
		plan: ExecutionPlan
	): AggregatedResult {
		const startTime = Date.now();
		const allDifferences: Difference[] = [];
		const dimensionResults: DimensionResult[] = [];

		// 处理每个维度的结果
		results.forEach((result, id) => {
			const task = plan.dimensions.find(d => d.id === id);
			const dimensionName = task?.name || id;

			if (result.success && result.data) {
				dimensionResults.push({
					dimension: result.data.dimension || id,
					name: dimensionName,
					matchRate: result.data.matchRate || 1,
					differences: result.data.differences || [],
					executionMode: result.metadata?.executionMode,
					success: true
				});

				if (result.data.differences) {
					allDifferences.push(...result.data.differences);
				}
			} else {
				// 失败的维度
				dimensionResults.push({
					dimension: id,
					name: dimensionName,
					matchRate: 0,
					differences: [],
					executionMode: result.metadata?.executionMode,
					success: false,
					error: result.error
				});
			}
		});

		const executionTime = Date.now() - startTime;

		// 计算整体匹配率
		const overallMatchRate = this.calculateOverallMatchRate(dimensionResults);

		// 统计严重程度
		const criticalCount = allDifferences.filter(d => d.severity === 'critical').length;
		const minorCount = allDifferences.filter(d => d.severity === 'minor').length;

		// 生成摘要
		const summary = this.generateSummary(dimensionResults, criticalCount, minorCount, overallMatchRate);

		return {
			totalDimensions: dimensionResults.length,
			overallMatchRate,
			dimensionResults,
			allDifferences,
			criticalCount,
			minorCount,
			executionTime,
			summary
		};
	}

	/**
	 * 计算整体匹配率
	 */
	private calculateOverallMatchRate(dimensionResults: DimensionResult[]): number {
		if (dimensionResults.length === 0) {
			return 1;
		}

		const successfulResults = dimensionResults.filter(d => d.success);

		if (successfulResults.length === 0) {
			return 0;
		}

		const totalMatchRate = successfulResults.reduce((sum, d) => sum + d.matchRate, 0);
		return totalMatchRate / successfulResults.length;
	}

	/**
	 * 生成摘要文本
	 */
	private generateSummary(
		dimensionResults: DimensionResult[],
		criticalCount: number,
		minorCount: number,
		overallMatchRate: number
	): string {
		const sections: string[] = [];

		// 整体评分
		sections.push(`## 整体一致性评分: ${(overallMatchRate * 100).toFixed(1)}%\n`);

		// 问题统计
		if (criticalCount > 0 || minorCount > 0) {
			sections.push(`### 发现的问题`);
			if (criticalCount > 0) {
				sections.push(`- 🔴 严重问题: ${criticalCount}`);
			}
			if (minorCount > 0) {
				sections.push(`- 🟡 轻微问题: ${minorCount}`);
			}
			sections.push('');
		} else {
			sections.push(`✅ 未发现一致性问题！\n`);
		}

		// 各维度详情
		sections.push(`### 各维度检查结果`);
		dimensionResults.forEach(result => {
			const icon = this.getStatusIcon(result.matchRate, result.success);
			const rate = result.success ? `${(result.matchRate * 100).toFixed(1)}%` : '失败';
			const mode = result.executionMode === 'llm' ? '🤖' : '🔧';
			const diffCount = result.differences.length;

			let line = `${icon} ${mode} **${result.name}**: ${rate}`;

			if (result.success && diffCount > 0) {
				line += ` (${diffCount} 个差异)`;
			}

			if (!result.success && result.error) {
				line += ` - ${result.error}`;
			}

			sections.push(line);
		});

		return sections.join('\n');
	}

	/**
	 * 获取状态图标
	 */
	private getStatusIcon(matchRate: number, success: boolean): string {
		if (!success) {
			return '❌';
		}

		if (matchRate >= 0.95) {
			return '✅';
		} else if (matchRate >= 0.8) {
			return '🟡';
		} else {
			return '🔴';
		}
	}

	/**
	 * 格式化差异列表为 Markdown 表格
	 */
	formatDifferencesTable(differences: Difference[]): string {
		if (differences.length === 0) {
			return '暂无差异';
		}

		const lines: string[] = [];
		lines.push('| 严重程度 | 类别 | 属性 | Figma 值 | 代码值 | 修复建议 |');
		lines.push('|---------|------|------|----------|--------|----------|');

		differences.forEach(diff => {
			const severity = diff.severity === 'critical' ? '🔴 严重' : '🟡 轻微';
			const category = diff.category;
			const property = diff.property;
			const figmaValue = this.truncate(String(diff.figmaValue), 30);
			const codeValue = this.truncate(String(diff.codeValue), 30);
			const fix = this.truncate(diff.fix || '-', 40);

			lines.push(`| ${severity} | ${category} | ${property} | ${figmaValue} | ${codeValue} | ${fix} |`);
		});

		return lines.join('\n');
	}

	/**
	 * 截断长文本
	 */
	private truncate(text: string, maxLength: number): string {
		if (text.length <= maxLength) {
			return text;
		}

		return text.substring(0, maxLength - 3) + '...';
	}
}
