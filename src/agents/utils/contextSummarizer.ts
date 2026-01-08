import { FigmaAnalysisResult } from '../../contracts/figma';
import { DesignSystemMappingResult } from '../../contracts/designSystem';
import { CompareResult } from '../../contracts/compare';

/**
 * Summarized context for Planner to avoid token limit issues
 */
export interface SummarizedContext {
  figmaAnalysis?: {
    schemaVersion: string;
    rootName: string;
    rootRole: string;
    totalParts: number;
    maxDepth: number;
    caseCount: number;
    tokensHint?: {
      typography?: string[];
      colors?: string[];
      spacing?: string[];
      radius?: string[];
      shadows?: string[];
    };
    topLevelParts: Array<{
      id: string;
      name: string;
      role: string;
      childCount: number;
    }>;
    risks?: Array<{
      level: string;
      message: string;
    }>;
  };
  designSystemMapping?: {
    schemaVersion: string;
    componentMappingCount: number;
    tokenMappingCount: number;
    highConfidenceMappings: string[];
    gaps: Array<{
      level: string;
      message: string;
    }>;
  };
  compareResult?: {
    schemaVersion: string;
    score: number;
    diffCount: number;
    highSeverityDiffs: Array<{
      category: string;
      description: string;
      severity: string;
    }>;
    nextActions: Array<{
      title: string;
      description: string;
    }>;
  };
}

/**
 * Count total UI parts in a tree (recursive)
 */
function countUIParts(part: any): number {
  let count = 1;
  if (part.children) {
    for (const child of part.children) {
      count += countUIParts(child);
    }
  }
  return count;
}

/**
 * Calculate max depth of UI tree
 */
function calculateDepth(part: any, currentDepth = 1): number {
  if (!part.children || part.children.length === 0) {
    return currentDepth;
  }
  return Math.max(...part.children.map((child: any) => calculateDepth(child, currentDepth + 1)));
}

/**
 * Summarize Figma analysis to reduce token usage
 */
function summarizeFigmaAnalysis(analysis: FigmaAnalysisResult): SummarizedContext['figmaAnalysis'] {
  const totalParts = countUIParts(analysis.root);
  const maxDepth = calculateDepth(analysis.root);

  return {
    schemaVersion: analysis.schemaVersion,
    rootName: analysis.root.name,
    rootRole: analysis.root.role,
    totalParts,
    maxDepth,
    caseCount: analysis.cases.length,
    tokensHint: analysis.tokensHint,
    topLevelParts: (analysis.root.children || []).map((child: any) => ({
      id: child.id,
      name: child.name,
      role: child.role,
      childCount: child.children?.length || 0,
    })),
    risks: analysis.risks?.map(risk => ({
      level: risk.level,
      message: risk.message,
    })),
  };
}

/**
 * Summarize design system mapping to reduce token usage
 */
function summarizeDesignSystemMapping(mapping: DesignSystemMappingResult): SummarizedContext['designSystemMapping'] {
  // Get high confidence mappings (>= 0.8)
  const highConfidenceMappings = mapping.componentMappings
    .filter(m => m.confidence >= 0.8)
    .map(m => `${m.uiPartId} → ${m.suggestedComponent}`);

  return {
    schemaVersion: mapping.schemaVersion,
    componentMappingCount: mapping.componentMappings.length,
    tokenMappingCount: mapping.tokenMappings.length,
    highConfidenceMappings,
    gaps: mapping.gaps.map(gap => ({
      level: gap.level,
      message: gap.message,
    })),
  };
}

/**
 * Summarize compare result to reduce token usage
 */
function summarizeCompareResult(compareResult: CompareResult): SummarizedContext['compareResult'] {
  // Get high severity diffs
  const highSeverityDiffs = compareResult.diffs
    .filter(diff => diff.severity === 'high' || diff.severity === 'medium')
    .map(diff => ({
      category: diff.category,
      description: diff.description,
      severity: diff.severity,
    }));

  return {
    schemaVersion: compareResult.schemaVersion,
    score: compareResult.score,
    diffCount: compareResult.diffs.length,
    highSeverityDiffs,
    nextActions: compareResult.nextActions.map(action => ({
      title: action.title,
      description: action.description,
    })),
  };
}

/**
 * Summarize the full context for Planner
 * This removes trace events and summarizes large data structures
 */
export function summarizeContextForPlanner(context: {
  figmaAnalysis?: FigmaAnalysisResult;
  designSystemMapping?: DesignSystemMappingResult;
  compareResult?: CompareResult;
}): SummarizedContext {
  const summarized: SummarizedContext = {};

  if (context.figmaAnalysis) {
    summarized.figmaAnalysis = summarizeFigmaAnalysis(context.figmaAnalysis);
  }

  if (context.designSystemMapping) {
    summarized.designSystemMapping = summarizeDesignSystemMapping(context.designSystemMapping);
  }

  if (context.compareResult) {
    summarized.compareResult = summarizeCompareResult(context.compareResult);
  }

  return summarized;
}
