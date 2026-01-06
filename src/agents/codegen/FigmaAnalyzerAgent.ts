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

			this.streamProgress('Fetching Figma design data...', input.context);

			// Step 1: 获取 Figma 原始数据
			const figmaData = await this.figmaService.getDesignContext(figmaUrl);

			if (!figmaData) {
				return {
					success: false,
					error: 'Failed to fetch Figma design data'
				};
			}

			this.streamMarkdown(`\n## 🎨 Figma 设计内容分析\n\n`, input.context);
			this.streamProgress('Analyzing design structure and patterns...', input.context);

			// Step 2: 使用 LLM 分析 Figma 内容
			const analysis = await this.analyzeFigmaContent(figmaData, userRequest, input.context);

			// Step 3: 显示分析结果
			this.displayAnalysis(analysis, input.context);

			return {
				success: true,
				data: analysis,
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
	 * 显示分析结果
	 */
	private displayAnalysis(analysis: FigmaAnalysis, context: any): void {
		this.streamMarkdown(`\n### 📊 分析摘要\n\n`, context);
		this.streamMarkdown(`${analysis.summary}\n\n`, context);

		if (analysis.componentTypes.length > 0) {
			this.streamMarkdown(`### 🎯 识别的组件类型 (${analysis.componentTypes.length})\n\n`, context);
			analysis.componentTypes.forEach((type, index) => {
				this.streamMarkdown(`**${index + 1}. ${type.name}**\n`, context);
				this.streamMarkdown(`- ${type.description}\n`, context);
				if (type.nodeId) {
					this.streamMarkdown(`- Node ID: \`${type.nodeId}\`\n`, context);
				}
				if (type.variants && type.variants.length > 0) {
					this.streamMarkdown(`- Variants: ${type.variants.map(v => `${v.property}="${v.value}"`).join(', ')}\n`, context);
				}
				this.streamMarkdown(`\n`, context);
			});
		}

		if (analysis.patterns.length > 0) {
			this.streamMarkdown(`### 🔍 设计模式\n\n`, context);
			analysis.patterns.forEach(pattern => {
				this.streamMarkdown(`**${pattern.pattern}**\n`, context);
				this.streamMarkdown(`- ${pattern.description}\n`, context);
				if (pattern.examples.length > 0) {
					this.streamMarkdown(`- Examples: ${pattern.examples.join(', ')}\n`, context);
				}
				this.streamMarkdown(`\n`, context);
			});
		}

		if (analysis.recommendations.length > 0) {
			this.streamMarkdown(`### 💡 实现建议\n\n`, context);
			analysis.recommendations.forEach(rec => {
				this.streamMarkdown(`- ${rec}\n`, context);
			});
			this.streamMarkdown(`\n`, context);
		}
	}
}
