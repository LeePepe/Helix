import { BaseAgent } from '../base/BaseAgent';
import { AgentInput, AgentOutput } from '../base/types';

/**
 * 组件结构分析结果
 */
export interface ComponentStructure {
	componentName: string;
	componentType: string;  // 'functional' | 'class'
	props: PropDefinition[];
	state: StateDefinition[];
	children: ComponentStructure[];
	styling: {
		approach: 'css-modules' | 'styled-components' | 'tailwind' | 'inline';
		hasResponsive: boolean;
		hasAnimations: boolean;
	};
	interactions: InteractionDefinition[];
	dataFlow: {
		hasExternalData: boolean;
		dataSource?: string;
	};
}

export interface PropDefinition {
	name: string;
	type: string;
	required: boolean;
	defaultValue?: string;
	description?: string;
}

export interface StateDefinition {
	name: string;
	type: string;
	initialValue: string;
	description?: string;
}

export interface InteractionDefinition {
	event: string;
	action: string;
	description: string;
}

/**
 * 组件分析 Agent
 * 第一阶段：分析 Figma 设计，生成组件结构计划
 */
export class ComponentAnalyzerAgent extends BaseAgent {
	name = 'component-analyzer';
	description = 'Analyze Figma design and generate component structure plan';
	executionMode: 'llm' | 'tool' = 'llm';

	async execute(input: AgentInput): Promise<AgentOutput<ComponentStructure>> {
		try {
			const { figmaData, designSystemGuide, targetFramework } = input.data;

			console.log('[Helix] ComponentAnalyzerAgent - Received targetFramework:', targetFramework);

			this.streamProgress('Analyzing Figma design structure...', input.context);

			// 构建提示词
			const prompt = this.buildAnalysisPrompt(figmaData, designSystemGuide, targetFramework);

			// 调用 LLM
			const llmResponse = await this.callLLM(prompt, input.context);

			// 解析响应
			const structure = this.parseComponentStructure(llmResponse);

			// 显示结构计划
			this.displayStructure(structure, input.context);

			return {
				success: true,
				data: structure,
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
	 * 构建分析提示词
	 */
	private buildAnalysisPrompt(
		figmaData: any,
		designSystemGuide: string,
		targetFramework: string
	): string {
		const framework = targetFramework || 'React with TypeScript';
		console.log('[Helix] ComponentAnalyzerAgent.buildAnalysisPrompt - Using framework:', framework);

		return `You are an expert component architect for ${framework}. Analyze the following Figma design and create a detailed component structure plan.

# Figma Design Data

${JSON.stringify(figmaData, null, 2)}

# Design System Guide

${designSystemGuide}

# Target Framework

${framework}

# Your Task

Analyze the Figma design and generate a comprehensive component structure plan FOR ${framework}. Consider:

## 1. Component Hierarchy
- Break down the design into logical components
- Identify reusable sub-components
- Determine component relationships (parent-child)

## 2. Component Props
- What props does each component need?
- Which props are required vs optional?
- What are the prop types?

## 3. Component State
- What local state is needed?
- What state should be lifted up?
- What interactions require state changes?

## 4. Styling Approach
- Recommend the best styling approach (CSS Modules, Styled Components, Tailwind, etc.)
- Consider if responsive design is needed
- Identify if animations are required

## 5. Interactions
- What user interactions are present? (click, hover, input, etc.)
- What should happen on each interaction?
- Are there any complex interaction flows?

## 6. Data Flow
- Does the component need external data?
- Where does the data come from? (API, props, context, etc.)

# Output Format

Return a JSON object with this structure:

\`\`\`json
{
  "componentName": "PrimaryButton",
  "componentType": "functional",
  "props": [
    {
      "name": "onClick",
      "type": "() => void",
      "required": true,
      "description": "Handler for button click"
    },
    {
      "name": "variant",
      "type": "'primary' | 'secondary'",
      "required": false,
      "defaultValue": "'primary'",
      "description": "Button visual variant"
    }
  ],
  "state": [
    {
      "name": "isHovered",
      "type": "boolean",
      "initialValue": "false",
      "description": "Track hover state for visual feedback"
    }
  ],
  "children": [],
  "styling": {
    "approach": "css-modules",
    "hasResponsive": true,
    "hasAnimations": true
  },
  "interactions": [
    {
      "event": "onClick",
      "action": "Call onClick prop handler",
      "description": "Execute callback when button is clicked"
    },
    {
      "event": "onMouseEnter",
      "action": "Set isHovered to true",
      "description": "Show hover state"
    }
  ],
  "dataFlow": {
    "hasExternalData": false
  }
}
\`\`\`

# Important Guidelines

1. **Keep it modular**: Break down into small, reusable components
2. **Follow React best practices**: Use functional components with hooks
3. **Type safety**: Provide proper TypeScript types
4. **Design system alignment**: Use design system tokens from the guide
5. **Accessibility**: Consider ARIA attributes and keyboard navigation
6. **Performance**: Think about memoization and optimization opportunities

Return ONLY the JSON object, no additional text or markdown code blocks.`;
	}

	/**
	 * 解析组件结构
	 */
	private parseComponentStructure(llmResponse: string): ComponentStructure {
		try {
			// 移除可能的 markdown 代码块标记
			let cleanedResponse = llmResponse.trim();

			if (cleanedResponse.startsWith('```')) {
				cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*\n?/, '');
				cleanedResponse = cleanedResponse.replace(/\n?```\s*$/, '');
			}

			const parsed = JSON.parse(cleanedResponse);

			// 验证必需字段
			if (!parsed.componentName || !parsed.componentType) {
				throw new Error('Invalid component structure: missing required fields');
			}

			return parsed as ComponentStructure;
		} catch (error: any) {
			throw new Error(`Failed to parse component structure: ${error.message}\n\nLLM Response:\n${llmResponse}`);
		}
	}

	/**
	 * 显示组件结构
	 */
	private displayStructure(structure: ComponentStructure, context: any): void {
		this.streamMarkdown(`\n## 📋 组件结构计划\n\n`, context);
		this.streamMarkdown(`**组件名称**: ${structure.componentName}\n`, context);
		this.streamMarkdown(`**类型**: ${structure.componentType}\n`, context);

		if (structure.props.length > 0) {
			this.streamMarkdown(`\n**Props** (${structure.props.length}):\n`, context);
			structure.props.forEach(prop => {
				const required = prop.required ? '✓ 必需' : '可选';
				this.streamMarkdown(`- \`${prop.name}\`: ${prop.type} - ${required}\n`, context);
			});
		}

		if (structure.state.length > 0) {
			this.streamMarkdown(`\n**State** (${structure.state.length}):\n`, context);
			structure.state.forEach(state => {
				this.streamMarkdown(`- \`${state.name}\`: ${state.type} = ${state.initialValue}\n`, context);
			});
		}

		this.streamMarkdown(`\n**样式方案**: ${structure.styling.approach}\n`, context);

		if (structure.interactions.length > 0) {
			this.streamMarkdown(`\n**交互** (${structure.interactions.length}):\n`, context);
			structure.interactions.forEach(interaction => {
				this.streamMarkdown(`- ${interaction.event}: ${interaction.description}\n`, context);
			});
		}

		this.streamMarkdown(`\n`, context);
	}
}
