import { BaseAgent } from '../base/BaseAgent';
import { AgentInput, AgentOutput } from '../base/types';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 设计系统 Agent
 * 加载项目中的 design-system-guide.md 文档
 * 该文档作为设计规范的"真理来源"，用于指导代码生成和一致性检查
 */
export class DesignSystemAgent extends BaseAgent {
	name = 'design-system';
	description = 'Load design system guide from project';
	executionMode: 'tool' | 'llm' = 'tool';

	async execute(input: AgentInput): Promise<AgentOutput<string>> {
		try {
			this.streamProgress('Loading design system guide...', input.context);

			// 加载设计系统文档
			const designSystemGuide = await this.loadDesignSystemGuide(input.context);

			// 验证设计系统
			this.validateDesignSystem(designSystemGuide);

			this.streamMarkdown(`✅ Design system guide loaded successfully\n\n`, input.context);

			return {
				success: true,
				data: designSystemGuide,
				metadata: {
					executionMode: 'tool',
					agentName: this.name
				}
			};
		} catch (error: any) {
			return this.handleError(error);
		}
	}

	/**
	 * 加载设计系统指南
	 */
	private async loadDesignSystemGuide(context: any): Promise<string> {
		const workspaceRoot = context.workspaceRoot;

		if (!workspaceRoot) {
			throw new Error('No workspace folder open');
		}

		// 尝试多个可能的路径
		const possiblePaths = [
			path.join(workspaceRoot, '.github', 'design-system-guide.md'), // 优先检查 .github 目录（推荐位置）
			path.join(workspaceRoot, 'design-system-guide.md'),
			path.join(workspaceRoot, 'docs', 'design-system-guide.md'),
			path.join(workspaceRoot, '.helix', 'design-system-guide.md')
		];

		for (const filePath of possiblePaths) {
			if (fs.existsSync(filePath)) {
				const content = fs.readFileSync(filePath, 'utf8');
				console.log(`[Helix][DesignSystemAgent] Loaded design system from: ${filePath}`);
				return content;
			}
		}

		throw new Error(
			'❌ Design system guide not found!\n\n' +
			'Please ensure `design-system-guide.md` exists in your project.\n' +
			'Run the initialization flow first to create one.\n\n' +
			'Expected locations (checked in order):\n' +
			'- .github/design-system-guide.md (recommended)\n' +
			'- design-system-guide.md\n' +
			'- docs/design-system-guide.md\n' +
			'- .helix/design-system-guide.md'
		);
	}

	/**
	 * 验证设计系统
	 */
	private validateDesignSystem(designSystem: string): void {
		// 检查是否包含 JSON tokens
		if (!designSystem.includes('```json')) {
			console.warn('[DesignSystemAgent] Warning: Design system does not include JSON tokens section');
		}

		// 检查是否包含主要部分
		const requiredSections = ['Tokens', 'Semantic Rules'];
		for (const section of requiredSections) {
			if (!designSystem.includes(section)) {
				console.warn(`[DesignSystemAgent] Warning: Design system missing section: ${section}`);
			}
		}
	}

	/**
	 * 解析设计系统中的 tokens
	 */
	parseTokens(designSystem: string): any {
		try {
			// 提取 JSON 代码块
			const jsonMatch = designSystem.match(/```json\s*\n([\s\S]*?)\n```/);

			if (!jsonMatch) {
				console.warn('[DesignSystemAgent] No JSON tokens found in design system');
				return null;
			}

			const jsonStr = jsonMatch[1];
			return JSON.parse(jsonStr);
		} catch (error) {
			console.error('[DesignSystemAgent] Failed to parse design system tokens:', error);
			return null;
		}
	}
}
