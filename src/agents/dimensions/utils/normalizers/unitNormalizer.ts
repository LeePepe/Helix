import { NormalizerConfig, ExtractedValue } from '../../configs/dimensionConfigs';

/**
 * 单位规范化器
 * 将不同单位统一为目标单位（px, rem, em）
 */
export class UnitNormalizer {
	constructor(private config: NormalizerConfig) {}

	/**
	 * 规范化值
	 */
	normalize(values: Map<string, ExtractedValue>): Map<string, ExtractedValue> {
		const normalized = new Map<string, ExtractedValue>();
		const targetFormat = this.config.targetFormat || 'px';

		for (const [key, extractedValue] of values.entries()) {
			const normalizedValue = this.normalizeUnit(extractedValue.value, targetFormat);

			normalized.set(key, {
				...extractedValue,
				value: normalizedValue
			});
		}

		return normalized;
	}

	/**
	 * 规范化单个值
	 */
	private normalizeUnit(value: any, targetUnit: string): any {
		if (typeof value === 'number') {
			return `${value}${targetUnit}`;
		}

		if (typeof value !== 'string') {
			return value;
		}

		// 解析值和单位
		const parsed = this.parseValue(value);
		if (!parsed) {
			return value;
		}

		const { number, unit } = parsed;

		// 如果已经是目标单位，直接返回
		if (unit === targetUnit) {
			return value;
		}

		// 转换单位
		const converted = this.convertUnit(number, unit, targetUnit);
		return `${converted}${targetUnit}`;
	}

	/**
	 * 解析值和单位
	 */
	private parseValue(value: string): { number: number; unit: string } | null {
		const match = value.match(/^([-+]?[0-9]*\.?[0-9]+)(px|rem|em|%|vh|vw)?$/);

		if (!match) {
			return null;
		}

		return {
			number: parseFloat(match[1]),
			unit: match[2] || 'px'
		};
	}

	/**
	 * 转换单位
	 */
	private convertUnit(value: number, fromUnit: string, toUnit: string): number {
		// 假设基准字体大小为 16px
		const baseFontSize = 16;

		// 先转换为 px
		let pixels: number;

		switch (fromUnit) {
			case 'px':
				pixels = value;
				break;
			case 'rem':
				pixels = value * baseFontSize;
				break;
			case 'em':
				pixels = value * baseFontSize;
				break;
			case '%':
				// 百分比转换取决于上下文，这里简单假设相对于基准字体
				pixels = (value / 100) * baseFontSize;
				break;
			default:
				pixels = value;
		}

		// 再从 px 转换为目标单位
		switch (toUnit) {
			case 'px':
				return Math.round(pixels * 100) / 100;
			case 'rem':
				return Math.round((pixels / baseFontSize) * 100) / 100;
			case 'em':
				return Math.round((pixels / baseFontSize) * 100) / 100;
			case '%':
				return Math.round((pixels / baseFontSize) * 100);
			default:
				return pixels;
		}
	}
}
