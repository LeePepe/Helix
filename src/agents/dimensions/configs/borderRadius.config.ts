import { DimensionConfig } from './dimensionConfigs';

/**
 * 圆角一致性检查配置
 */
export const borderRadiusDimensionConfig: DimensionConfig = {
	name: 'borderRadius',
	description: 'Border radius consistency check',
	extractor: {
		type: 'token',
		tokenPath: 'tokens.borderRadius',
		fallback: {
			type: 'css',
			cssSelectors: ['border-radius', 'border-top-left-radius', 'border-top-right-radius',
				'border-bottom-left-radius', 'border-bottom-right-radius']
		}
	},
	comparator: {
		type: 'fuzzy',
		tolerance: 0.02  // 2% 容差
	},
	normalizer: {
		type: 'unit',
		targetFormat: 'px'
	}
};
