import { AgentExecutionPlan } from '../agents/IntentAnalyzerAgent';

/**
 * Predefined agent pipelines for different commands
 * Each command has a fixed agent execution order that can be refined by user prompt
 */

/**
 * Build from Figma pipeline
 * Standard flow: Analyze design → Map to design system → Plan → Generate code
 */
export const BUILD_FROM_FIGMA_PIPELINE: AgentExecutionPlan[] = [
  {
    agentName: 'FigmaAnalyzer',
    executionOrder: 1,
    parallelGroup: 1,
    inputs: {},
    dependencies: [],
  },
  {
    agentName: 'DesignSystemAnalyzer',
    executionOrder: 2,
    parallelGroup: 2,
    inputs: {},
    dependencies: [],
  },
  {
    agentName: 'Planner',
    executionOrder: 3,
    parallelGroup: 3,
    inputs: {},
    dependencies: ['DesignSystemAnalyzer'],
  },
  {
    agentName: 'CodeGenerator',
    executionOrder: 4,
    parallelGroup: 4,
    inputs: {},
    dependencies: ['Planner'],
  },
];

/**
 * Fit and Finish pipeline
 * Iterative refinement flow: Compare → Plan fixes → Generate code
 * Note: FigmaAnalyzer runs once at the start (handled by task)
 */
export const FIT_AND_FINISH_PIPELINE: AgentExecutionPlan[] = [
  {
    agentName: 'FigmaAnalyzer',
    executionOrder: 1,
    parallelGroup: 1,
    inputs: {},
    dependencies: [],
  },
  {
    agentName: 'Comparer',
    executionOrder: 2,
    parallelGroup: 2,
    inputs: {},
    dependencies: ['FigmaAnalyzer'],
  },
  {
    agentName: 'Planner',
    executionOrder: 3,
    parallelGroup: 3,
    inputs: {},
    dependencies: ['Comparer'],
  },
  {
    agentName: 'CodeGenerator',
    executionOrder: 4,
    parallelGroup: 4,
    inputs: {},
    dependencies: ['Planner'],
  },
];

/**
 * Command type for task execution
 */
export type CommandType = 'build-from-figma' | 'fit-and-finish';

/**
 * Get predefined pipeline for a command type
 */
export function getPredefinedPipeline(commandType: CommandType): AgentExecutionPlan[] {
  switch (commandType) {
    case 'build-from-figma':
      return BUILD_FROM_FIGMA_PIPELINE;
    case 'fit-and-finish':
      return FIT_AND_FINISH_PIPELINE;
    default:
      throw new Error(`Unknown command type: ${commandType}`);
  }
}
