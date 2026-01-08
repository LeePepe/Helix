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

			console.log(`[Helix][HELIX][${this.config.name} Check] ========== Starting ${this.config.name} check ==========`);
			console.log(`[Helix][HELIX][${this.config.name} Check] Input data keys:`, Object.keys(input.data));
			console.log(`[Helix][HELIX][${this.config.name} Check] figmaData type:`, typeof figmaData);
			console.log(`[Helix][HELIX][${this.config.name} Check] figmaData value (first 500 chars):`,
				typeof figmaData === 'string' ? figmaData.substring(0, 500) : JSON.stringify(figmaData, null, 2).substring(0, 500));
			console.log(`[Helix][HELIX][${this.config.name} Check] codeFiles count:`, codeFiles?.length || 0);

			// 验证输入
			if (!codeFiles || codeFiles.length === 0) {
				const warningMsg = `No code files provided for ${this.config.name} check. Please ensure code files are included in the input.`;
				console.warn(`[HELIX][${this.config.name} Check] ⚠️`, warningMsg);
				throw new Error(warningMsg);
			}

			// 1. 提取 Figma 数据
			this.streamProgress(`Extracting ${this.config.name} from Figma...`, input.context);
			console.log(`[Helix][HELIX][${this.config.name} Check] Calling extractFigmaValues for dimension:`, this.config.name);
			const figmaValues = this.extractFigmaValues(figmaData, this.config.name);

			if (figmaValues.size === 0) {
				const warningMsg = `No ${this.config.name} values found in Figma data. The design may not have ${this.config.name} properties, or the node could not be accessed.`;
				console.warn(`[HELIX][${this.config.name} Check] ⚠️`, warningMsg);
			}

			// 2. 提取代码数据
			this.streamProgress(`Extracting ${this.config.name} from code...`, input.context);
			const codeValues = await this.extractCodeValues(
				codeFiles,
				designSystemTokens,
				runtimeConfig
			);

			if (codeValues.size === 0) {
				const warningMsg = `No ${this.config.name} values found in code. The code files may not contain ${this.config.name} properties, or extraction failed.`;
				console.warn(`[HELIX][${this.config.name} Check] ⚠️`, warningMsg);
			}

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
			console.log(`[Helix][Spacing Check] Starting comparison for ${this.config.name}...`);
			console.log(`[Helix][Spacing Check] Normalized Figma values (${normalizedFigmaValues.size}):`, Array.from(normalizedFigmaValues.entries()));
			console.log(`[Helix][Spacing Check] Normalized Code values (${normalizedCodeValues.size}):`, Array.from(normalizedCodeValues.entries()));

			const comparator = this.comparatorFactory.create(this.config.comparator);
			const differences = comparator.compare(
				normalizedFigmaValues,
				normalizedCodeValues,
				this.config.name
			);

			console.log(`[Helix][Spacing Check] Comparison found ${differences.length} differences`);
			if (differences.length > 0) {
				console.log('[HELIX][Spacing Check] Differences:', JSON.stringify(differences, null, 2));
			}

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

		console.log(`[Helix][HELIX][${dimension} Check] extractFigmaValues called`);
		console.log(`[Helix][HELIX][${dimension} Check] figmaData is null/undefined?`, !figmaData);

		if (!figmaData) {
			console.log(`[Helix][HELIX][${dimension} Check] figmaData is empty, returning empty values`);
			return values;
		}

		console.log(`[Helix][HELIX][${dimension} Check] Switching on dimension type: ${dimension}`);

		// 根据维度类型提取对应数据
		switch (dimension) {
			case 'color':
				console.log(`[Helix][HELIX][${dimension} Check] Calling extractFigmaColors`);
				this.extractFigmaColors(figmaData, values);
				break;
			case 'typography':
				console.log(`[Helix][HELIX][${dimension} Check] Calling extractFigmaTypography`);
				this.extractFigmaTypography(figmaData, values);
				break;
			case 'spacing':
				console.log(`[Helix][HELIX][${dimension} Check] Calling extractFigmaSpacing`);
				this.extractFigmaSpacing(figmaData, values);
				break;
			case 'borderRadius':
				console.log(`[Helix][HELIX][${dimension} Check] Calling extractFigmaBorderRadius`);
				this.extractFigmaBorderRadius(figmaData, values);
				break;
			case 'shadow':
				console.log(`[Helix][HELIX][${dimension} Check] Calling extractFigmaShadow`);
				this.extractFigmaShadow(figmaData, values);
				break;
			default:
				console.log(`[Helix][HELIX][${dimension} Check] ⚠️ Unknown dimension type: ${dimension}`);
		}

		console.log(`[Helix][HELIX][${dimension} Check] extractFigmaValues completed, extracted ${values.size} values`);
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
		console.log('[HELIX][Spacing Check] Extracting Figma spacing from data:', JSON.stringify(figmaData, null, 2));

		// 检查 figmaData 是否有效
		if (typeof figmaData === 'string') {
			const errorMsg = `Figma node access failed: ${figmaData}`;
			console.error('[HELIX][Spacing Check] ❌', errorMsg);
			throw new Error(errorMsg);
		}

		if (!figmaData || typeof figmaData !== 'object') {
			const errorMsg = `Invalid Figma data received. Expected object, got ${typeof figmaData}`;
			console.error('[HELIX][Spacing Check] ❌', errorMsg);
			throw new Error(errorMsg);
		}

		if (figmaData.paddingLeft !== undefined) {
			console.log('[HELIX][Spacing Check] Found paddingLeft:', figmaData.paddingLeft);
			values.set('padding-left', {
				property: 'padding-left',
				value: `${figmaData.paddingLeft}px`,
				location: 'figma'
			});
		}

		if (figmaData.paddingRight !== undefined) {
			console.log('[HELIX][Spacing Check] Found paddingRight:', figmaData.paddingRight);
			values.set('padding-right', {
				property: 'padding-right',
				value: `${figmaData.paddingRight}px`,
				location: 'figma'
			});
		}

		if (figmaData.paddingTop !== undefined) {
			console.log('[HELIX][Spacing Check] Found paddingTop:', figmaData.paddingTop);
			values.set('padding-top', {
				property: 'padding-top',
				value: `${figmaData.paddingTop}px`,
				location: 'figma'
			});
		}

		if (figmaData.paddingBottom !== undefined) {
			console.log('[HELIX][Spacing Check] Found paddingBottom:', figmaData.paddingBottom);
			values.set('padding-bottom', {
				property: 'padding-bottom',
				value: `${figmaData.paddingBottom}px`,
				location: 'figma'
			});
		}

		if (figmaData.itemSpacing !== undefined) {
			console.log('[HELIX][Spacing Check] Found itemSpacing (gap):', figmaData.itemSpacing);
			values.set('gap', {
				property: 'gap',
				value: `${figmaData.itemSpacing}px`,
				location: 'figma'
			});
		}

		console.log('[HELIX][Spacing Check] Total Figma spacing values extracted:', values.size);
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
		console.log(`[Helix][Spacing Check] Extracting ${this.config.name} from code...`);
		console.log(`[Helix][Spacing Check] Code files count:`, codeFiles.length);
		console.log(`[Helix][Spacing Check] Primary extractor type:`, this.config.extractor.type);

		// 首先尝试使用主提取器
		const primaryExtractor = this.extractorFactory.create(this.config.extractor);
		let values = await primaryExtractor.extract(codeFiles, designSystemTokens, runtimeConfig);

		console.log(`[Helix][Spacing Check] Primary extractor (${this.config.extractor.type}) found ${values.size} values`);
		if (values.size > 0) {
			console.log('[HELIX][Spacing Check] Primary extractor values:', Array.from(values.entries()));
		}

		// 如果主提取器没有结果，且有 fallback，尝试 fallback
		if (values.size === 0 && this.config.extractor.fallback) {
			console.log(`[Helix][Spacing Check] Trying fallback extractor (${this.config.extractor.fallback.type})...`);
			const fallbackExtractor = this.extractorFactory.create(this.config.extractor.fallback);
			values = await fallbackExtractor.extract(codeFiles, designSystemTokens, runtimeConfig);
			console.log(`[Helix][Spacing Check] Fallback extractor found ${values.size} values`);
			if (values.size > 0) {
				console.log('[HELIX][Spacing Check] Fallback extractor values:', Array.from(values.entries()));
			}
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
