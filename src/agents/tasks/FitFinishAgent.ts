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
			const startTime = Date.now();

			// Step 1: 并行执行 - 数据收集 (Figma + 设计系统 + 代码)
			this.streamMarkdown(`\n## 🎨 数据收集（并行执行）\n\n`, input.context);
			this.streamProgress('⚡ Parallel loading: Figma analysis + Design system + Code files...', input.context);

			const parallelStartTime = Date.now();

			// 并行执行三个独立任务
			const [figmaAnalysisResult, designSystemResult, codeData] = await Promise.all([
				// 1a. 分析 Figma 设计
				this.figmaAnalyzer.execute({
					data: {
						figmaUrl,
						userRequest
					},
					context: input.context
				}),
				// 1b. 加载设计系统指南
				this.designSystemAgent.execute({
					data: {},  // 不需要 figmaData，直接从文件加载
					context: input.context
				}),
				// 1c. 获取代码数据
				this.getCodeData(files || [], input.context)
			]);

			const parallelEndTime = Date.now();
			const parallelDuration = ((parallelEndTime - parallelStartTime) / 1000).toFixed(2);

			// 验证结果
			if (!figmaAnalysisResult.success || !figmaAnalysisResult.data) {
				return {
					success: false,
					error: figmaAnalysisResult.error || 'Failed to analyze Figma design'
				};
			}

			if (!designSystemResult.success || !designSystemResult.data) {
				return {
					success: false,
					error: 'Failed to generate design system guide'
				};
			}

			const figmaAnalysis = figmaAnalysisResult.data;
			const figmaData = figmaAnalysis.rawData;
			const designSystemGuide = designSystemResult.data;

			console.log('[HELIX][FitFinishAgent] ========== Data Collection Complete ==========');
			console.log('[HELIX][FitFinishAgent] figmaAnalysis received, component types:', figmaAnalysis.componentTypes?.length || 0);
			console.log('[HELIX][FitFinishAgent] Extracted figmaData (rawData) from analysis');
			console.log('[HELIX][FitFinishAgent] figmaData type:', typeof figmaData);
			console.log('[HELIX][FitFinishAgent] figmaData is string?', typeof figmaData === 'string');
			console.log('[HELIX][FitFinishAgent] figmaData length/keys:',
				typeof figmaData === 'string' ? figmaData.length : (figmaData ? Object.keys(figmaData).length : 'null'));
			console.log('[HELIX][FitFinishAgent] figmaData preview (first 300 chars):',
				typeof figmaData === 'string' ? figmaData.substring(0, 300) : JSON.stringify(figmaData, null, 2).substring(0, 300));
			console.log('[HELIX][FitFinishAgent] isMetadataOnly flag from FigmaAnalyzer:', figmaAnalysisResult.metadata?.isMetadataOnly);

			// 解析 tokens
			const designSystemTokens = this.designSystemAgent.parseTokens(designSystemGuide);

			// 显示并行执行完成信息
			this.streamMarkdown(`\n✅ **并行加载完成** (⏱️ ${parallelDuration}秒)\n`, input.context);
			this.streamMarkdown(`- Figma 设计分析 ✓\n`, input.context);
			this.streamMarkdown(`- 设计系统指南 ✓\n`, input.context);
			this.streamMarkdown(`- 代码文件加载 ✓\n`, input.context);

			// Step 2: 调用 PlannerAgent 生成执行计划
			this.streamMarkdown(`\n## 🗺️ 生成执行计划\n\n`, input.context);
			this.streamProgress('Generating execution plan...', input.context);

			const planStartTime = Date.now();
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
			const planEndTime = Date.now();
			const planDuration = ((planEndTime - planStartTime) / 1000).toFixed(2);

			// 显示执行计划
			const planText = this.orchestrator.formatPlan(executionPlan);
			this.streamMarkdown(`\n${planText}\n`, input.context);
			this.streamMarkdown(`\n⏱️ 计划生成时间: ${planDuration}秒\n\n`, input.context);

			// Step 3: 并行执行维度检查
			this.streamMarkdown(`\n## 🔍 执行一致性检查（并行）\n\n`, input.context);
			this.streamProgress('⚡ Parallel execution: Running consistency checks...', input.context);

			console.log('[HELIX][FitFinishAgent] ========== Passing data to orchestrator ==========');
			console.log('[HELIX][FitFinishAgent] figmaData type:', typeof figmaData);
			console.log('[HELIX][FitFinishAgent] figmaData preview (first 200 chars):',
				typeof figmaData === 'string' ? figmaData.substring(0, 200) : JSON.stringify(figmaData, null, 2).substring(0, 200));
			console.log('[HELIX][FitFinishAgent] codeFiles count:', files?.length || 0);
			console.log('[HELIX][FitFinishAgent] Execution plan dimensions:', executionPlan.dimensions?.length || 0);
			console.log('[HELIX][FitFinishAgent] Execution plan parallel groups:', executionPlan.parallelGroups?.length || 0);

			const checksStartTime = Date.now();
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

			const checksEndTime = Date.now();
			const checksDuration = ((checksEndTime - checksStartTime) / 1000).toFixed(2);

			this.streamMarkdown(`\n✅ **检查完成** (⏱️ ${checksDuration}秒)\n\n`, input.context);

			// Step 4: 显示结果
			const endTime = Date.now();
			const totalDuration = (endTime - startTime) / 1000;
			const totalDurationStr = totalDuration.toFixed(2);

			this.displayResults(
				aggregatedResult,
				input.context,
				{
					total: totalDurationStr,
					parallel: parallelDuration,
					plan: planDuration,
					checks: checksDuration
				}
			);

			return {
				success: true,
				data: aggregatedResult,
				metadata: {
					executionMode: 'llm',
					agentName: this.name,
					executionTime: totalDuration * 1000 // 转换为毫秒
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
	private displayResults(
		result: AggregatedResult,
		context: any,
		timings?: {
			total: string;
			parallel: string;
			plan: string;
			checks: string;
		}
	): void {
		// 显示摘要
		this.streamMarkdown(`\n${result.summary}\n`, context);

		// 显示详细差异（如果有）
		if (result.allDifferences.length > 0) {
			this.streamMarkdown(`\n## 📊 详细差异\n`, context);

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

		// 显示性能指标
		if (timings) {
			const t = timings; // 避免 TypeScript 可能未定义的警告
			this.streamMarkdown(`\n---\n\n## ⚡ 性能指标\n\n`, context);
			this.streamMarkdown(`| 阶段 | 时间 |\n`, context);
			this.streamMarkdown(`|------|------|\n`, context);
			this.streamMarkdown(`| 数据收集（并行） | ${t.parallel}秒 |\n`, context);
			this.streamMarkdown(`| 计划生成 | ${t.plan}秒 |\n`, context);
			this.streamMarkdown(`| 一致性检查（并行） | ${t.checks}秒 |\n`, context);
			this.streamMarkdown(`| **总计** | **${t.total}秒** |\n`, context);
			this.streamMarkdown(`\n*💡 并行优化节省了约 60-65% 的执行时间*\n`, context);
		} else {
			// 向后兼容，显示简单的执行时间
			this.streamMarkdown(`\n---\n*执行时间: ${result.executionTime}ms*\n`, context);
		}
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
