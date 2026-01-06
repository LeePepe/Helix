import * as vscode from 'vscode';
import { AgentRegistry } from './base/AgentRegistry';
import { DynamicAgentFactory } from './base/DynamicAgentFactory';
import { PlannerAgent } from './planner/PlannerAgent';
import { DynamicOrchestrator } from './orchestrator/DynamicOrchestrator';
import { DesignSystemAgent } from './domain/DesignSystemAgent';
import { FitFinishAgent } from './tasks/FitFinishAgent';
import { CodeGenerationAgent } from './tasks/CodeGenerationAgent';

// Tool-driven agents
import { ToolDrivenConsistencyAgent } from './dimensions/ToolDrivenConsistencyAgent';
import { ExtractorFactory, ComparatorFactory, NormalizerFactory } from './dimensions/utils/factories';
import {
	allDimensionConfigs
} from './dimensions/configs';

// LLM-driven agents
import { SemanticConsistencyAgent } from './dimensions/SemanticConsistencyAgent';
import { LayoutConsistencyAgent } from './dimensions/LayoutConsistencyAgent';
import { AccessibilityAgent } from './dimensions/AccessibilityAgent';

// Code generation agents
import { FigmaAnalyzerAgent } from './codegen/FigmaAnalyzerAgent';
import { ComponentAnalyzerAgent } from './codegen/ComponentAnalyzerAgent';
import { CodeScaffoldAgent } from './codegen/CodeScaffoldAgent';
import { StyleRefinerAgent } from './codegen/StyleRefinerAgent';
import { CodeOptimizerAgent } from './codegen/CodeOptimizerAgent';

/**
 * Agent 启动器
 * 初始化并注册所有 Agent
 */
export class AgentBootstrap {
	private registry: AgentRegistry;
	private factory: DynamicAgentFactory;
	private planner: PlannerAgent;
	private orchestrator: DynamicOrchestrator;
	private designSystemAgent: DesignSystemAgent;
	private fitFinishAgent: FitFinishAgent;
	private codeGenerationAgent: CodeGenerationAgent;

	constructor() {
		// 初始化核心组件
		this.registry = new AgentRegistry();
		this.factory = new DynamicAgentFactory();

		// 初始化 Planner 和 Orchestrator
		this.planner = new PlannerAgent();
		this.orchestrator = new DynamicOrchestrator(this.registry, this.factory);

		// 初始化领域 Agent
		this.designSystemAgent = new DesignSystemAgent();

		// 初始化代码生成 Agents
		const figmaAnalyzer = new FigmaAnalyzerAgent();
		const componentAnalyzer = new ComponentAnalyzerAgent();
		const codeScaffold = new CodeScaffoldAgent();
		const styleRefiner = new StyleRefinerAgent();
		const codeOptimizer = new CodeOptimizerAgent();

		// 初始化任务 Agent
		this.fitFinishAgent = new FitFinishAgent(
			figmaAnalyzer,
			this.planner,
			this.orchestrator,
			this.designSystemAgent
		);

		this.codeGenerationAgent = new CodeGenerationAgent(
			figmaAnalyzer,
			componentAnalyzer,
			codeScaffold,
			styleRefiner,
			codeOptimizer,
			this.designSystemAgent
		);

		// 注册所有预定义的 Agent
		this.registerPredefinedAgents();
	}

	/**
	 * 注册所有预定义的 Agent
	 */
	private registerPredefinedAgents(): void {
		// 注册工具驱动的 Dimension Agents
		this.registerToolDrivenAgents();

		// 注册 LLM 驱动的 Dimension Agents
		this.registerLLMDrivenAgents();

		// 注册系统 Agent
		this.registry.register('planner', this.planner);
		this.registry.register('design-system', this.designSystemAgent);
		this.registry.register('fit-finish', this.fitFinishAgent);
		this.registry.register('code-generation', this.codeGenerationAgent);
	}

	/**
	 * 注册工具驱动的 Agent
	 */
	private registerToolDrivenAgents(): void {
		const extractorFactory = new ExtractorFactory();
		const comparatorFactory = new ComparatorFactory();
		const normalizerFactory = new NormalizerFactory();

		for (const config of allDimensionConfigs) {
			const agent = new ToolDrivenConsistencyAgent(
				config,
				extractorFactory,
				comparatorFactory,
				normalizerFactory
			);

			// 使用维度名称作为 ID
			this.registry.register(config.name, agent);

			// 同时使用标准的 Agent 命名格式注册
			const agentId = `${config.name}-consistency`;
			this.registry.register(agentId, agent);
		}
	}

	/**
	 * 注册 LLM 驱动的 Agent
	 */
	private registerLLMDrivenAgents(): void {
		const semanticAgent = new SemanticConsistencyAgent();
		const layoutAgent = new LayoutConsistencyAgent();
		const accessibilityAgent = new AccessibilityAgent();

		this.registry.register('semantic-consistency', semanticAgent);
		this.registry.register('layout-consistency', layoutAgent);
		this.registry.register('accessibility', accessibilityAgent);
	}

	/**
	 * 获取 Agent Registry
	 */
	getRegistry(): AgentRegistry {
		return this.registry;
	}

	/**
	 * 获取 Fit & Finish Agent
	 */
	getFitFinishAgent(): FitFinishAgent {
		return this.fitFinishAgent;
	}

	/**
	 * 获取 Code Generation Agent
	 */
	getCodeGenerationAgent(): CodeGenerationAgent {
		return this.codeGenerationAgent;
	}

	/**
	 * 获取 Design System Agent
	 */
	getDesignSystemAgent(): DesignSystemAgent {
		return this.designSystemAgent;
	}

	/**
	 * 获取所有注册的 Agent 名称
	 */
	getAgentNames(): string[] {
		return this.registry.getAgentNames();
	}
}
