/**
 * 维度配置接口
 * 用于定义统一的工具驱动 Agent 的行为
 */

export interface DimensionConfig {
	name: string;
	description: string;
	extractor: ExtractorConfig;
	comparator: ComparatorConfig;
	normalizer?: NormalizerConfig;
}

export interface ExtractorConfig {
	type: 'token' | 'css' | 'ast';
	tokenPath?: string;              // Token 路径，如 "tokens.color"
	cssSelectors?: string[];         // CSS 选择器
	astQuery?: string;               // AST 查询
	fallback?: ExtractorConfig;      // 降级提取器
}

export interface ComparatorConfig {
	type: 'exact' | 'fuzzy' | 'semantic';
	tolerance?: number;              // 用于 fuzzy 对比 (0-1)
	options?: Record<string, any>;   // 额外选项
}

export interface NormalizerConfig {
	type: 'color' | 'unit' | 'none';
	targetFormat?: string;           // 目标格式，如 "hex", "px"
}

/**
 * 提取结果
 */
export interface ExtractedValue {
	property: string;                // 属性名称，如 "primary", "heading1"
	value: any;                      // 提取的值
	location?: string;               // 来源位置
	metadata?: Record<string, any>;  // 额外元数据
}

/**
 * 对比差异
 */
export interface Difference {
	category: string;                // 维度类别
	severity: 'critical' | 'minor';  // 严重程度
	property: string;                // 属性名
	figmaValue: any;                 // Figma 中的值
	codeValue: any;                  // 代码中的值
	fix?: string;                    // 修复建议
	location?: string;               // 代码位置
}
