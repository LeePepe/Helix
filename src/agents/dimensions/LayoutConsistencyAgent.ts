import { BaseAgent } from '../base/BaseAgent';
import { AgentInput, AgentOutput } from '../base/types';
import { Difference } from './configs/dimensionConfigs';

/**
 * 布局一致性 Agent (LLM 驱动)
 * 检查布局结构、对齐方式、响应式设计等
 */
export class LayoutConsistencyAgent extends BaseAgent {
	name = 'layout-consistency';
	description = 'Check layout consistency using LLM';
	executionMode: 'llm' | 'tool' = 'llm';

	async execute(input: AgentInput): Promise<AgentOutput> {
		try {
			const { figmaData, codeData, designSystemGuide } = input.data;

			this.streamProgress('Analyzing layout consistency...', input.context);

			// 构建提示词
			const prompt = this.buildPrompt(figmaData, codeData, designSystemGuide);

			// 调用 LLM
			const llmResponse = await this.callLLM(prompt, input.context);

			// 解析响应
			let differences: Difference[];
			try {
				const parsed = JSON.parse(llmResponse);
				differences = Array.isArray(parsed) ? parsed : parsed.differences || [];
			} catch (e) {
				this.streamProgress('Warning: LLM response is not valid JSON', input.context);
				differences = [];
			}

			// 计算匹配率
			const matchRate = this.calculateMatchRate(differences);

			return {
				success: true,
				data: {
					dimension: 'layout',
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
		designSystemGuide: string
	): string {
		return `You are analyzing layout consistency between Figma design and code implementation.

# Design System Guide
${designSystemGuide}

# Figma Layout Design
Component: ${figmaData.componentName || 'Unknown'}
Layout Mode: ${figmaData.layoutMode || 'None'}
Layout Properties:
${this.extractLayoutProperties(figmaData)}

Children Structure:
${this.extractChildrenStructure(figmaData)}

# Code Implementation
${codeData.componentCode || 'No code provided'}

# Task
Identify layout mismatches between the design and code. Focus on:

1. **Flexbox/Grid Layout**:
   - Is the layout direction correct (row vs column)?
   - Are items aligned and justified correctly?
   - Example: Figma has horizontal layout, but code uses vertical

2. **Layout Structure**:
   - Do the nested components match the design hierarchy?
   - Are container/wrapper elements used correctly?
   - Example: Missing a wrapper div that groups related items

3. **Spacing and Gaps**:
   - Are gaps between items correct?
   - Are padding/margins applied to the right elements?
   - Example: Items should have 16px gap but code has 8px

4. **Responsive Behavior**:
   - Does the layout handle different screen sizes as intended?
   - Are flex-wrap, grid-template-columns set correctly?
   - Example: Should wrap on mobile but code has nowrap

5. **Z-index and Stacking**:
   - Are elements layered in the correct order?
   - Is absolute/relative positioning used correctly?
   - Example: Overlay should be on top but has lower z-index

# Output Format
Return a JSON array of layout differences:

[
  {
    "category": "layout",
    "severity": "critical" | "minor",
    "property": "flex-direction",
    "figmaValue": "horizontal layout (row)",
    "codeValue": "flex-direction: column",
    "fix": "Change flex-direction from column to row"
  }
]

IMPORTANT:
- Focus on structural layout issues, not styling details
- Severity: "critical" for major structural mismatches, "minor" for alignment tweaks
- Be specific about which element needs to be changed
- If layout matches the design, return []

Return ONLY the JSON array, no additional text.`;
	}

	/**
	 * 提取布局属性
	 */
	private extractLayoutProperties(figmaData: any): string {
		const props: string[] = [];

		if (figmaData.layoutMode) {
			props.push(`- Layout Mode: ${figmaData.layoutMode} (${this.translateLayoutMode(figmaData.layoutMode)})`);
		}

		if (figmaData.primaryAxisAlignItems) {
			props.push(`- Primary Axis Alignment: ${figmaData.primaryAxisAlignItems}`);
		}

		if (figmaData.counterAxisAlignItems) {
			props.push(`- Counter Axis Alignment: ${figmaData.counterAxisAlignItems}`);
		}

		if (figmaData.itemSpacing !== undefined) {
			props.push(`- Item Spacing (gap): ${figmaData.itemSpacing}px`);
		}

		if (figmaData.paddingLeft !== undefined || figmaData.paddingTop !== undefined) {
			props.push(`- Padding: ${figmaData.paddingTop || 0}px ${figmaData.paddingRight || 0}px ${figmaData.paddingBottom || 0}px ${figmaData.paddingLeft || 0}px`);
		}

		if (figmaData.layoutWrap) {
			props.push(`- Layout Wrap: ${figmaData.layoutWrap}`);
		}

		return props.length > 0 ? props.join('\n') : 'No layout properties';
	}

	/**
	 * 翻译 Figma 布局模式为 CSS
	 */
	private translateLayoutMode(mode: string): string {
		const translations: Record<string, string> = {
			'HORIZONTAL': 'flex-direction: row',
			'VERTICAL': 'flex-direction: column',
			'NONE': 'position: relative or absolute'
		};

		return translations[mode] || mode;
	}

	/**
	 * 提取子元素结构
	 */
	private extractChildrenStructure(figmaData: any): string {
		if (!figmaData.children || figmaData.children.length === 0) {
			return 'No children';
		}

		const formatNode = (node: any, depth: number = 0): string => {
			const indent = '  '.repeat(depth);
			const name = node.name || 'Unnamed';
			const type = node.type || 'Unknown';
			const info: string[] = [];

			if (node.layoutMode) {
				info.push(`layout: ${node.layoutMode}`);
			}

			if (node.children && node.children.length > 0) {
				info.push(`${node.children.length} children`);
			}

			const infoStr = info.length > 0 ? ` (${info.join(', ')})` : '';

			let result = `${indent}- ${name} [${type}]${infoStr}`;

			if (node.children && node.children.length > 0 && depth < 2) {
				const childrenStr = node.children.map((child: any) =>
					formatNode(child, depth + 1)
				).join('\n');
				result += '\n' + childrenStr;
			}

			return result;
		};

		return figmaData.children.map((child: any) => formatNode(child, 0)).join('\n');
	}

	/**
	 * 计算匹配率
	 */
	private calculateMatchRate(differences: Difference[]): number {
		// 布局检查约 8 个检查点
		const totalChecks = 8;
		const criticalWeight = 1.0;
		const minorWeight = 0.3;

		const criticalCount = differences.filter(d => d.severity === 'critical').length;
		const minorCount = differences.filter(d => d.severity === 'minor').length;

		const weightedIssues = criticalCount * criticalWeight + minorCount * minorWeight;
		const matchRate = Math.max(0, 1 - weightedIssues / totalChecks);

		return matchRate;
	}
}
