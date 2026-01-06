import { DimensionConfig } from './dimensionConfigs';

/**
 * 字体一致性检查配置
 */
export const typographyDimensionConfig: DimensionConfig = {
	name: 'typography',
	description: 'Typography consistency check',
	extractor: {
		type: 'token',
		tokenPath: 'tokens.typography',
		fallback: {
			type: 'css',
			cssSelectors: ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing']
		}
	},
	comparator: {
		type: 'exact'
	},
	normalizer: {
		type: 'unit',
		targetFormat: 'px'
	}
};
