import { BaseAgent } from '../base/BaseAgent';
import { AgentInput, AgentOutput } from '../base/types';
import { CodeScaffold } from './CodeScaffoldAgent';

/**
 * 样式细化结果
 */
export interface RefinedCode {
	componentCode: string;
	styleCode: string;
	improvements: string[];
}

/**
 * 样式细化 Agent
 * 第三阶段：根据 Figma 设计细化样式和交互细节
 */
export class StyleRefinerAgent extends BaseAgent {
	name = 'style-refiner';
	description = 'Refine styles and interactions based on Figma design';
	executionMode: 'llm' | 'tool' = 'llm';

	async execute(input: AgentInput): Promise<AgentOutput<RefinedCode>> {
		try {
			const { scaffold, figmaData, designSystemGuide, targetFramework } = input.data;

			console.log('[Helix] StyleRefinerAgent - Received targetFramework:', targetFramework);

			this.streamProgress('Refining styles and interactions...', input.context);

			// 构建提示词
			const prompt = this.buildRefinePrompt(scaffold, figmaData, designSystemGuide, targetFramework);

			// 调用 LLM
			const llmResponse = await this.callLLM(prompt, input.context);

			// 解析响应
			const refined = this.parseRefinedCode(llmResponse);

			// 显示改进点
			this.displayRefinements(refined, input.context);

			return {
				success: true,
				data: refined,
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
	 * 构建细化提示词
	 */
	private buildRefinePrompt(
		scaffold: CodeScaffold,
		figmaData: any,
		designSystemGuide: string,
		targetFramework: string
	): string {
		const framework = targetFramework || 'React with TypeScript';
		console.log('[Helix] StyleRefinerAgent.buildRefinePrompt - Using framework:', framework);

		return `You are a ${framework} styling expert. Refine the generated code to match the Figma design pixel-perfectly for ${framework}.

# Current Code Scaffold

## Component Code
\`\`\`tsx
${scaffold.componentCode}
\`\`\`

## Style Code
\`\`\`css
${scaffold.styleCode}
\`\`\`

# Figma Design Details

${JSON.stringify(figmaData, null, 2)}

# Design System Guide

${designSystemGuide}

# Your Task

Refine the code to match the Figma design exactly. Focus on:

## 1. Visual Styling
- **Colors**: Match exact color values from Figma
- **Typography**: Match font family, size, weight, line height
- **Spacing**: Match padding, margin, gaps exactly
- **Borders**: Match border width, color, radius
- **Shadows**: Match box shadows precisely
- **Layout**: Match flexbox/grid properties

## 2. Responsive Design
- Add media queries if the design has responsive variants
- Ensure mobile, tablet, desktop breakpoints
- Use design system breakpoint tokens

## 3. Interactions and Animations
- Add hover states if present in Figma
- Add focus states for accessibility
- Add active/pressed states
- Add smooth transitions
- Implement any animations shown in Figma

## 4. Pixel-Perfect Details
- Match exact dimensions (width, height)
- Match exact positioning
- Match icon sizes and spacing
- Match text alignment and truncation

## 5. Design System Tokens
- Replace hardcoded values with design system tokens where possible
- Use color tokens (e.g., \`var(--color-primary)\`)
- Use spacing tokens (e.g., \`var(--spacing-md)\`)
- Use typography tokens

# Output Format

Return a JSON object:

\`\`\`json
{
  "componentCode": "refined component code...",
  "styleCode": "refined style code...",
  "improvements": [
    "Added hover state with smooth transition",
    "Matched exact border-radius from Figma (8px)",
    "Replaced hardcoded colors with design system tokens",
    "Added responsive breakpoints for mobile/tablet"
  ]
}
\`\`\`

# Important Guidelines

1. **Precision**: Match Figma design exactly, down to the pixel
2. **Design tokens**: Use design system tokens, not hardcoded values
3. **Accessibility**: Maintain or improve accessibility features
4. **Performance**: Optimize CSS, avoid unnecessary rules
5. **Modern CSS**: Use modern CSS features (custom properties, grid, etc.)
6. **Cross-browser**: Ensure compatibility

Return ONLY the JSON object, no additional text.`;
	}

	/**
	 * 解析细化后的代码
	 */
	private parseRefinedCode(llmResponse: string): RefinedCode {
		try {
			// 移除可能的 markdown 代码块标记
			let cleanedResponse = llmResponse.trim();

			if (cleanedResponse.startsWith('```')) {
				cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*\n?/, '');
				cleanedResponse = cleanedResponse.replace(/\n?```\s*$/, '');
			}

			const parsed = JSON.parse(cleanedResponse);

			// 验证必需字段
			if (!parsed.componentCode || !parsed.styleCode) {
				throw new Error('Invalid refined code: missing required fields');
			}

			return parsed as RefinedCode;
		} catch (error: any) {
			throw new Error(`Failed to parse refined code: ${error.message}\n\nLLM Response:\n${llmResponse}`);
		}
	}

	/**
	 * 显示改进点
	 */
	private displayRefinements(refined: RefinedCode, context: any): void {
		this.streamMarkdown(`\n## ✨ 样式细化完成\n\n`, context);

		if (refined.improvements && refined.improvements.length > 0) {
			this.streamMarkdown(`**改进点** (${refined.improvements.length}):\n`, context);
			refined.improvements.forEach(improvement => {
				this.streamMarkdown(`- ✓ ${improvement}\n`, context);
			});
			this.streamMarkdown(`\n`, context);
		}

		// 显示细化后的代码
		this.streamMarkdown(`### 细化后的组件代码\n\n`, context);
		this.streamMarkdown(`\`\`\`tsx\n${refined.componentCode}\n\`\`\`\n\n`, context);

		this.streamMarkdown(`### 细化后的样式代码\n\n`, context);
		this.streamMarkdown(`\`\`\`css\n${refined.styleCode}\n\`\`\`\n\n`, context);
	}
}
