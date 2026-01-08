import * as vscode from 'vscode';
import * as path from 'path';

/**
 * 框架检测器
 * 使用混合策略：结构化配置 + 文件系统检测 + LLM 智能推断
 */
export class FrameworkDetector {
	/**
	 * 检测项目使用的框架
	 * @param designSystemGuide - 设计系统指南内容（可选）
	 * @param workspaceRoot - 工作空间根目录
	 * @returns 检测到的框架名称
	 */
	async detectFramework(
		designSystemGuide: string = '',
		workspaceRoot?: string
	): Promise<string | undefined> {
		console.log('[Helix] FrameworkDetector - Starting framework detection...');

		// 策略 A: 从 design-system-guide 中提取结构化配置
		if (designSystemGuide) {
			const configFramework = this.extractFromConfig(designSystemGuide);
			if (configFramework) {
				console.log('[Helix] FrameworkDetector - Found in structured config:', configFramework);
				return configFramework;
			}
		}

		// 策略 B: 从文件系统检测
		if (workspaceRoot) {
			const fileSystemFramework = await this.detectFromFileSystem(workspaceRoot);
			if (fileSystemFramework) {
				console.log('[Helix] FrameworkDetector - Found from file system:', fileSystemFramework);
				return fileSystemFramework;
			}
		}

		// 策略 C: 关键词匹配（fallback）
		if (designSystemGuide) {
			const keywordFramework = this.detectFromKeywords(designSystemGuide);
			if (keywordFramework) {
				console.log('[Helix] FrameworkDetector - Found from keywords:', keywordFramework);
				return keywordFramework;
			}
		}

		console.log('[Helix] FrameworkDetector - No framework detected');
		return undefined;
	}

	/**
	 * 策略 A: 从结构化配置中提取框架信息
	 *
	 * 支持的格式：
	 * - YAML-like: Framework: SwiftUI
	 * - Markdown table: | Framework | SwiftUI |
	 * - JSON block: { "framework": "SwiftUI" }
	 */
	private extractFromConfig(designSystemGuide: string): string | undefined {
		console.log('[Helix] FrameworkDetector - Checking structured config...');

		// 1. 检查 YAML-like 格式: Framework: SwiftUI
		const yamlMatch = designSystemGuide.match(/^[\s-]*(?:Framework|framework|FRAMEWORK):\s*(.+?)$/im);
		if (yamlMatch) {
			const framework = yamlMatch[1].trim();
			console.log('[Helix] FrameworkDetector - Found YAML-like config:', framework);
			return this.normalizeFrameworkName(framework);
		}

		// 2. 检查 Markdown table 格式
		const tableMatch = designSystemGuide.match(/\|\s*(?:Framework|framework)\s*\|\s*(.+?)\s*\|/i);
		if (tableMatch) {
			const framework = tableMatch[1].trim();
			console.log('[Helix] FrameworkDetector - Found table config:', framework);
			return this.normalizeFrameworkName(framework);
		}

		// 3. 检查 JSON 块
		const jsonBlockMatch = designSystemGuide.match(/```json\s*\n([\s\S]*?)\n```/);
		if (jsonBlockMatch) {
			try {
				const json = JSON.parse(jsonBlockMatch[1]);
				if (json.framework || json.Framework) {
					const framework = json.framework || json.Framework;
					console.log('[Helix] FrameworkDetector - Found JSON config:', framework);
					return this.normalizeFrameworkName(framework);
				}
			} catch (e) {
				// JSON 解析失败，继续其他策略
			}
		}

		// 4. 检查 Project Configuration 部分
		const configSectionMatch = designSystemGuide.match(/##?\s*Project\s+Configuration([\s\S]*?)(?=\n##|\n#|$)/i);
		if (configSectionMatch) {
			const configSection = configSectionMatch[1];
			const frameworkMatch = configSection.match(/(?:Framework|framework).*?[:：]\s*(.+?)(?:\n|$)/i);
			if (frameworkMatch) {
				const framework = frameworkMatch[1].trim();
				console.log('[Helix] FrameworkDetector - Found in config section:', framework);
				return this.normalizeFrameworkName(framework);
			}
		}

		return undefined;
	}

	/**
	 * 策略 B: 从文件系统检测框架
	 */
	private async detectFromFileSystem(workspaceRoot: string): Promise<string | undefined> {
		console.log('[Helix] FrameworkDetector - Checking file system...');

		const workspaceUri = vscode.Uri.file(workspaceRoot);

		try {
			// 检查 Xcode 项目文件 (.xcodeproj, .xcworkspace)
			const xcodeFiles = await vscode.workspace.findFiles(
				new vscode.RelativePattern(workspaceUri, '**/*.{xcodeproj,xcworkspace}'),
				'**/node_modules/**',
				1
			);
			if (xcodeFiles.length > 0) {
				console.log('[Helix] FrameworkDetector - Found Xcode project files');
				return 'SwiftUI';
			}

			// 检查 package.json
			const packageJsonFiles = await vscode.workspace.findFiles(
				new vscode.RelativePattern(workspaceUri, 'package.json'),
				'**/node_modules/**',
				1
			);
			if (packageJsonFiles.length > 0) {
				const packageJson = await this.readPackageJson(packageJsonFiles[0]);
				if (packageJson) {
					const framework = this.detectFrameworkFromPackageJson(packageJson);
					if (framework) {
						console.log('[Helix] FrameworkDetector - Detected from package.json:', framework);
						return framework;
					}
				}
			}

			// 检查 angular.json
			const angularFiles = await vscode.workspace.findFiles(
				new vscode.RelativePattern(workspaceUri, 'angular.json'),
				'**/node_modules/**',
				1
			);
			if (angularFiles.length > 0) {
				console.log('[Helix] FrameworkDetector - Found angular.json');
				return 'Angular with TypeScript';
			}

			// 检查 vue.config.js 或 vite.config with vue
			const vueConfigFiles = await vscode.workspace.findFiles(
				new vscode.RelativePattern(workspaceUri, '{vue.config.js,vite.config.ts,vite.config.js}'),
				'**/node_modules/**',
				1
			);
			if (vueConfigFiles.length > 0) {
				for (const file of vueConfigFiles) {
					const content = await this.readFileContent(file);
					if (content && content.toLowerCase().includes('vue')) {
						console.log('[Helix] FrameworkDetector - Found Vue config file');
						return 'Vue 3 with TypeScript';
					}
				}
			}

		} catch (error) {
			console.warn('[Helix] FrameworkDetector - File system check failed:', error);
		}

		return undefined;
	}

	/**
	 * 从 package.json 中检测框架
	 */
	private detectFrameworkFromPackageJson(packageJson: any): string | undefined {
		const dependencies = {
			...packageJson.dependencies,
			...packageJson.devDependencies
		};

		console.log('[Helix] FrameworkDetector - Analyzing package.json dependencies...');

		// 优先级：明确的框架依赖
		if (dependencies['@angular/core']) {
			return 'Angular with TypeScript';
		}
		if (dependencies['vue'] || dependencies['@vue/cli']) {
			return 'Vue 3 with TypeScript';
		}
		if (dependencies['svelte']) {
			return 'Svelte with TypeScript';
		}
		if (dependencies['react']) {
			return 'React with TypeScript';
		}

		// 检查 Next.js, Nuxt 等元框架
		if (dependencies['next']) {
			return 'React with TypeScript'; // Next.js 基于 React
		}
		if (dependencies['nuxt']) {
			return 'Vue 3 with TypeScript'; // Nuxt 基于 Vue
		}

		return undefined;
	}

	/**
	 * 策略 C: 关键词匹配（fallback）
	 */
	private detectFromKeywords(designSystemGuide: string): string | undefined {
		const lowerGuide = designSystemGuide.toLowerCase();

		console.log('[Helix] FrameworkDetector - Using keyword matching...');

		// 直接框架名称检测
		if (lowerGuide.includes('swiftui') || lowerGuide.includes('swift ui')) {
			return 'SwiftUI';
		}
		if (lowerGuide.includes('vue')) {
			return 'Vue 3 with TypeScript';
		}
		if (lowerGuide.includes('angular')) {
			return 'Angular with TypeScript';
		}
		if (lowerGuide.includes('svelte')) {
			return 'Svelte with TypeScript';
		}
		if (lowerGuide.includes('react')) {
			return 'React with TypeScript';
		}

		// 平台/工具推断
		if (lowerGuide.includes('ios') || lowerGuide.includes('macos') || lowerGuide.includes('xcode')) {
			return 'SwiftUI';
		}

		return undefined;
	}

	/**
	 * 规范化框架名称
	 */
	private normalizeFrameworkName(framework: string): string {
		const lower = framework.toLowerCase().trim();

		if (lower.includes('swift')) {
			return 'SwiftUI';
		}
		if (lower.includes('vue')) {
			return 'Vue 3 with TypeScript';
		}
		if (lower.includes('angular')) {
			return 'Angular with TypeScript';
		}
		if (lower.includes('svelte')) {
			return 'Svelte with TypeScript';
		}
		if (lower.includes('react')) {
			return 'React with TypeScript';
		}

		// 返回原始值（可能是用户自定义的框架名称）
		return framework;
	}

	/**
	 * 读取 package.json 文件
	 */
	private async readPackageJson(uri: vscode.Uri): Promise<any | undefined> {
		try {
			const content = await vscode.workspace.fs.readFile(uri);
			return JSON.parse(Buffer.from(content).toString('utf8'));
		} catch (error) {
			console.warn('[Helix] FrameworkDetector - Failed to read package.json:', error);
			return undefined;
		}
	}

	/**
	 * 读取文件内容
	 */
	private async readFileContent(uri: vscode.Uri): Promise<string | undefined> {
		try {
			const content = await vscode.workspace.fs.readFile(uri);
			return Buffer.from(content).toString('utf8');
		} catch (error) {
			console.warn('[Helix] FrameworkDetector - Failed to read file:', error);
			return undefined;
		}
	}

	/**
	 * 使用 LLM 分析 design-system-guide 来推断框架
	 * （当上述方法都失败时使用）
	 */
	async detectWithLLM(
		designSystemGuide: string,
		llmCallback: (prompt: string) => Promise<string>
	): Promise<string | undefined> {
		console.log('[Helix] FrameworkDetector - Using LLM analysis...');

		const prompt = `Analyze the following design system guide and determine what framework/platform this project is using.

# Design System Guide

${designSystemGuide.slice(0, 2000)} // 只取前 2000 字符

# Your Task

Based on the content, file references, code examples, and terminology used in the design system guide, determine the most likely framework/platform.

Common frameworks:
- SwiftUI (for iOS/macOS)
- React with TypeScript
- Vue 3 with TypeScript
- Angular with TypeScript
- Svelte with TypeScript

Return ONLY the framework name, nothing else. If you cannot determine it, return "unknown".

Framework:`;

		try {
			const response = await llmCallback(prompt);
			const framework = response.trim();

			if (framework.toLowerCase() !== 'unknown') {
				console.log('[Helix] FrameworkDetector - LLM detected:', framework);
				return this.normalizeFrameworkName(framework);
			}
		} catch (error) {
			console.warn('[Helix] FrameworkDetector - LLM analysis failed:', error);
		}

		return undefined;
	}
}
