import { ExtractorConfig, ExtractedValue } from '../../configs/dimensionConfigs';

/**
 * Token 提取器
 * 从设计系统 tokens 中提取值
 */
export class TokenExtractor {
	constructor(private config: ExtractorConfig) {}

	/**
	 * 从设计系统 tokens 提取值
	 */
	async extract(
		codeFiles: any[],
		designSystemTokens: any,
		runtimeConfig?: Record<string, any>
	): Promise<Map<string, ExtractedValue>> {
		const results = new Map<string, ExtractedValue>();

		if (!designSystemTokens || !this.config.tokenPath) {
			return results;
		}

		// 按 tokenPath 导航到目标对象
		const tokens = this.navigateTokenPath(designSystemTokens, this.config.tokenPath);

		if (!tokens) {
			return results;
		}

		// 提取所有 token 值
		this.extractTokensRecursive(tokens, '', results);

		return results;
	}

	/**
	 * 按路径导航 token 对象
	 * 如 "tokens.color" -> designSystemTokens.tokens.color
	 */
	private navigateTokenPath(obj: any, path: string): any {
		const parts = path.split('.');
		let current = obj;

		for (const part of parts) {
			if (current && typeof current === 'object' && part in current) {
				current = current[part];
			} else {
				return null;
			}
		}

		return current;
	}

	/**
	 * 递归提取所有 token 值
	 */
	private extractTokensRecursive(
		obj: any,
		prefix: string,
		results: Map<string, ExtractedValue>
	): void {
		if (!obj || typeof obj !== 'object') {
			return;
		}

		for (const [key, value] of Object.entries(obj)) {
			const propertyName = prefix ? `${prefix}.${key}` : key;

			if (this.isTokenValue(value)) {
				// 是一个 token 值
				results.set(propertyName, {
					property: propertyName,
					value: value,
					location: this.config.tokenPath
				});
			} else if (typeof value === 'object') {
				// 递归提取嵌套对象
				this.extractTokensRecursive(value, propertyName, results);
			}
		}
	}

	/**
	 * 判断是否是 token 值（而不是嵌套对象）
	 */
	private isTokenValue(value: any): boolean {
		if (value === null || value === undefined) {
			return false;
		}

		// 原始类型
		if (typeof value !== 'object') {
			return true;
		}

		// 检查是否是 token 对象 (如 { fontSize: "16px", fontWeight: 700 })
		// 如果对象的所有值都是原始类型，认为是 token 值
		const values = Object.values(value);
		if (values.length === 0) {
			return false;
		}

		return values.every(v => typeof v !== 'object' || v === null);
	}
}
