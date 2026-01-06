import { BaseAgent } from '../base/BaseAgent';
import { AgentInput, AgentOutput } from '../base/types';
import { ComponentStructure } from './ComponentAnalyzerAgent';

/**
 * 代码脚手架结果
 */
export interface CodeScaffold {
	componentCode: string;
	styleCode: string;
	typeDefinitions: string;
	testCode?: string;
}

/**
 * 代码脚手架 Agent
 * 第二阶段：根据组件结构生成基础代码框架
 */
export class CodeScaffoldAgent extends BaseAgent {
	name = 'code-scaffold';
	description = 'Generate code scaffold from component structure';
	executionMode: 'llm' | 'tool' = 'llm';

	async execute(input: AgentInput): Promise<AgentOutput<CodeScaffold>> {
		try {
			const { componentStructure, designSystemGuide, targetFramework } = input.data;

			this.streamProgress('Generating code scaffold...', input.context);

			// 构建提示词
			const prompt = this.buildScaffoldPrompt(
				componentStructure,
				designSystemGuide,
				targetFramework
			);

			// 调用 LLM
			const llmResponse = await this.callLLM(prompt, input.context);

			// 解析响应
			const scaffold = this.parseCodeScaffold(llmResponse);

			// 显示生成的代码
			this.displayScaffold(scaffold, input.context);

			return {
				success: true,
				data: scaffold,
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
	 * 构建脚手架生成提示词
	 */
	private buildScaffoldPrompt(
		structure: ComponentStructure,
		designSystemGuide: string,
		targetFramework: string
	): string {
		const framework = targetFramework || 'React with TypeScript';
		console.log('[Helix] CodeScaffoldAgent.buildScaffoldPrompt - Using framework:', framework);

		// Framework-specific instructions
		const frameworkInstructions = this.getFrameworkSpecificInstructions(framework, structure);

		return `You are a ${framework} code generator. Based on the component structure plan, generate clean, production-ready code for ${framework}.

# Component Structure Plan

${JSON.stringify(structure, null, 2)}

# Design System Guide

${designSystemGuide}

# Target Framework

${framework}

# Your Task

Generate the following code files based on the component structure FOR ${framework}:

${frameworkInstructions}

# Output Format

Return a JSON object with this structure:

\`\`\`json
{
  "componentCode": "// Main component code for ${framework}",
  "styleCode": "// Styling code",
  "typeDefinitions": "// Type definitions (if applicable)",
  "testCode": "// Test code (optional)"
}
\`\`\`

# Important Guidelines

1. **Clean code**: Follow ${framework} best practices
2. **Design system alignment**: Use tokens from the design system guide
3. **Accessibility**: Include proper accessibility attributes
4. **Type safety**: Use proper type annotations (if applicable)
5. **Comments**: Add helpful comments for complex logic
6. **Modularity**: Keep code modular and reusable
7. **Performance**: Follow ${framework} performance best practices

# Code Quality Standards

- Use meaningful variable and function names
- Follow consistent code formatting
- Add proper validation
- Handle edge cases appropriately

Return ONLY the JSON object with escaped strings, no additional text.`;
	}

	/**
	 * Get framework-specific instructions
	 */
	private getFrameworkSpecificInstructions(framework: string, structure: ComponentStructure): string {
		const lowerFramework = framework.toLowerCase();

		if (lowerFramework.includes('swiftui')) {
			return `## 1. Component Code (SwiftUI View)
- Use SwiftUI View struct
- Implement all properties
- Use @State for local state, @Binding for passed state
- Add proper view modifiers
- Include accessibility modifiers

## 2. Style Code
- Use SwiftUI view modifiers for styling
- Implement responsive design with GeometryReader if needed
- Add animations with .animation() modifier if needed: ${structure.styling.hasAnimations}
- Use design system tokens as constants

## 3. Preview Provider
- Add PreviewProvider for Xcode previews
- Show different states/variants

Example output structure:
{
  "componentCode": "import SwiftUI\\n\\nstruct MyView: View {\\n  var body: some View { ... }\\n}",
  "styleCode": "// View modifiers and styling constants",
  "typeDefinitions": "// Custom types if needed",
  "testCode": "struct MyView_Previews: PreviewProvider { ... }"
}`;
		} else if (lowerFramework.includes('vue')) {
			return `## 1. Component Code (Vue 3 Component)
- Use Vue 3 Composition API with <script setup>
- Implement all props with defineProps
- Use ref/reactive for state
- Add proper event emitters
- Include ARIA attributes

## 2. Style Code
- Use <style scoped> for component styles
- Implement responsive design if needed: ${structure.styling.hasResponsive}
- Add CSS transitions/animations if needed: ${structure.styling.hasAnimations}
- Use design system tokens as CSS variables

## 3. Type Definitions
- Use TypeScript for prop types
- Export interfaces if needed

Example output structure:
{
  "componentCode": "<template>...</template>\\n<script setup lang=\\"ts\\">\\nimport { ref } from 'vue'\\n...</script>",
  "styleCode": "<style scoped>\\n...\\n</style>",
  "typeDefinitions": "interface Props { ... }",
  "testCode": "// Vue Test Utils test"
}`;
		} else if (lowerFramework.includes('angular')) {
			return `## 1. Component Code (Angular Component)
- Use Angular Component decorator
- Implement all @Input and @Output properties
- Use Angular lifecycle hooks
- Add proper template bindings
- Include ARIA attributes

## 2. Style Code
- Use component-scoped styles
- Implement responsive design if needed: ${structure.styling.hasResponsive}
- Add animations with Angular animations if needed: ${structure.styling.hasAnimations}
- Use design system tokens

## 3. Type Definitions
- Use TypeScript interfaces for data models
- Export component class

Example output structure:
{
  "componentCode": "@Component({ ... })\\nexport class MyComponent { ... }",
  "styleCode": "/* Component styles */",
  "typeDefinitions": "interface ComponentData { ... }",
  "testCode": "describe('MyComponent', () => { ... })"
}`;
		} else {
			// Default to React
			return `## 1. Component Code (React Component)
- Use React functional component with TypeScript
- Implement all props with proper types
- Implement all state with React hooks (useState, useEffect, etc.)
- Add proper event handlers
- Include ARIA attributes for accessibility
- Add helpful comments for complex logic

## 2. Style Code
- Use the recommended styling approach: ${structure.styling.approach}
- Implement responsive design if needed: ${structure.styling.hasResponsive}
- Add animations if needed: ${structure.styling.hasAnimations}
- Use design system tokens from the guide
- Follow BEM or other naming conventions

## 3. Type Definitions
- Export all prop types using TypeScript interfaces
- Export any custom types used
- Use proper TypeScript syntax

## 4. Basic Test
- Simple component rendering test with React Testing Library
- Props validation test

Example output structure:
{
  "componentCode": "import React from 'react';\\n\\ninterface Props { ... }\\n\\nexport const MyComponent: React.FC<Props> = ({ ... }) => { ... };",
  "styleCode": ".my-component { ... }",
  "typeDefinitions": "export interface Props { ... }",
  "testCode": "import { render } from '@testing-library/react'; ..."
}`;
		}
	}

	/**
	 * 解析代码脚手架
	 */
	private parseCodeScaffold(llmResponse: string): CodeScaffold {
		try {
			// 移除可能的 markdown 代码块标记
			let cleanedResponse = llmResponse.trim();

			if (cleanedResponse.startsWith('```')) {
				cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*\n?/, '');
				cleanedResponse = cleanedResponse.replace(/\n?```\s*$/, '');
			}

			const parsed = JSON.parse(cleanedResponse);

			// 验证必需字段
			if (!parsed.componentCode) {
				throw new Error('Invalid code scaffold: missing componentCode');
			}

			return parsed as CodeScaffold;
		} catch (error: any) {
			throw new Error(`Failed to parse code scaffold: ${error.message}\n\nLLM Response:\n${llmResponse}`);
		}
	}

	/**
	 * 显示代码脚手架
	 */
	private displayScaffold(scaffold: CodeScaffold, context: any): void {
		this.streamMarkdown(`\n## 🏗️ 代码脚手架\n\n`, context);

		// 显示组件代码
		this.streamMarkdown(`### 组件代码\n\n`, context);
		this.streamMarkdown(`\`\`\`tsx\n${scaffold.componentCode}\n\`\`\`\n\n`, context);

		// 显示样式代码
		if (scaffold.styleCode) {
			this.streamMarkdown(`### 样式代码\n\n`, context);
			const ext = this.getStyleExtension(scaffold.styleCode);
			this.streamMarkdown(`\`\`\`${ext}\n${scaffold.styleCode}\n\`\`\`\n\n`, context);
		}

		// 显示类型定义
		if (scaffold.typeDefinitions) {
			this.streamMarkdown(`### 类型定义\n\n`, context);
			this.streamMarkdown(`\`\`\`typescript\n${scaffold.typeDefinitions}\n\`\`\`\n\n`, context);
		}
	}

	/**
	 * 获取样式文件扩展名
	 */
	private getStyleExtension(styleCode: string): string {
		if (styleCode.includes('styled-components') || styleCode.includes('styled.')) {
			return 'typescript';
		} else if (styleCode.includes('@apply') || styleCode.includes('tailwind')) {
			return 'css';
		} else if (styleCode.includes('$')) {
			return 'scss';
		}
		return 'css';
	}
}
