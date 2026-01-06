import { BaseAgent } from '../base/BaseAgent';
import { AgentInput, AgentOutput } from '../base/types';
import { DimensionConfig, ExtractedValue, Difference } from './configs/dimensionConfigs';
import { ExtractorFactory, ComparatorFactory, NormalizerFactory } from './utils/factories';

/**
 * 统一的工具驱动 Agent
 * 根据配置执行不同维度的一致性检查
 */
export class ToolDrivenConsistencyAgent extends BaseAgent {
	name: string;
	description: string;
	executionMode: 'llm' | 'tool' = 'tool';

	constructor(
		private config: DimensionConfig,
		private extractorFactory: ExtractorFactory,
		private comparatorFactory: ComparatorFactory,
		private normalizerFactory: NormalizerFactory
	) {
		super();
		this.name = config.name;
		this.description = config.description;
	}

	async execute(input: AgentInput): Promise<AgentOutput> {
		try {
			const { figmaData, codeFiles, designSystemTokens, config: runtimeConfig } = input.data;

			// 1. 提取 Figma 数据
			this.streamProgress(`Extracting ${this.config.name} from Figma...`, input.context);
			const figmaValues = this.extractFigmaValues(figmaData, this.config.name);

			// 2. 提取代码数据
			this.streamProgress(`Extracting ${this.config.name} from code...`, input.context);
			const codeValues = await this.extractCodeValues(
				codeFiles,
				designSystemTokens,
				runtimeConfig
			);

			// 3. 规范化数据
			let normalizedFigmaValues = figmaValues;
			let normalizedCodeValues = codeValues;

			if (this.config.normalizer) {
				this.streamProgress(`Normalizing ${this.config.name} values...`, input.context);
				const normalizer = this.normalizerFactory.create(this.config.normalizer);

				if (normalizer) {
					normalizedFigmaValues = normalizer.normalize(figmaValues);
					normalizedCodeValues = normalizer.normalize(codeValues);
				}
			}

			// 4. 对比
			this.streamProgress(`Comparing ${this.config.name} values...`, input.context);
			const comparator = this.comparatorFactory.create(this.config.comparator);
			const differences = comparator.compare(
				normalizedFigmaValues,
				normalizedCodeValues,
				this.config.name
			);

			// 5. 计算匹配率
			const totalChecks = figmaValues.size;
			const matchRate = totalChecks === 0 ? 1 : 1 - differences.length / totalChecks;

			return {
				success: true,
				data: {
					dimension: this.config.name,
					totalChecks,
					differences,
					matchRate,
					summary: {
						criticalCount: differences.filter(d => d.severity === 'critical').length,
						minorCount: differences.filter(d => d.severity === 'minor').length
					}
				},
				metadata: {
					executionMode: 'tool',
					agentName: this.name
				}
			};
		} catch (error: any) {
			return this.handleError(error);
		}
	}

	/**
	 * 从 Figma 数据提取值
	 */
	private extractFigmaValues(figmaData: any, dimension: string): Map<string, ExtractedValue> {
		const values = new Map<string, ExtractedValue>();

		if (!figmaData) {
			return values;
		}

		// 根据维度类型提取对应数据
		switch (dimension) {
			case 'color':
				this.extractFigmaColors(figmaData, values);
				break;
			case 'typography':
				this.extractFigmaTypography(figmaData, values);
				break;
			case 'spacing':
				this.extractFigmaSpacing(figmaData, values);
				break;
			case 'borderRadius':
				this.extractFigmaBorderRadius(figmaData, values);
				break;
			case 'shadow':
				this.extractFigmaShadow(figmaData, values);
				break;
		}

		return values;
	}

	/**
	 * 提取 Figma 颜色
	 */
	private extractFigmaColors(figmaData: any, values: Map<string, ExtractedValue>): void {
		// 从 Figma 节点提取颜色
		if (figmaData.fills) {
			figmaData.fills.forEach((fill: any, index: number) => {
				if (fill.type === 'SOLID' && fill.color) {
					const color = this.rgbaToHex(fill.color);
					values.set(`fill-${index}`, {
						property: `fill-${index}`,
						value: color,
						location: 'figma'
					});
				}
			});
		}

		if (figmaData.strokes) {
			figmaData.strokes.forEach((stroke: any, index: number) => {
				if (stroke.type === 'SOLID' && stroke.color) {
					const color = this.rgbaToHex(stroke.color);
					values.set(`stroke-${index}`, {
						property: `stroke-${index}`,
						value: color,
						location: 'figma'
					});
				}
			});
		}
	}

	/**
	 * 提取 Figma 字体
	 */
	private extractFigmaTypography(figmaData: any, values: Map<string, ExtractedValue>): void {
		if (figmaData.style) {
			const style = figmaData.style;

			if (style.fontFamily) {
				values.set('font-family', {
					property: 'font-family',
					value: style.fontFamily,
					location: 'figma'
				});
			}

			if (style.fontSize) {
				values.set('font-size', {
					property: 'font-size',
					value: `${style.fontSize}px`,
					location: 'figma'
				});
			}

			if (style.fontWeight) {
				values.set('font-weight', {
					property: 'font-weight',
					value: style.fontWeight,
					location: 'figma'
				});
			}

			if (style.lineHeight) {
				values.set('line-height', {
					property: 'line-height',
					value: style.lineHeight.value ? `${style.lineHeight.value}px` : style.lineHeight,
					location: 'figma'
				});
			}
		}
	}

	/**
	 * 提取 Figma 间距
	 */
	private extractFigmaSpacing(figmaData: any, values: Map<string, ExtractedValue>): void {
		if (figmaData.paddingLeft !== undefined) {
			values.set('padding-left', {
				property: 'padding-left',
				value: `${figmaData.paddingLeft}px`,
				location: 'figma'
			});
		}

		if (figmaData.paddingRight !== undefined) {
			values.set('padding-right', {
				property: 'padding-right',
				value: `${figmaData.paddingRight}px`,
				location: 'figma'
			});
		}

		if (figmaData.paddingTop !== undefined) {
			values.set('padding-top', {
				property: 'padding-top',
				value: `${figmaData.paddingTop}px`,
				location: 'figma'
			});
		}

		if (figmaData.paddingBottom !== undefined) {
			values.set('padding-bottom', {
				property: 'padding-bottom',
				value: `${figmaData.paddingBottom}px`,
				location: 'figma'
			});
		}

		if (figmaData.itemSpacing !== undefined) {
			values.set('gap', {
				property: 'gap',
				value: `${figmaData.itemSpacing}px`,
				location: 'figma'
			});
		}
	}

	/**
	 * 提取 Figma 圆角
	 */
	private extractFigmaBorderRadius(figmaData: any, values: Map<string, ExtractedValue>): void {
		if (figmaData.cornerRadius !== undefined) {
			values.set('border-radius', {
				property: 'border-radius',
				value: `${figmaData.cornerRadius}px`,
				location: 'figma'
			});
		}

		if (figmaData.rectangleCornerRadii) {
			const radii = figmaData.rectangleCornerRadii;
			['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].forEach((corner, index) => {
				if (radii[index] !== undefined) {
					values.set(`border-${corner.toLowerCase()}-radius`, {
						property: `border-${corner.toLowerCase()}-radius`,
						value: `${radii[index]}px`,
						location: 'figma'
					});
				}
			});
		}
	}

	/**
	 * 提取 Figma 阴影
	 */
	private extractFigmaShadow(figmaData: any, values: Map<string, ExtractedValue>): void {
		if (figmaData.effects) {
			figmaData.effects.forEach((effect: any, index: number) => {
				if (effect.type === 'DROP_SHADOW' && effect.visible !== false) {
					const shadow = this.formatFigmaShadow(effect);
					values.set(`shadow-${index}`, {
						property: `shadow-${index}`,
						value: shadow,
						location: 'figma'
					});
				}
			});
		}
	}

	/**
	 * 从代码提取值（使用配置的提取器）
	 */
	private async extractCodeValues(
		codeFiles: any[],
		designSystemTokens: any,
		runtimeConfig?: Record<string, any>
	): Promise<Map<string, ExtractedValue>> {
		// 首先尝试使用主提取器
		const primaryExtractor = this.extractorFactory.create(this.config.extractor);
		let values = await primaryExtractor.extract(codeFiles, designSystemTokens, runtimeConfig);

		// 如果主提取器没有结果，且有 fallback，尝试 fallback
		if (values.size === 0 && this.config.extractor.fallback) {
			const fallbackExtractor = this.extractorFactory.create(this.config.extractor.fallback);
			values = await fallbackExtractor.extract(codeFiles, designSystemTokens, runtimeConfig);
		}

		return values;
	}

	/**
	 * RGBA 转 Hex
	 */
	private rgbaToHex(rgba: { r: number; g: number; b: number; a?: number }): string {
		const toHex = (n: number) => {
			const hex = Math.round(n * 255).toString(16).padStart(2, '0');
			return hex;
		};

		return `#${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}`.toUpperCase();
	}

	/**
	 * 格式化 Figma 阴影为 CSS box-shadow
	 */
	private formatFigmaShadow(effect: any): string {
		const { offset, radius, color } = effect;
		const x = offset?.x || 0;
		const y = offset?.y || 0;
		const blur = radius || 0;
		const shadowColor = color ? this.rgbaToHex(color) : '#000000';

		return `${x}px ${y}px ${blur}px ${shadowColor}`;
	}
}
