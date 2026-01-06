import { BaseAgent } from '../base/BaseAgent';
import { AgentInput, AgentOutput } from '../base/types';
import { RefinedCode } from './StyleRefinerAgent';

/**
 * 优化后的代码
 */
export interface OptimizedCode {
	componentCode: string;
	styleCode: string;
	testCode?: string;
	optimizations: OptimizationItem[];
	qualityScore: {
		accessibility: number;
		performance: number;
		maintainability: number;
		overall: number;
	};
}

export interface OptimizationItem {
	category: 'performance' | 'accessibility' | 'best-practices' | 'maintainability';
	description: string;
	applied: boolean;
}

/**
 * 代码优化 Agent
 * 第四阶段：优化代码性能、可访问性和最佳实践
 */
export class CodeOptimizerAgent extends BaseAgent {
	name = 'code-optimizer';
	description = 'Optimize code for performance, accessibility, and best practices';
	executionMode: 'llm' | 'tool' = 'llm';

	async execute(input: AgentInput): Promise<AgentOutput<OptimizedCode>> {
		try {
			const { refinedCode, designSystemGuide, targetFramework } = input.data;

			console.log('[Helix] CodeOptimizerAgent - Received targetFramework:', targetFramework);

			this.streamProgress('Optimizing code...', input.context);

			// 构建提示词
			const prompt = this.buildOptimizePrompt(refinedCode, designSystemGuide, targetFramework);

			// 调用 LLM
			const llmResponse = await this.callLLM(prompt, input.context);

			// 解析响应
			const optimized = this.parseOptimizedCode(llmResponse);

			// 显示优化结果
			this.displayOptimizations(optimized, input.context);

			return {
				success: true,
				data: optimized,
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
	 * 构建优化提示词
	 */
	private buildOptimizePrompt(
		refinedCode: RefinedCode,
		designSystemGuide: string,
		targetFramework: string
	): string {
		const framework = targetFramework || 'React with TypeScript';
		console.log('[Helix] CodeOptimizerAgent.buildOptimizePrompt - Using framework:', framework);

		return `You are a ${framework} optimization expert. Review and optimize the code for production readiness.

# Current Code

## Component Code
\`\`\`tsx
${refinedCode.componentCode}
\`\`\`

## Style Code
\`\`\`css
${refinedCode.styleCode}
\`\`\`

# Design System Guide

${designSystemGuide}

# Your Task

Optimize the code across four dimensions:

## 1. Performance Optimization
- Add React.memo where appropriate
- Use useCallback for event handlers
- Use useMemo for expensive computations
- Lazy load heavy components
- Optimize re-renders
- Reduce bundle size
- Use CSS containment

## 2. Accessibility (WCAG 2.1 Level AA)
- Add proper ARIA attributes
- Ensure keyboard navigation works
- Add focus management
- Ensure proper heading hierarchy
- Add alt text for images
- Ensure color contrast meets standards
- Add screen reader support

## 3. Best Practices
- Follow React best practices
- Use proper error boundaries
- Add PropTypes or TypeScript validation
- Handle edge cases
- Add helpful comments
- Use consistent naming conventions
- Follow design system patterns

## 4. Maintainability
- Extract reusable logic into hooks
- Break down large components
- Add JSDoc comments
- Use meaningful variable names
- Add comprehensive test coverage
- Document complex logic

# Output Format

Return a JSON object:

\`\`\`json
{
  "componentCode": "optimized component code...",
  "styleCode": "optimized style code...",
  "testCode": "comprehensive test code...",
  "optimizations": [
    {
      "category": "performance",
      "description": "Added React.memo to prevent unnecessary re-renders",
      "applied": true
    },
    {
      "category": "accessibility",
      "description": "Added aria-label and keyboard navigation support",
      "applied": true
    }
  ],
  "qualityScore": {
    "accessibility": 95,
    "performance": 88,
    "maintainability": 92,
    "overall": 92
  }
}
\`\`\`

# Quality Scoring Guidelines

- **Accessibility (0-100)**: WCAG compliance, keyboard nav, screen reader support
- **Performance (0-100)**: Render optimization, bundle size, load time
- **Maintainability (0-100)**: Code clarity, documentation, testability
- **Overall (0-100)**: Average of the three scores

# Important Guidelines

1. **Don't over-optimize**: Only optimize where it matters
2. **Preserve functionality**: Don't break existing features
3. **Keep it simple**: Don't add unnecessary complexity
4. **Test coverage**: Add meaningful tests
5. **Documentation**: Add helpful comments
6. **Accessibility first**: Never sacrifice accessibility for aesthetics

Return ONLY the JSON object, no additional text.`;
	}

	/**
	 * 解析优化后的代码
	 */
	private parseOptimizedCode(llmResponse: string): OptimizedCode {
		try {
			// 移除可能的 markdown 代码块标记
			let cleanedResponse = llmResponse.trim();

			if (cleanedResponse.startsWith('```')) {
				cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*\n?/, '');
				cleanedResponse = cleanedResponse.replace(/\n?```\s*$/, '');
			}

			const parsed = JSON.parse(cleanedResponse);

			// 验证必需字段
			if (!parsed.componentCode || !parsed.optimizations || !parsed.qualityScore) {
				throw new Error('Invalid optimized code: missing required fields');
			}

			return parsed as OptimizedCode;
		} catch (error: any) {
			throw new Error(`Failed to parse optimized code: ${error.message}\n\nLLM Response:\n${llmResponse}`);
		}
	}

	/**
	 * 显示优化结果
	 */
	private displayOptimizations(optimized: OptimizedCode, context: any): void {
		this.streamMarkdown(`\n## 🚀 代码优化完成\n\n`, context);

		// 显示质量评分
		this.streamMarkdown(`### 质量评分\n\n`, context);
		const scores = optimized.qualityScore;
		this.streamMarkdown(`- 🎯 **整体得分**: ${scores.overall}/100\n`, context);
		this.streamMarkdown(`- ♿ **可访问性**: ${scores.accessibility}/100\n`, context);
		this.streamMarkdown(`- ⚡ **性能**: ${scores.performance}/100\n`, context);
		this.streamMarkdown(`- 🛠️ **可维护性**: ${scores.maintainability}/100\n`, context);
		this.streamMarkdown(`\n`, context);

		// 显示优化项
		if (optimized.optimizations && optimized.optimizations.length > 0) {
			this.streamMarkdown(`### 应用的优化 (${optimized.optimizations.length})\n\n`, context);

			const byCategory = this.groupOptimizationsByCategory(optimized.optimizations);

			Object.entries(byCategory).forEach(([category, items]) => {
				const icon = this.getCategoryIcon(category);
				this.streamMarkdown(`**${icon} ${this.formatCategory(category)}**:\n`, context);
				items.forEach(item => {
					const status = item.applied ? '✓' : '○';
					this.streamMarkdown(`- ${status} ${item.description}\n`, context);
				});
				this.streamMarkdown(`\n`, context);
			});
		}

		// 显示最终代码
		this.streamMarkdown(`### 最终优化代码\n\n`, context);
		this.streamMarkdown(`\`\`\`tsx\n${optimized.componentCode}\n\`\`\`\n\n`, context);

		if (optimized.styleCode) {
			this.streamMarkdown(`### 最终样式代码\n\n`, context);
			this.streamMarkdown(`\`\`\`css\n${optimized.styleCode}\n\`\`\`\n\n`, context);
		}

		if (optimized.testCode) {
			this.streamMarkdown(`### 测试代码\n\n`, context);
			this.streamMarkdown(`\`\`\`tsx\n${optimized.testCode}\n\`\`\`\n\n`, context);
		}
	}

	/**
	 * 按类别分组优化项
	 */
	private groupOptimizationsByCategory(
		optimizations: OptimizationItem[]
	): Record<string, OptimizationItem[]> {
		const grouped: Record<string, OptimizationItem[]> = {};

		for (const item of optimizations) {
			if (!grouped[item.category]) {
				grouped[item.category] = [];
			}
			grouped[item.category].push(item);
		}

		return grouped;
	}

	/**
	 * 获取类别图标
	 */
	private getCategoryIcon(category: string): string {
		const icons: Record<string, string> = {
			'performance': '⚡',
			'accessibility': '♿',
			'best-practices': '✨',
			'maintainability': '🛠️'
		};

		return icons[category] || '📌';
	}

	/**
	 * 格式化类别名称
	 */
	private formatCategory(category: string): string {
		const names: Record<string, string> = {
			'performance': '性能优化',
			'accessibility': '可访问性',
			'best-practices': '最佳实践',
			'maintainability': '可维护性'
		};

		return names[category] || category;
	}
}
