import { DimensionConfig } from './dimensionConfigs';

/**
 * 阴影一致性检查配置
 */
export const shadowDimensionConfig: DimensionConfig = {
	name: 'shadow',
	description: 'Shadow consistency check',
	extractor: {
		type: 'token',
		tokenPath: 'tokens.shadow',
		fallback: {
			type: 'css',
			cssSelectors: ['box-shadow', 'filter']  // filter 可能包含 drop-shadow
		}
	},
	comparator: {
		type: 'fuzzy',
		tolerance: 0.05  // 5% 容差（阴影模糊度等可能有更大误差）
	},
	normalizer: {
		type: 'none'  // 阴影格式复杂，暂不规范化
	}
};
