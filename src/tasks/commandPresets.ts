import { AgentExecutionPlan } from '../agents/IntentAnalyzerAgent';

/**
 * Predefined agent pipelines for different commands
 * Each command has a fixed agent execution order that can be refined by user prompt
 */

/**
 * Build from Figma pipeline
 * Step 1 (Parallel): Fetch Figma + Design System
 * Step 2: Plan implementation
 * Step 3: Generate code
 */
export const BUILD_FROM_FIGMA_PIPELINE: AgentExecutionPlan[] = [
  {
    agentName: 'DesignSystemAnalyzer',
    executionOrder: 1,
    parallelGroup: 1,
    inputs: {
      // designSystemPath will be populated from taskInput in buildAgentInput
    },
    dependencies: [],
  },
  {
    agentName: 'FigmaAnalyzer',
    executionOrder: 2,
    parallelGroup: 2,
    inputs: {},
    dependencies: ['DesignSystemAnalyzer'],
  },
  {
    agentName: 'Planner',
    executionOrder: 3,
    parallelGroup: 3,
    inputs: {},
    dependencies: ['FigmaAnalyzer', 'DesignSystemAnalyzer'],
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
 * Step 1 (Parallel): Fetch Figma + Design System
 * Step 2: Compare design vs implementation
 */
export const FIT_AND_FINISH_PIPELINE: AgentExecutionPlan[] = [

  {
    agentName: 'DesignSystemAnalyzer',
    executionOrder: 1,
    parallelGroup: 1,
    inputs: {
      // designSystemPath will be populated from taskInput in buildAgentInput
    },
    dependencies: [],
  },
  {
    agentName: 'FigmaAnalyzer',
    executionOrder: 2,
    parallelGroup: 2,
    inputs: {},
    dependencies: ['DesignSystemAnalyzer'],
  },
  {
    agentName: 'Comparer',
    executionOrder: 3,
    parallelGroup: 3,
    inputs: {},
    dependencies: ['FigmaAnalyzer', 'DesignSystemAnalyzer'],
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
