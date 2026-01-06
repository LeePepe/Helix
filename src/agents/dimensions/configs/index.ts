/**
 * 导出所有维度配置
 */

export * from './dimensionConfigs';
export { colorDimensionConfig } from './color.config';
export { typographyDimensionConfig } from './typography.config';
export { spacingDimensionConfig } from './spacing.config';
export { borderRadiusDimensionConfig } from './borderRadius.config';
export { shadowDimensionConfig } from './shadow.config';

import { DimensionConfig } from './dimensionConfigs';
import { colorDimensionConfig } from './color.config';
import { typographyDimensionConfig } from './typography.config';
import { spacingDimensionConfig } from './spacing.config';
import { borderRadiusDimensionConfig } from './borderRadius.config';
import { shadowDimensionConfig } from './shadow.config';

/**
 * 所有预定义的维度配置
 */
export const allDimensionConfigs: DimensionConfig[] = [
	colorDimensionConfig,
	typographyDimensionConfig,
	spacingDimensionConfig,
	borderRadiusDimensionConfig,
	shadowDimensionConfig
];

/**
 * 按名称获取维度配置
 */
export function getDimensionConfig(name: string): DimensionConfig | undefined {
	return allDimensionConfigs.find(config => config.name === name);
}
