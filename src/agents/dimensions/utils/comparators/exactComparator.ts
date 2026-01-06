import { ComparatorConfig, Difference, ExtractedValue } from '../../configs/dimensionConfigs';

/**
 * 精确对比器
 * 用于需要完全匹配的维度（如字体名称）
 */
export class ExactComparator {
	constructor(private config: ComparatorConfig) {}

	/**
	 * 对比两组值
	 */
	compare(
		figmaValues: Map<string, ExtractedValue>,
		codeValues: Map<string, ExtractedValue>,
		dimension: string
	): Difference[] {
		const differences: Difference[] = [];

		// 检查 Figma 中的每个值是否在代码中存在且相等
		for (const [property, figmaValue] of figmaValues.entries()) {
			const codeValue = codeValues.get(property);

			if (!codeValue) {
				// 代码中缺失
				differences.push({
					category: dimension,
					severity: 'critical',
					property,
					figmaValue: figmaValue.value,
					codeValue: null,
					fix: `Add ${property}: ${figmaValue.value} to design system`
				});
			} else if (!this.isEqual(figmaValue.value, codeValue.value)) {
				// 值不匹配
				differences.push({
					category: dimension,
					severity: this.getSeverity(figmaValue.value, codeValue.value),
					property,
					figmaValue: figmaValue.value,
					codeValue: codeValue.value,
					fix: `Change ${property} from ${codeValue.value} to ${figmaValue.value}`,
					location: codeValue.location
				});
			}
		}

		// 检查代码中是否有 Figma 中不存在的值（可能是多余的）
		for (const [property, codeValue] of codeValues.entries()) {
			if (!figmaValues.has(property)) {
				differences.push({
					category: dimension,
					severity: 'minor',
					property,
					figmaValue: null,
					codeValue: codeValue.value,
					fix: `Remove unused ${property}: ${codeValue.value}`,
					location: codeValue.location
				});
			}
		}

		return differences;
	}

	/**
	 * 判断两个值是否相等
	 */
	private isEqual(value1: any, value2: any): boolean {
		// 原始类型直接比较
		if (typeof value1 !== 'object' && typeof value2 !== 'object') {
			return String(value1).trim() === String(value2).trim();
		}

		// 对象类型，深度比较
		return JSON.stringify(value1) === JSON.stringify(value2);
	}

	/**
	 * 判断严重程度
	 */
	private getSeverity(figmaValue: any, codeValue: any): 'critical' | 'minor' {
		// 默认不匹配都是 critical
		return 'critical';
	}
}
