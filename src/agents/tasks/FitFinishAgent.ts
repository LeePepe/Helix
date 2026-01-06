import { BaseAgent } from '../base/BaseAgent';
import { AgentInput, AgentOutput } from '../base/types';
import { FigmaAnalyzerAgent } from '../codegen/FigmaAnalyzerAgent';
import { PlannerAgent } from '../planner/PlannerAgent';
import { DynamicOrchestrator } from '../orchestrator/DynamicOrchestrator';
import { DesignSystemAgent } from '../domain/DesignSystemAgent';
import { AggregatedResult } from '../orchestrator/ResultAggregator';

/**
 * Fit & Finish Agent 的输入
 */
export interface FitFinishInput {
	figmaUrl: string;
	files?: any[];
	userRequest?: string;
}

/**
 * Fit & Finish Agent
 * 检查 Figma 设计与代码实现的一致性
 */
export class FitFinishAgent extends BaseAgent {
	name = 'fit-finish';
	description = 'Check design-code consistency using dynamic multi-agent orchestration';
	executionMode: 'llm' | 'tool' = 'llm';

	constructor(
		private figmaAnalyzer: FigmaAnalyzerAgent,
		private planner: PlannerAgent,
		private orchestrator: DynamicOrchestrator,
		private designSystemAgent: DesignSystemAgent
	) {
		super();
	}

	async execute(input: AgentInput<FitFinishInput>): Promise<AgentOutput<AggregatedResult>> {
		try {
			const { figmaUrl, files, userRequest } = input.data;

			// Step 1: 分析 Figma 设计内容
			this.streamMarkdown(`\n## 🎨 分析 Figma 设计\n\n`, input.context);

			const figmaAnalysisResult = await this.figmaAnalyzer.execute({
				data: {
					figmaUrl,
					userRequest
				},
				context: input.context
			});

			if (!figmaAnalysisResult.success || !figmaAnalysisResult.data) {
				return {
					success: false,
					error: 'Failed to analyze Figma design'
				};
			}

			const figmaAnalysis = figmaAnalysisResult.data;
			const figmaData = figmaAnalysis.rawData;

			// Step 2: 加载设计系统指南
			this.streamProgress('Loading design system guide...', input.context);
			const designSystemResult = await this.designSystemAgent.execute({
				data: {},  // 不需要 figmaData，直接从文件加载
				context: input.context
			});

			if (!designSystemResult.success || !designSystemResult.data) {
				return {
					success: false,
					error: 'Failed to generate design system guide'
				};
			}

			const designSystemGuide = designSystemResult.data;

			// 解析 tokens
			const designSystemTokens = this.designSystemAgent.parseTokens(designSystemGuide);

			// 显示设计系统
			this.streamMarkdown(`\n## 设计系统指南\n\n${designSystemGuide}\n`, input.context);

			// Step 3: 获取代码数据
			this.streamProgress('Loading code files...', input.context);
			const codeData = await this.getCodeData(files || [], input.context);

			// Step 4: 调用 PlannerAgent 生成执行计划
			this.streamProgress('Generating execution plan...', input.context);
			const planResult = await this.planner.execute({
				data: {
					userRequest: userRequest || 'Check design-code consistency across all dimensions',
					designSystemGuide,
					availableAgents: this.getAvailableAgents()
				},
				context: input.context
			});

			if (!planResult.success || !planResult.data) {
				return {
					success: false,
					error: 'Failed to generate execution plan'
				};
			}

			const executionPlan = planResult.data;

			// 显示执行计划
			const planText = this.orchestrator.formatPlan(executionPlan);
			this.streamMarkdown(`\n${planText}\n`, input.context);

			// Step 5: 执行计划
			this.streamProgress('Executing consistency checks...', input.context);
			const aggregatedResult = await this.orchestrator.execute(executionPlan, {
				data: {
					figmaData,
					figmaAnalysis,  // 传递分析结果
					codeData,
					codeFiles: files || [],
					designSystemGuide,
					designSystemTokens
				},
				context: input.context
			});

			// Step 6: 显示结果
			this.displayResults(aggregatedResult, input.context);

			return {
				success: true,
				data: aggregatedResult,
				metadata: {
					executionMode: 'llm',
					agentName: this.name
				}
			};
		} catch (error: any) {
			return this.handleError(error);
		}
	}


	/**
	 * 获取代码数据
	 */
	private async getCodeData(files: any[], context: any): Promise<any> {
		// 收集所有代码文件
		const codeFiles = files.map(file => ({
			path: file.path || file.name,
			content: file.content
		}));

		return {
			componentCode: codeFiles.map(f => f.content).join('\n\n'),
			files: codeFiles
		};
	}

	/**
	 * 获取可用的 Agent 列表
	 */
	private getAvailableAgents(): string[] {
		return [
			'color-consistency',
			'typography-consistency',
			'spacing-consistency',
			'borderRadius-consistency',
			'shadow-consistency',
			'semantic-consistency',
			'layout-consistency',
			'accessibility'
		];
	}

	/**
	 * 显示结果
	 */
	private displayResults(result: AggregatedResult, context: any): void {
		// 显示摘要
		this.streamMarkdown(`\n${result.summary}\n`, context);

		// 显示详细差异（如果有）
		if (result.allDifferences.length > 0) {
			this.streamMarkdown(`\n## 详细差异\n`, context);

			// 按维度分组显示
			const dimensionGroups = new Map<string, typeof result.allDifferences>();

			for (const diff of result.allDifferences) {
				if (!dimensionGroups.has(diff.category)) {
					dimensionGroups.set(diff.category, []);
				}
				dimensionGroups.get(diff.category)!.push(diff);
			}

			dimensionGroups.forEach((diffs, category) => {
				this.streamMarkdown(`\n### ${category}\n`, context);
				this.streamMarkdown(this.formatDifferencesTable(diffs), context);
			});
		}

		// 显示执行时间
		this.streamMarkdown(`\n---\n*执行时间: ${result.executionTime}ms*\n`, context);
	}

	/**
	 * 格式化差异表格
	 */
	private formatDifferencesTable(differences: any[]): string {
		if (differences.length === 0) {
			return '暂无差异\n';
		}

		const lines: string[] = [];
		lines.push('| 严重程度 | 属性 | Figma 值 | 代码值 | 修复建议 |');
		lines.push('|---------|------|----------|--------|----------|');

		differences.forEach(diff => {
			const severity = diff.severity === 'critical' ? '🔴 严重' : '🟡 轻微';
			const property = diff.property;
			const figmaValue = this.truncate(String(diff.figmaValue), 30);
			const codeValue = this.truncate(String(diff.codeValue), 30);
			const fix = this.truncate(diff.fix || '-', 40);

			lines.push(`| ${severity} | ${property} | ${figmaValue} | ${codeValue} | ${fix} |`);
		});

		return lines.join('\n') + '\n';
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
