import { ExtractorConfig, ComparatorConfig, NormalizerConfig } from '../configs/dimensionConfigs';
import { TokenExtractor } from './extractors/tokenExtractor';
import { CSSExtractor } from './extractors/cssExtractor';
import { ExactComparator } from './comparators/exactComparator';
import { FuzzyComparator } from './comparators/fuzzyComparator';
import { ColorNormalizer } from './normalizers/colorNormalizer';
import { UnitNormalizer } from './normalizers/unitNormalizer';

/**
 * 提取器工厂
 */
export class ExtractorFactory {
	create(config: ExtractorConfig): TokenExtractor | CSSExtractor {
		switch (config.type) {
			case 'token':
				return new TokenExtractor(config);
			case 'css':
				return new CSSExtractor(config);
			case 'ast':
				// AST 提取器暂未实现，降级到 CSS
				return new CSSExtractor(config);
			default:
				throw new Error(`Unknown extractor type: ${config.type}`);
		}
	}
}

/**
 * 对比器工厂
 */
export class ComparatorFactory {
	create(config: ComparatorConfig): ExactComparator | FuzzyComparator {
		switch (config.type) {
			case 'exact':
				return new ExactComparator(config);
			case 'fuzzy':
				return new FuzzyComparator(config);
			case 'semantic':
				// 语义对比器需要 LLM，暂不在工具模式支持
				throw new Error('Semantic comparator requires LLM mode');
			default:
				throw new Error(`Unknown comparator type: ${config.type}`);
		}
	}
}

/**
 * 规范化器工厂
 */
export class NormalizerFactory {
	create(config: NormalizerConfig | undefined): ColorNormalizer | UnitNormalizer | null {
		if (!config || config.type === 'none') {
			return null;
		}

		switch (config.type) {
			case 'color':
				return new ColorNormalizer(config);
			case 'unit':
				return new UnitNormalizer(config);
			default:
				return null;
		}
	}
}
