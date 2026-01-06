import { ComparatorConfig, Difference, ExtractedValue } from '../../configs/dimensionConfigs';

/**
 * 模糊对比器
 * 用于允许一定误差的维度（如颜色、间距）
 */
export class FuzzyComparator {
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
		const tolerance = this.config.tolerance || 0;

		// 检查 Figma 中的每个值
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
			} else if (!this.isSimilar(figmaValue.value, codeValue.value, tolerance)) {
				// 值不匹配（超出容差）
				const diff = this.calculateDifference(figmaValue.value, codeValue.value);
				differences.push({
					category: dimension,
					severity: this.getSeverity(diff, tolerance),
					property,
					figmaValue: figmaValue.value,
					codeValue: codeValue.value,
					fix: `Change ${property} from ${codeValue.value} to ${figmaValue.value} (diff: ${(diff * 100).toFixed(1)}%)`,
					location: codeValue.location
				});
			}
		}

		return differences;
	}

	/**
	 * 判断两个值是否相似（在容差范围内）
	 */
	private isSimilar(value1: any, value2: any, tolerance: number): boolean {
		// 数值对比
		if (typeof value1 === 'number' && typeof value2 === 'number') {
			const diff = Math.abs(value1 - value2);
			const maxValue = Math.max(Math.abs(value1), Math.abs(value2));
			return diff / maxValue <= tolerance;
		}

		// 字符串数值对比（如 "16px" vs "16.5px"）
		if (typeof value1 === 'string' && typeof value2 === 'string') {
			const num1 = this.extractNumber(value1);
			const num2 = this.extractNumber(value2);

			if (num1 !== null && num2 !== null) {
				const diff = Math.abs(num1 - num2);
				const maxValue = Math.max(Math.abs(num1), Math.abs(num2));
				return maxValue === 0 ? diff === 0 : diff / maxValue <= tolerance;
			}
		}

		// 颜色对比
		if (this.isColor(value1) && this.isColor(value2)) {
			return this.compareColors(value1, value2, tolerance);
		}

		// 其他情况，降级到精确对比
		return String(value1).trim() === String(value2).trim();
	}

	/**
	 * 计算差异程度 (0-1)
	 */
	private calculateDifference(value1: any, value2: any): number {
		// 数值
		if (typeof value1 === 'number' && typeof value2 === 'number') {
			const diff = Math.abs(value1 - value2);
			const maxValue = Math.max(Math.abs(value1), Math.abs(value2));
			return maxValue === 0 ? 0 : diff / maxValue;
		}

		// 字符串数值
		if (typeof value1 === 'string' && typeof value2 === 'string') {
			const num1 = this.extractNumber(value1);
			const num2 = this.extractNumber(value2);

			if (num1 !== null && num2 !== null) {
				const diff = Math.abs(num1 - num2);
				const maxValue = Math.max(Math.abs(num1), Math.abs(num2));
				return maxValue === 0 ? 0 : diff / maxValue;
			}
		}

		// 颜色
		if (this.isColor(value1) && this.isColor(value2)) {
			return this.colorDifference(value1, value2);
		}

		// 其他，二元差异
		return value1 === value2 ? 0 : 1;
	}

	/**
	 * 从字符串提取数值
	 */
	private extractNumber(str: string): number | null {
		const match = str.match(/[-+]?[0-9]*\.?[0-9]+/);
		return match ? parseFloat(match[0]) : null;
	}

	/**
	 * 判断是否是颜色值
	 */
	private isColor(value: any): boolean {
		if (typeof value !== 'string') {
			return false;
		}

		const colorPatterns = [
			/^#[0-9A-Fa-f]{3,8}$/,           // hex
			/^rgb\(/,                         // rgb()
			/^rgba\(/,                        // rgba()
			/^hsl\(/,                         // hsl()
			/^hsla\(/                         // hsla()
		];

		return colorPatterns.some(pattern => pattern.test(value.trim()));
	}

	/**
	 * 对比颜色
	 */
	private compareColors(color1: string, color2: string, tolerance: number): boolean {
		const rgb1 = this.parseColor(color1);
		const rgb2 = this.parseColor(color2);

		if (!rgb1 || !rgb2) {
			return color1.trim() === color2.trim();
		}

		// 对比 RGB 值
		const diffR = Math.abs(rgb1.r - rgb2.r) / 255;
		const diffG = Math.abs(rgb1.g - rgb2.g) / 255;
		const diffB = Math.abs(rgb1.b - rgb2.b) / 255;
		const avgDiff = (diffR + diffG + diffB) / 3;

		return avgDiff <= tolerance;
	}

	/**
	 * 计算颜色差异
	 */
	private colorDifference(color1: string, color2: string): number {
		const rgb1 = this.parseColor(color1);
		const rgb2 = this.parseColor(color2);

		if (!rgb1 || !rgb2) {
			return color1.trim() === color2.trim() ? 0 : 1;
		}

		const diffR = Math.abs(rgb1.r - rgb2.r) / 255;
		const diffG = Math.abs(rgb1.g - rgb2.g) / 255;
		const diffB = Math.abs(rgb1.b - rgb2.b) / 255;

		return (diffR + diffG + diffB) / 3;
	}

	/**
	 * 解析颜色为 RGB
	 */
	private parseColor(color: string): { r: number; g: number; b: number } | null {
		color = color.trim();

		// Hex
		if (color.startsWith('#')) {
			return this.parseHex(color);
		}

		// RGB/RGBA
		if (color.startsWith('rgb')) {
			return this.parseRGB(color);
		}

		return null;
	}

	/**
	 * 解析 Hex 颜色
	 */
	private parseHex(hex: string): { r: number; g: number; b: number } | null {
		hex = hex.replace('#', '');

		if (hex.length === 3) {
			hex = hex.split('').map(c => c + c).join('');
		}

		if (hex.length !== 6 && hex.length !== 8) {
			return null;
		}

		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);

		return { r, g, b };
	}

	/**
	 * 解析 RGB/RGBA 颜色
	 */
	private parseRGB(rgb: string): { r: number; g: number; b: number } | null {
		const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);

		if (!match) {
			return null;
		}

		return {
			r: parseInt(match[1]),
			g: parseInt(match[2]),
			b: parseInt(match[3])
		};
	}

	/**
	 * 判断严重程度
	 */
	private getSeverity(diff: number, tolerance: number): 'critical' | 'minor' {
		// 如果差异在容差的 2 倍内，认为是 minor
		// 超过 2 倍，认为是 critical
		return diff <= tolerance * 2 ? 'minor' : 'critical';
	}
}
