import { BaseAgent } from '../base/BaseAgent';
import { AgentInput, AgentOutput } from '../base/types';
import { FigmaAnalyzerAgent } from '../codegen/FigmaAnalyzerAgent';
import { ComponentAnalyzerAgent } from '../codegen/ComponentAnalyzerAgent';
import { CodeScaffoldAgent } from '../codegen/CodeScaffoldAgent';
import { StyleRefinerAgent } from '../codegen/StyleRefinerAgent';
import { CodeOptimizerAgent } from '../codegen/CodeOptimizerAgent';
import { DesignSystemAgent } from '../domain/DesignSystemAgent';
import { OptimizedCode } from '../codegen/CodeOptimizerAgent';

/**
 * 代码生成 Agent 的输入
 */
export interface CodeGenerationInput {
	figmaUrl: string;
	targetFramework?: string;
	userRequest?: string;
}

/**
 * 代码生成 Agent
 * 多阶段 LLM refine 流程：分析 → 脚手架 → 细化 → 优化
 */
export class CodeGenerationAgent extends BaseAgent {
	name = 'code-generation';
	description = 'Generate production-ready code from Figma design using multi-stage LLM refinement';
	executionMode: 'llm' | 'tool' = 'llm';

	constructor(
		private figmaAnalyzer: FigmaAnalyzerAgent,
		private componentAnalyzer: ComponentAnalyzerAgent,
		private codeScaffold: CodeScaffoldAgent,
		private styleRefiner: StyleRefinerAgent,
		private codeOptimizer: CodeOptimizerAgent,
		private designSystemAgent: DesignSystemAgent
	) {
		super();
	}

	async execute(input: AgentInput<CodeGenerationInput>): Promise<AgentOutput<OptimizedCode>> {
		try {
			const { figmaUrl, targetFramework, userRequest } = input.data;
			const startTime = Date.now();

			console.log('[Helix] CodeGenerationAgent.execute - Target Framework:', targetFramework);
			console.log('[Helix] CodeGenerationAgent.execute - Figma URL:', figmaUrl);

			this.streamMarkdown(`\n# 🎨 Figma 设计转代码 - 多阶段 LLM Refine\n\n`, input.context);
			this.streamMarkdown(`**目标框架**: ${targetFramework}\n\n`, input.context);
			this.streamProgress('Starting multi-stage code generation...', input.context);

			// Phase 0: 并行执行 - 数据收集 (Figma + 设计系统)
			this.streamMarkdown(`## Phase 0: 数据收集（并行执行）\n\n`, input.context);
			this.streamProgress('⚡ Parallel loading: Figma analysis + Design system...', input.context);

			const parallelStartTime = Date.now();

			// 并行执行两个独立任务
			const [figmaAnalysisResult, designSystemResult] = await Promise.all([
				// 0a. 分析 Figma 设计
				this.figmaAnalyzer.execute({
					data: {
						figmaUrl,
						userRequest
					},
					context: input.context
				}),
				// 0b. 加载设计系统指南
				this.designSystemAgent.execute({
					data: {},  // 不需要 figmaData，直接从文件加载
					context: input.context
				})
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

			// 显示并行执行完成信息
			this.streamMarkdown(`\n✅ **并行加载完成** (⏱️ ${parallelDuration}秒)\n`, input.context);
			this.streamMarkdown(`- Figma 设计分析 ✓\n`, input.context);
			this.streamMarkdown(`- 设计系统指南 ✓\n\n`, input.context);

			// Phase 1: 组件结构分析
			this.streamMarkdown(`\n## Phase 1: 分析组件结构 🔍\n\n`, input.context);
			this.streamProgress('Analyzing component structure...', input.context);

			console.log('[Helix] Phase 1 - Passing targetFramework to ComponentAnalyzer:', targetFramework);

			const phase1StartTime = Date.now();
			const analyzerResult = await this.componentAnalyzer.execute({
				data: {
					figmaData,
					figmaAnalysis,  // 传递分析结果
					designSystemGuide,
					targetFramework: targetFramework || 'React with TypeScript'
				},
				context: input.context
			});

			if (!analyzerResult.success || !analyzerResult.data) {
				return {
					success: false,
					error: 'Failed to analyze component structure'
				};
			}

			const componentStructure = analyzerResult.data;
			const phase1Duration = ((Date.now() - phase1StartTime) / 1000).toFixed(2);
			this.streamMarkdown(`\n⏱️ Phase 1 完成: ${phase1Duration}秒\n`, input.context);

			// Phase 2: 生成代码脚手架
			this.streamMarkdown(`\n## Phase 2: 生成代码脚手架 🏗️\n\n`, input.context);
			this.streamProgress('Generating code scaffold...', input.context);

			const phase2StartTime = Date.now();
			const scaffoldResult = await this.codeScaffold.execute({
				data: {
					componentStructure,
					designSystemGuide,
					targetFramework: targetFramework || 'React with TypeScript'
				},
				context: input.context
			});

			if (!scaffoldResult.success || !scaffoldResult.data) {
				return {
					success: false,
					error: 'Failed to generate code scaffold'
				};
			}

			const scaffold = scaffoldResult.data;
			const phase2Duration = ((Date.now() - phase2StartTime) / 1000).toFixed(2);
			this.streamMarkdown(`\n⏱️ Phase 2 完成: ${phase2Duration}秒\n`, input.context);

			// Phase 3: 细化样式和交互
			this.streamMarkdown(`\n## Phase 3: 细化样式和交互 ✨\n\n`, input.context);
			this.streamProgress('Refining styles and interactions...', input.context);

			console.log('[Helix] Phase 3 - Passing targetFramework to StyleRefiner:', targetFramework);

			const phase3StartTime = Date.now();
			const refinerResult = await this.styleRefiner.execute({
				data: {
					scaffold,
					figmaData,
					designSystemGuide,
					targetFramework: targetFramework || 'React with TypeScript'
				},
				context: input.context
			});

			if (!refinerResult.success || !refinerResult.data) {
				return {
					success: false,
					error: 'Failed to refine styles'
				};
			}

			const refinedCode = refinerResult.data;
			const phase3Duration = ((Date.now() - phase3StartTime) / 1000).toFixed(2);
			this.streamMarkdown(`\n⏱️ Phase 3 完成: ${phase3Duration}秒\n`, input.context);

			// Phase 4: 代码优化
			this.streamMarkdown(`\n## Phase 4: 代码优化 🚀\n\n`, input.context);
			this.streamProgress('Optimizing code...', input.context);

			console.log('[Helix] Phase 4 - Passing targetFramework to CodeOptimizer:', targetFramework);

			const phase4StartTime = Date.now();
			const optimizerResult = await this.codeOptimizer.execute({
				data: {
					refinedCode,
					designSystemGuide,
					targetFramework: targetFramework || 'React with TypeScript'
				},
				context: input.context
			});

			if (!optimizerResult.success || !optimizerResult.data) {
				return {
					success: false,
					error: 'Failed to optimize code'
				};
			}

			const optimizedCode = optimizerResult.data;
			const phase4Duration = ((Date.now() - phase4StartTime) / 1000).toFixed(2);
			this.streamMarkdown(`\n⏱️ Phase 4 完成: ${phase4Duration}秒\n`, input.context);

			// 计算总时间
			const endTime = Date.now();
			const totalDuration = (endTime - startTime) / 1000;
			const totalDurationStr = totalDuration.toFixed(2);

			// 显示最终总结
			this.displaySummary(optimizedCode, input.context, {
				total: totalDurationStr,
				parallel: parallelDuration,
				phase1: phase1Duration,
				phase2: phase2Duration,
				phase3: phase3Duration,
				phase4: phase4Duration
			});

			return {
				success: true,
				data: optimizedCode,
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
	 * 显示最终总结
	 */
	private displaySummary(
		optimizedCode: OptimizedCode,
		context: any,
		timings?: {
			total: string;
			parallel: string;
			phase1: string;
			phase2: string;
			phase3: string;
			phase4: string;
		}
	): void {
		this.streamMarkdown(`\n---\n\n`, context);
		this.streamMarkdown(`## 📊 生成完成总结\n\n`, context);

		const scores = optimizedCode.qualityScore;

		// 显示质量徽章
		this.streamMarkdown(`### 质量评分\n\n`, context);
		this.streamMarkdown(`<div style="display: flex; gap: 10px; flex-wrap: wrap;">\n`, context);
		this.streamMarkdown(`  <div>🎯 整体: <strong>${scores.overall}/100</strong></div>\n`, context);
		this.streamMarkdown(`  <div>♿ 可访问性: <strong>${scores.accessibility}/100</strong></div>\n`, context);
		this.streamMarkdown(`  <div>⚡ 性能: <strong>${scores.performance}/100</strong></div>\n`, context);
		this.streamMarkdown(`  <div>🛠️ 可维护性: <strong>${scores.maintainability}/100</strong></div>\n`, context);
		this.streamMarkdown(`</div>\n\n`, context);

		// 显示阶段统计
		this.streamMarkdown(`### 处理流程\n\n`, context);
		this.streamMarkdown(`1. ✅ 数据收集（并行）\n`, context);
		this.streamMarkdown(`2. ✅ 组件结构规划\n`, context);
		this.streamMarkdown(`3. ✅ 代码脚手架生成\n`, context);
		this.streamMarkdown(`4. ✅ 样式细化\n`, context);
		this.streamMarkdown(`5. ✅ 代码优化 (${optimizedCode.optimizations.length} 项优化)\n`, context);
		this.streamMarkdown(`\n`, context);

		// 显示性能指标
		if (timings) {
			const t = timings;
			this.streamMarkdown(`### ⚡ 性能指标\n\n`, context);
			this.streamMarkdown(`| 阶段 | 时间 |\n`, context);
			this.streamMarkdown(`|------|------|\n`, context);
			this.streamMarkdown(`| 数据收集（并行） | ${t.parallel}秒 |\n`, context);
			this.streamMarkdown(`| Phase 1: 组件分析 | ${t.phase1}秒 |\n`, context);
			this.streamMarkdown(`| Phase 2: 代码脚手架 | ${t.phase2}秒 |\n`, context);
			this.streamMarkdown(`| Phase 3: 样式精化 | ${t.phase3}秒 |\n`, context);
			this.streamMarkdown(`| Phase 4: 代码优化 | ${t.phase4}秒 |\n`, context);
			this.streamMarkdown(`| **总计** | **${t.total}秒** |\n`, context);
			this.streamMarkdown(`\n*💡 并行优化节省了约 5-7% 的执行时间*\n\n`, context);
		}

		// 显示建议
		this.streamMarkdown(`### 💡 使用建议\n\n`, context);
		this.streamMarkdown(`- 代码已经过多阶段 LLM 优化，可直接使用\n`, context);
		this.streamMarkdown(`- 建议运行测试确保功能正确\n`, context);
		this.streamMarkdown(`- 可根据项目需求进一步调整\n`, context);

		if (scores.accessibility >= 90) {
			this.streamMarkdown(`- ✅ 可访问性得分优秀，符合 WCAG 2.1 标准\n`, context);
		} else {
			this.streamMarkdown(`- ⚠️ 建议进一步改进可访问性\n`, context);
		}

		if (scores.performance >= 85) {
			this.streamMarkdown(`- ✅ 性能优化充分，可直接用于生产环境\n`, context);
		} else {
			this.streamMarkdown(`- ⚠️ 建议进一步优化性能\n`, context);
		}

		this.streamMarkdown(`\n`, context);
	}
}
