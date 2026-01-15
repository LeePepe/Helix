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
    topLevelParts: Array<{
      id: string;
      name: string;
      role: string;
    }>;
    metadataSize: number;
    designContextSize: number;
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
  const rootParts = (analysis.root as any).parts || [];

  return {
    schemaVersion: analysis.schemaVersion,
    rootName: analysis.root.name,
    rootRole: analysis.root.role,
    totalParts,
    maxDepth,
    topLevelParts: rootParts.map((child: any) => ({
      id: child.id,
      name: child.name,
      role: child.role,
    })),
    metadataSize: analysis.metadata?.length || 0,
    designContextSize: analysis.designContext?.length || 0,
  };
}

/**
 * Summarize design system mapping to reduce token usage
 */
function summarizeDesignSystemMapping(mapping: DesignSystemMappingResult): SummarizedContext['designSystemMapping'] {
  const componentMappings = mapping.componentMappings || [];
  const tokenMappings = mapping.tokenMappings || [];
  const gaps = mapping.gaps || [];

  // Get high confidence mappings (>= 0.8)
  const highConfidenceMappings = componentMappings
    .filter(m => m.confidence >= 0.8)
    .map(m => `${m.uiPartId} → ${m.suggestedComponent}`);

  return {
    schemaVersion: mapping.schemaVersion,
    componentMappingCount: componentMappings.length,
    tokenMappingCount: tokenMappings.length,
    highConfidenceMappings,
    gaps: gaps.map(gap => ({
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
