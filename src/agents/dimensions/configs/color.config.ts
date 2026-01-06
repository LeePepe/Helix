import { DimensionConfig } from './dimensionConfigs';

/**
 * 颜色一致性检查配置
 */
export const colorDimensionConfig: DimensionConfig = {
	name: 'color',
	description: 'Color consistency check',
	extractor: {
		type: 'token',
		tokenPath: 'tokens.color',
		// 如果没有 tokens，降级到 CSS 提取
		fallback: {
			type: 'css',
			cssSelectors: ['color', 'background-color', 'border-color', 'fill', 'stroke']
		}
	},
	comparator: {
		type: 'fuzzy',
		tolerance: 0.01  // 1% RGB 容差
	},
	normalizer: {
		type: 'color',
		targetFormat: 'hex'
	}
};
