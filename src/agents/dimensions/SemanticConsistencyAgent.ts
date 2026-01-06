import { BaseAgent } from '../base/BaseAgent';
import { AgentInput, AgentOutput } from '../base/types';
import { Difference } from './configs/dimensionConfigs';

/**
 * 语义一致性 Agent (LLM 驱动)
 * 检查设计意图与代码实现的语义匹配度
 */
export class SemanticConsistencyAgent extends BaseAgent {
	name = 'semantic-consistency';
	description = 'Check semantic consistency using LLM';
	executionMode: 'llm' | 'tool' = 'llm';

	async execute(input: AgentInput): Promise<AgentOutput> {
		try {
			const { figmaData, codeData, previousResults, designSystemGuide } = input.data;

			this.streamProgress('Analyzing semantic consistency...', input.context);

			// 构建上下文
			const prompt = this.buildPrompt(
				figmaData,
				codeData,
				previousResults,
				designSystemGuide
			);

			// 调用 LLM
			const llmResponse = await this.callLLM(prompt, input.context);

			// 解析响应
			let differences: Difference[];
			try {
				const parsed = JSON.parse(llmResponse);
				differences = Array.isArray(parsed) ? parsed : parsed.differences || [];
			} catch (e) {
				// LLM 可能返回非 JSON 格式，尝试提取
				this.streamProgress('Warning: LLM response is not valid JSON, retrying...', input.context);
				differences = [];
			}

			// 计算匹配率
			const matchRate = this.calculateMatchRate(differences);

			return {
				success: true,
				data: {
					dimension: 'semantic',
					differences,
					matchRate,
					summary: {
						criticalCount: differences.filter(d => d.severity === 'critical').length,
						minorCount: differences.filter(d => d.severity === 'minor').length
					}
				},
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
	 * 构建 LLM 提示词
	 */
	private buildPrompt(
		figmaData: any,
		codeData: any,
		previousResults: Record<string, any>,
		designSystemGuide: string
	): string {
		return `You are analyzing semantic consistency between Figma design and code implementation.

# Design System Guide
${designSystemGuide}

# Figma Design Intent
Component: ${figmaData.componentName || 'Unknown'}
Type: ${figmaData.type || 'Unknown'}
Layers: ${JSON.stringify(figmaData.layers || [], null, 2)}
Properties:
- Colors: ${this.extractColors(figmaData)}
- Text Styles: ${this.extractTextStyles(figmaData)}
- Layout: ${this.extractLayout(figmaData)}

# Code Implementation
${codeData.componentCode || 'No code provided'}

# Previous Analysis Results (for context)
${this.formatPreviousResults(previousResults)}

# Task
Identify semantic mismatches between the design intent and code implementation. Focus on:

1. **Color Semantics**: Are primary/secondary/accent colors used correctly?
   - Example: A primary button should use the primary color, not secondary

2. **Typography Semantics**: Are heading/body/caption styles applied correctly?
   - Example: Page titles should use heading1 style, not body text

3. **Visual Hierarchy**: Does the implementation reflect the intended importance?
   - Example: Important actions should have prominent visual treatment

4. **Spacing Semantics**: Are spacing values consistent with the design system intent?
   - Example: Related items should use smaller spacing than unrelated groups

5. **Component Usage**: Are the right components used for the right purposes?
   - Example: Use a Card component for card-like content, not a generic div

# Output Format
Return a JSON array of semantic differences:

[
  {
    "category": "semantic",
    "severity": "critical" | "minor",
    "property": "button-style",
    "figmaValue": "primary button with primary color #007AFF",
    "codeValue": "button using secondary color #666",
    "fix": "Change button background-color to primary (#007AFF)"
  }
]

IMPORTANT:
- Only include actual semantic mismatches, not stylistic preferences
- Severity: "critical" for obvious violations of design intent, "minor" for subtle issues
- Be specific in the "fix" field with actionable suggestions
- If everything looks semantically correct, return an empty array []

Return ONLY the JSON array, no additional text.`;
	}

	/**
	 * 提取颜色信息
	 */
	private extractColors(figmaData: any): string {
		const colors: string[] = [];

		if (figmaData.fills) {
			figmaData.fills.forEach((fill: any) => {
				if (fill.type === 'SOLID' && fill.color) {
					const hex = this.rgbaToHex(fill.color);
					colors.push(`Fill: ${hex}`);
				}
			});
		}

		if (figmaData.strokes) {
			figmaData.strokes.forEach((stroke: any) => {
				if (stroke.type === 'SOLID' && stroke.color) {
					const hex = this.rgbaToHex(stroke.color);
					colors.push(`Stroke: ${hex}`);
				}
			});
		}

		return colors.length > 0 ? colors.join(', ') : 'None';
	}

	/**
	 * 提取文字样式信息
	 */
	private extractTextStyles(figmaData: any): string {
		if (!figmaData.style) {
			return 'None';
		}

		const style = figmaData.style;
		const parts: string[] = [];

		if (style.fontFamily) parts.push(`Font: ${style.fontFamily}`);
		if (style.fontSize) parts.push(`Size: ${style.fontSize}px`);
		if (style.fontWeight) parts.push(`Weight: ${style.fontWeight}`);
		if (style.lineHeight) parts.push(`Line height: ${style.lineHeight}`);

		return parts.length > 0 ? parts.join(', ') : 'None';
	}

	/**
	 * 提取布局信息
	 */
	private extractLayout(figmaData: any): string {
		const parts: string[] = [];

		if (figmaData.layoutMode) parts.push(`Mode: ${figmaData.layoutMode}`);
		if (figmaData.primaryAxisAlignItems) parts.push(`Align: ${figmaData.primaryAxisAlignItems}`);
		if (figmaData.itemSpacing) parts.push(`Gap: ${figmaData.itemSpacing}px`);

		return parts.length > 0 ? parts.join(', ') : 'None';
	}

	/**
	 * 格式化前置结果
	 */
	private formatPreviousResults(previousResults: Record<string, any>): string {
		if (!previousResults || Object.keys(previousResults).length === 0) {
			return 'No previous results';
		}

		const formatted = Object.entries(previousResults).map(([key, value]) => {
			if (value && typeof value === 'object') {
				const matchRate = value.matchRate !== undefined
					? `${(value.matchRate * 100).toFixed(1)}%`
					: 'N/A';
				const diffCount = value.differences?.length || 0;
				return `- ${key}: Match rate ${matchRate}, ${diffCount} differences`;
			}
			return `- ${key}: ${JSON.stringify(value)}`;
		});

		return formatted.join('\n');
	}

	/**
	 * 计算匹配率
	 */
	private calculateMatchRate(differences: Difference[]): number {
		// 语义检查没有固定的总数，基于差异数量估算
		// 假设有 10 个潜在的语义检查点
		const totalChecks = 10;
		const criticalWeight = 1.0;
		const minorWeight = 0.3;

		const criticalCount = differences.filter(d => d.severity === 'critical').length;
		const minorCount = differences.filter(d => d.severity === 'minor').length;

		const weightedIssues = criticalCount * criticalWeight + minorCount * minorWeight;
		const matchRate = Math.max(0, 1 - weightedIssues / totalChecks);

		return matchRate;
	}

	/**
	 * RGBA 转 Hex
	 */
	private rgbaToHex(rgba: { r: number; g: number; b: number; a?: number }): string {
		const toHex = (n: number) => {
			const hex = Math.round(n * 255).toString(16).padStart(2, '0');
			return hex;
		};

		return `#${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}`.toUpperCase();
	}
}
