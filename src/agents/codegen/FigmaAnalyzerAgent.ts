import { BaseAgent } from '../base/BaseAgent';
import { AgentInput, AgentOutput } from '../base/types';
import { FigmaService } from '../../services/figmaService';

/**
 * Figma 分析结果
 */
export interface FigmaAnalysis {
	summary: string;  // 整体总结
	componentTypes: ComponentTypeInfo[];  // 识别出的组件类型/变体
	patterns: DesignPattern[];  // 设计模式
	recommendations: string[];  // 建议
	rawData: any;  // 原始 Figma 数据（供后续使用）
}

export interface ComponentTypeInfo {
	name: string;  // 组件类型名称，如 "Dialog - Default", "Dialog - Loading"
	nodeId: string;  // Figma 节点 ID
	description: string;  // 描述
	variants?: {
		property: string;
		value: string;
	}[];  // 变体属性
}

export interface DesignPattern {
	pattern: string;  // 模式名称，如 "Modal Pattern", "Multi-state Component"
	description: string;  // 描述
	examples: string[];  // 示例
}

/**
 * Figma 内容分析 Agent
 * 根据用户 prompt 和 Figma 数据，智能分析设计内容
 * 识别组件类型、状态、变体等，为后续流程提供结构化信息
 */
export class FigmaAnalyzerAgent extends BaseAgent {
	name = 'figma-analyzer';
	description = 'Analyze Figma design content and identify component types, variants, and patterns';
	executionMode: 'llm' | 'tool' = 'llm';

	private figmaService: FigmaService;

	constructor() {
		super();
		this.figmaService = new FigmaService();
	}

	async execute(input: AgentInput): Promise<AgentOutput<FigmaAnalysis>> {
		try {
			const { figmaUrl, userRequest } = input.data;

			console.log('[HELIX][FigmaAnalyzerAgent] ========== Starting Figma Analysis ==========');
			console.log('[HELIX][FigmaAnalyzerAgent] figmaUrl:', figmaUrl);
			console.log('[HELIX][FigmaAnalyzerAgent] userRequest:', userRequest);

			this.streamProgress('Fetching Figma design data...', input.context);

			// Step 1: 获取 Figma 原始数据
			const figmaData = await this.figmaService.getDesignContext(figmaUrl);

			console.log('[HELIX][FigmaAnalyzerAgent] Received figmaData from FigmaService');
			console.log('[HELIX][FigmaAnalyzerAgent] figmaData type:', typeof figmaData);
			console.log('[HELIX][FigmaAnalyzerAgent] figmaData keys:', figmaData ? Object.keys(figmaData).slice(0, 20) : 'null');
			console.log('[HELIX][FigmaAnalyzerAgent] _isMetadata flag:', figmaData?._isMetadata);

			if (!figmaData) {
				console.error('[HELIX][FigmaAnalyzerAgent] ❌ No figmaData received');
				return {
					success: false,
					error: 'Failed to fetch Figma design data'
				};
			}

			// Check if we got metadata-only response (design too large)
			if (figmaData._isMetadata) {
				this.streamProgress('Design is large, extracting detailed node info...', input.context);
				console.log('[HELIX][FigmaAnalyzerAgent] Received metadata-only response, extracting sub-nodes');
				console.log('[HELIX][FigmaAnalyzerAgent] XML content length:', figmaData._xmlContent?.length || 0);

				// Extract node IDs from XML metadata
				const nodeIds = this.extractNodeIdsFromXML(figmaData._xmlContent);
				console.log('[HELIX][FigmaAnalyzerAgent] Extracted node IDs from XML:', nodeIds.length);

				// Fetch detailed data for the first few leaf nodes (instances/components)
				// Focus on instances as they usually contain the actual spacing/styling info
				const detailedNodes = await this.fetchDetailedNodes(figmaUrl, nodeIds.slice(0, 5), input.context);
				console.log('[HELIX][FigmaAnalyzerAgent] Fetched detailed data for', detailedNodes.length, 'nodes');

				// If we got at least one detailed node, use it for spacing check
				if (detailedNodes.length > 0) {
					console.log('[HELIX][FigmaAnalyzerAgent] Using first detailed node for analysis');
					const firstNode = detailedNodes[0];

					// Simple analysis since we have actual node data
					return {
						success: true,
						data: {
							summary: `Large design with ${nodeIds.length} nodes. Using first instance for spacing check.`,
							componentTypes: [{
								name: firstNode.name || 'Component',
								nodeId: firstNode.id || '',
								description: 'Selected node for spacing analysis'
							}],
							patterns: [],
							recommendations: ['Check spacing values against this component instance'],
							rawData: firstNode  // Use the detailed node data
						},
						metadata: {
							executionMode: 'tool',
							agentName: this.name,
							isMetadataOnly: false
						}
					};
				}

				// Fallback: Return XML as before if detailed fetch failed
				console.log('[HELIX][FigmaAnalyzerAgent] Could not fetch detailed nodes, using XML metadata');
				return {
					success: true,
					data: {
						summary: `Large design with ${nodeIds.length} nodes. XML metadata only.`,
						componentTypes: [],
						patterns: [],
						recommendations: ['Select a specific component node for spacing analysis'],
						rawData: figmaData._xmlContent
					},
					metadata: {
						executionMode: 'tool',
						agentName: this.name,
						isMetadataOnly: true
					}
				};
			}

			this.streamProgress('Analyzing design structure and patterns...', input.context);

			console.log('[HELIX][FigmaAnalyzerAgent] Using full JSON figmaData for analysis');
			console.log('[HELIX][FigmaAnalyzerAgent] figmaData preview (first 500 chars):',
				JSON.stringify(figmaData, null, 2).substring(0, 500));

			// Step 2: 使用 LLM 分析 Figma 内容
			const analysis = await this.analyzeFigmaContent(figmaData, userRequest, input.context);

			console.log('[HELIX][FigmaAnalyzerAgent] Analysis complete (JSON mode)');
			console.log('[HELIX][FigmaAnalyzerAgent] Component types found:', analysis.componentTypes?.length || 0);
			console.log('[HELIX][FigmaAnalyzerAgent] Returning rawData as JSON');

			return {
				success: true,
				data: analysis,
				metadata: {
					executionMode: 'llm',
					agentName: this.name
				}
			};
		} catch (error: any) {
			console.error('[HELIX][FigmaAnalyzerAgent] ❌ Error during execution:', error.message);
			return this.handleError(error);
		}
	}

	/**
	 * 分析 Figma 内容
	 */
	private async analyzeFigmaContent(
		figmaData: any,
		userRequest: string,
		context: any
	): Promise<FigmaAnalysis> {
		const prompt = this.buildAnalysisPrompt(figmaData, userRequest);
		const llmResponse = await this.callLLM(prompt, context);

		try {
			// 移除可能的 markdown 代码块
			let cleanedResponse = llmResponse.trim();
			if (cleanedResponse.startsWith('```')) {
				cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*\n?/, '');
				cleanedResponse = cleanedResponse.replace(/\n?```\s*$/, '');
			}

			const parsed = JSON.parse(cleanedResponse);

			return {
				...parsed,
				rawData: figmaData  // 保留原始数据供后续使用
			};
		} catch (error: any) {
			throw new Error(`Failed to parse Figma analysis: ${error.message}\n\nLLM Response:\n${llmResponse}`);
		}
	}

	/**
	 * 构建分析提示词
	 */
	private buildAnalysisPrompt(figmaData: any, userRequest: string): string {
		return `You are an expert design analyst. Analyze the following Figma design data and provide a structured analysis.

# User Request

${userRequest || 'Analyze this design and identify all component types and variants'}

# Figma Design Data

${typeof figmaData === 'string' ? figmaData : JSON.stringify(figmaData, null, 2)}

# Your Task

Analyze the Figma design and provide:

1. **Summary**: A brief overview of what this design contains (1-2 sentences)

2. **Component Types**: Identify all distinct component types, states, or variants in this design
   - For each type, provide: name, description, and Figma node ID (if available in data-node-id attributes)
   - Examples:
     * "Dialog - Default (One Action)" - A simple dialog with one primary action
     * "Dialog - Delete Confirmation" - A dialog for confirming destructive actions
     * "Dialog - Loading" - A loading state dialog with spinner
     * "Dialog - Sign In" - A dialog for authentication

3. **Design Patterns**: Identify common design patterns used
   - Modal patterns, multi-state components, responsive layouts, etc.

4. **Recommendations**: Suggestions for implementation based on the analysis
   - Code structure recommendations
   - Variant/state management suggestions
   - Accessibility considerations

# Output Format

Return a JSON object with this structure:

\`\`\`json
{
  "summary": "Brief overview of the design",
  "componentTypes": [
    {
      "name": "Dialog - Default (One Action)",
      "nodeId": "4615:185110",
      "description": "A standard dialog with single primary action and optional secondary action",
      "variants": [
        { "property": "context", "value": "launcher" },
        { "property": "context", "value": "main-window" }
      ]
    },
    {
      "name": "Dialog - Loading",
      "nodeId": "4679:235752",
      "description": "A loading state dialog displaying a spinner"
    }
  ],
  "patterns": [
    {
      "pattern": "Multi-state Component",
      "description": "Component has multiple states (default, loading, error, etc.)",
      "examples": ["Default state with actions", "Loading state with spinner", "Empty state"]
    }
  ],
  "recommendations": [
    "Implement as a single Dialog component with variant props (type, size, actions)",
    "Use TypeScript discriminated unions for type-safe variant handling",
    "Consider using compound component pattern for flexible composition"
  ]
}
\`\`\`

# Important Guidelines

1. **Be specific**: Extract actual component names and node IDs from the data
2. **Identify variants**: Look for similar components with different states/styles
3. **Extract from data-node-id**: If you see data-node-id attributes in the HTML, use those values
4. **Consider user request**: Tailor your analysis to what the user is asking for
5. **Be practical**: Focus on information useful for code generation/comparison

Return ONLY the JSON object, no additional text or markdown code blocks.`;
	}

	/**
	 * 从XML元数据中提取节点ID
	 */
	private extractNodeIdsFromXML(xmlContent: string): Array<{id: string, type: string, name: string}> {
		const nodeIds: Array<{id: string, type: string, name: string}> = [];

		// 正则匹配 <frame id="..." name="..."> 和 <instance id="..." name="...">
		const frameRegex = /<frame id="([^"]+)" name="([^"]+)"/g;
		const instanceRegex = /<instance id="([^"]+)" name="([^"]+)"/g;

		let match;

		// 优先提取 instance (通常是组件实例,包含实际样式)
		while ((match = instanceRegex.exec(xmlContent)) !== null) {
			nodeIds.push({
				id: match[1],
				type: 'instance',
				name: match[2]
			});
		}

		// 如果没有 instance,提取 frame
		if (nodeIds.length === 0) {
			while ((match = frameRegex.exec(xmlContent)) !== null) {
				nodeIds.push({
					id: match[1],
					type: 'frame',
					name: match[2]
				});
			}
		}

		return nodeIds;
	}

	/**
	 * 获取详细节点数据
	 */
	private async fetchDetailedNodes(
		figmaUrl: string,
		nodeInfos: Array<{id: string, type: string, name: string}>,
		_context: any
	): Promise<any[]> {
		const detailedNodes: any[] = [];

		console.log('[HELIX][FigmaAnalyzerAgent] Fetching detailed data for nodes:', nodeInfos.map(n => n.name).join(', '));

		// 解析 fileKey
		const urlMatch = figmaUrl.match(/figma\.com\/(?:file|design)\/([^/?]+)/);
		if (!urlMatch) {
			console.error('[HELIX][FigmaAnalyzerAgent] Could not extract fileKey from URL');
			return detailedNodes;
		}
		const fileKey = urlMatch[1];

		// 逐个获取节点详细信息
		for (const nodeInfo of nodeInfos) {
			try {
				console.log(`[HELIX][FigmaAnalyzerAgent] Fetching node ${nodeInfo.id} (${nodeInfo.name})...`);

				// 构造新的URL用于获取这个特定节点
				const nodeUrl = `https://www.figma.com/design/${fileKey}/?node-id=${nodeInfo.id}`;
				const nodeData = await this.figmaService.getDesignContext(nodeUrl);

				if (nodeData && !nodeData._isMetadata) {
					console.log(`[HELIX][FigmaAnalyzerAgent] ✅ Got detailed data for ${nodeInfo.name}`);
					detailedNodes.push(nodeData);
				} else {
					console.log(`[HELIX][FigmaAnalyzerAgent] ⚠️ Node ${nodeInfo.name} still returned metadata`);
				}
			} catch (error: any) {
				console.error(`[HELIX][FigmaAnalyzerAgent] ❌ Failed to fetch node ${nodeInfo.id}:`, error.message);
			}
		}

		return detailedNodes;
	}

}
