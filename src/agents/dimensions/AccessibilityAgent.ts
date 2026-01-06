import { BaseAgent } from '../base/BaseAgent';
import { AgentInput, AgentOutput } from '../base/types';
import { Difference } from './configs/dimensionConfigs';

/**
 * 可访问性 Agent (LLM 驱动)
 * 检查 WCAG 标准、颜色对比度、ARIA 属性等
 */
export class AccessibilityAgent extends BaseAgent {
	name = 'accessibility';
	description = 'Check accessibility compliance using LLM';
	executionMode: 'llm' | 'tool' = 'llm';

	async execute(input: AgentInput): Promise<AgentOutput> {
		try {
			const { figmaData, codeData, designSystemGuide } = input.data;

			this.streamProgress('Analyzing accessibility compliance...', input.context);

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
					dimension: 'accessibility',
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
		return `You are analyzing accessibility compliance between Figma design and code implementation.

# Design System Guide
${designSystemGuide}

# Figma Design
Component: ${figmaData.componentName || 'Unknown'}
Type: ${figmaData.type || 'Unknown'}

Color Information:
${this.extractColorInfo(figmaData)}

Text Information:
${this.extractTextInfo(figmaData)}

Interactive Elements:
${this.extractInteractiveElements(figmaData)}

# Code Implementation
${codeData.componentCode || 'No code provided'}

# Task
Identify accessibility issues. Focus on WCAG 2.1 Level AA compliance:

1. **Color Contrast** (WCAG 1.4.3):
   - Text contrast ratio should be at least 4.5:1 for normal text
   - Large text (18pt+) should be at least 3:1
   - Example: Light gray text on white background may fail

2. **Interactive Elements** (WCAG 2.1.1, 2.4.7):
   - Buttons and links need proper labels
   - Focus states must be visible
   - Example: Missing aria-label on icon button

3. **Semantic HTML** (WCAG 1.3.1):
   - Use proper heading hierarchy (h1, h2, h3)
   - Use semantic elements (button, nav, main, etc.)
   - Example: Using <div onClick> instead of <button>

4. **Alternative Text** (WCAG 1.1.1):
   - Images need alt text
   - Decorative images should have alt=""
   - Example: <img> missing alt attribute

5. **Keyboard Navigation** (WCAG 2.1.1):
   - All interactive elements should be keyboard accessible
   - Proper tab order
   - Example: Custom component missing tabIndex

6. **ARIA Attributes** (WCAG 4.1.2):
   - Proper ARIA roles and labels
   - aria-hidden for decorative content
   - Example: Modal missing role="dialog"

7. **Form Labels** (WCAG 3.3.2):
   - All form inputs need associated labels
   - Example: Input without <label> or aria-label

# Output Format
Return a JSON array of accessibility issues:

[
  {
    "category": "accessibility",
    "severity": "critical" | "minor",
    "property": "color-contrast",
    "figmaValue": "Text: #666 on Background: #FFF (3.5:1 ratio)",
    "codeValue": "Same contrast issue in code",
    "fix": "Change text color to #595959 or darker (4.5:1 minimum)",
    "wcagCriterion": "1.4.3 Contrast (Minimum)"
  }
]

IMPORTANT:
- Severity: "critical" for WCAG Level A/AA failures, "minor" for AAA or best practices
- Include WCAG criterion reference if applicable
- Provide actionable fixes
- If code is accessible, return []

Return ONLY the JSON array, no additional text.`;
	}

	/**
	 * 提取颜色信息
	 */
	private extractColorInfo(figmaData: any): string {
		const info: string[] = [];

		if (figmaData.fills) {
			figmaData.fills.forEach((fill: any, index: number) => {
				if (fill.type === 'SOLID' && fill.color) {
					const hex = this.rgbaToHex(fill.color);
					info.push(`- Fill ${index}: ${hex}`);
				}
			});
		}

		if (figmaData.strokes) {
			figmaData.strokes.forEach((stroke: any, index: number) => {
				if (stroke.type === 'SOLID' && stroke.color) {
					const hex = this.rgbaToHex(stroke.color);
					info.push(`- Stroke ${index}: ${hex}`);
				}
			});
		}

		return info.length > 0 ? info.join('\n') : 'No color information';
	}

	/**
	 * 提取文字信息
	 */
	private extractTextInfo(figmaData: any): string {
		if (!figmaData.style && !figmaData.characters) {
			return 'No text content';
		}

		const info: string[] = [];

		if (figmaData.characters) {
			info.push(`- Text Content: "${figmaData.characters}"`);
		}

		if (figmaData.style) {
			const style = figmaData.style;
			if (style.fontSize) {
				info.push(`- Font Size: ${style.fontSize}px ${style.fontSize >= 18 ? '(Large text)' : '(Normal text)'}`);
			}
			if (style.fontWeight) {
				info.push(`- Font Weight: ${style.fontWeight}`);
			}
		}

		return info.length > 0 ? info.join('\n') : 'No text information';
	}

	/**
	 * 提取交互元素信息
	 */
	private extractInteractiveElements(figmaData: any): string {
		const info: string[] = [];

		// 检查节点类型
		if (figmaData.type === 'FRAME' || figmaData.type === 'COMPONENT') {
			// 检查是否是按钮
			if (figmaData.name && /button|btn|cta/i.test(figmaData.name)) {
				info.push(`- Detected Button: "${figmaData.name}"`);
			}

			// 检查是否是输入框
			if (figmaData.name && /input|field|textbox/i.test(figmaData.name)) {
				info.push(`- Detected Input Field: "${figmaData.name}"`);
			}

			// 检查是否是链接
			if (figmaData.name && /link|anchor/i.test(figmaData.name)) {
				info.push(`- Detected Link: "${figmaData.name}"`);
			}
		}

		// 检查子元素
		if (figmaData.children && figmaData.children.length > 0) {
			const childInfo = figmaData.children.map((child: any) => {
				if (child.name && /button|input|link/i.test(child.name)) {
					return `  - ${child.type}: "${child.name}"`;
				}
				return null;
			}).filter(Boolean);

			if (childInfo.length > 0) {
				info.push('- Child Interactive Elements:');
				info.push(...childInfo);
			}
		}

		return info.length > 0 ? info.join('\n') : 'No interactive elements detected';
	}

	/**
	 * 计算匹配率
	 */
	private calculateMatchRate(differences: Difference[]): number {
		// 可访问性检查约 7 个检查点
		const totalChecks = 7;
		const criticalWeight = 1.0;
		const minorWeight = 0.2;

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
