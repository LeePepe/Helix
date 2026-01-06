import { DimensionConfig } from './dimensionConfigs';

/**
 * 间距一致性检查配置
 */
export const spacingDimensionConfig: DimensionConfig = {
	name: 'spacing',
	description: 'Spacing consistency check',
	extractor: {
		type: 'token',
		tokenPath: 'tokens.spacing',
		fallback: {
			type: 'css',
			cssSelectors: ['padding', 'margin', 'gap', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
				'margin-top', 'margin-right', 'margin-bottom', 'margin-left']
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
