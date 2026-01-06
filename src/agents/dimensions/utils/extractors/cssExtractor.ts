import { ExtractorConfig, ExtractedValue } from '../../configs/dimensionConfigs';

/**
 * CSS 提取器
 * 从代码文件的 CSS/样式中提取值
 */
export class CSSExtractor {
	constructor(private config: ExtractorConfig) {}

	/**
	 * 从代码文件提取 CSS 值
	 */
	async extract(
		codeFiles: any[],
		designSystemTokens: any,
		runtimeConfig?: Record<string, any>
	): Promise<Map<string, ExtractedValue>> {
		const results = new Map<string, ExtractedValue>();

		if (!this.config.cssSelectors || this.config.cssSelectors.length === 0) {
			return results;
		}

		for (const file of codeFiles) {
			if (!file.content) {
				continue;
			}

			// 提取文件中的样式
			this.extractFromFile(file, results);
		}

		return results;
	}

	/**
	 * 从单个文件提取样式
	 */
	private extractFromFile(file: any, results: Map<string, ExtractedValue>): void {
		const content = file.content as string;

		// 提取内联样式 (style="...")
		this.extractInlineStyles(content, file.path, results);

		// 提取 CSS-in-JS (styled-components, emotion, etc.)
		this.extractCSSInJS(content, file.path, results);

		// 提取 CSS 文件
		if (file.path.endsWith('.css') || file.path.endsWith('.scss') || file.path.endsWith('.less')) {
			this.extractCSSFile(content, file.path, results);
		}
	}

	/**
	 * 提取内联样式
	 */
	private extractInlineStyles(content: string, filePath: string, results: Map<string, ExtractedValue>): void {
		const styleRegex = /style=["']([^"']+)["']/g;
		let match;

		while ((match = styleRegex.exec(content)) !== null) {
			const styleString = match[1];
			this.parseStyleString(styleString, filePath, results);
		}
	}

	/**
	 * 提取 CSS-in-JS
	 */
	private extractCSSInJS(content: string, filePath: string, results: Map<string, ExtractedValue>): void {
		// 匹配 styled-components 风格: styled.div`...`
		const styledRegex = /styled\.\w+`([^`]+)`/g;
		let match;

		while ((match = styledRegex.exec(content)) !== null) {
			const cssContent = match[1];
			this.parseCSSContent(cssContent, filePath, results);
		}

		// 匹配对象样式: { color: 'red', fontSize: '16px' }
		const objectStyleRegex = /style=\{?\{([^}]+)\}\}?/g;
		while ((match = objectStyleRegex.exec(content)) !== null) {
			const objectContent = match[1];
			this.parseObjectStyle(objectContent, filePath, results);
		}
	}

	/**
	 * 提取 CSS 文件内容
	 */
	private extractCSSFile(content: string, filePath: string, results: Map<string, ExtractedValue>): void {
		this.parseCSSContent(content, filePath, results);
	}

	/**
	 * 解析样式字符串 (如 "color: red; font-size: 16px")
	 */
	private parseStyleString(styleString: string, filePath: string, results: Map<string, ExtractedValue>): void {
		const properties = styleString.split(';');

		for (const prop of properties) {
			const [key, value] = prop.split(':').map(s => s.trim());

			if (key && value && this.isTargetProperty(key)) {
				const propertyKey = `${filePath}:${key}`;
				results.set(propertyKey, {
					property: key,
					value: value,
					location: filePath
				});
			}
		}
	}

	/**
	 * 解析 CSS 内容
	 */
	private parseCSSContent(cssContent: string, filePath: string, results: Map<string, ExtractedValue>): void {
		// 简单的 CSS 属性提取 (property: value;)
		const propertyRegex = /([a-z-]+)\s*:\s*([^;]+);/g;
		let match;

		while ((match = propertyRegex.exec(cssContent)) !== null) {
			const [, key, value] = match;

			if (this.isTargetProperty(key)) {
				const propertyKey = `${filePath}:${key}`;
				results.set(propertyKey, {
					property: key,
					value: value.trim(),
					location: filePath
				});
			}
		}
	}

	/**
	 * 解析对象样式 (如 color: 'red', fontSize: '16px')
	 */
	private parseObjectStyle(objectContent: string, filePath: string, results: Map<string, ExtractedValue>): void {
		// 匹配 key: 'value' 或 key: "value"
		const propertyRegex = /(\w+)\s*:\s*['"]([^'"]+)['"]/g;
		let match;

		while ((match = propertyRegex.exec(objectContent)) !== null) {
			const [, key, value] = match;

			// 转换 camelCase 到 kebab-case
			const kebabKey = this.camelToKebab(key);

			if (this.isTargetProperty(kebabKey)) {
				const propertyKey = `${filePath}:${kebabKey}`;
				results.set(propertyKey, {
					property: kebabKey,
					value: value,
					location: filePath
				});
			}
		}
	}

	/**
	 * 判断是否是目标属性
	 */
	private isTargetProperty(property: string): boolean {
		if (!this.config.cssSelectors) {
			return false;
		}

		return this.config.cssSelectors.includes(property);
	}

	/**
	 * camelCase 转 kebab-case
	 */
	private camelToKebab(str: string): string {
		return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
	}
}
