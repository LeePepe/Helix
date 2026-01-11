import { z } from 'zod';
import { BaseTask } from './base/Task';
import { CodegenResult, CodegenResultSchema, CompareResult } from '../contracts';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ToolRegistry } from '../runtime/ToolRegistry';
import { ArtifactStore } from '../runtime/ArtifactStore';
import { StreamHandler } from '../runtime/StreamHandler';
import { IntentAnalyzerAgent, AgentExecutionPlan } from '../agents/IntentAnalyzerAgent';
import { FigmaAnalyzerAgent } from '../agents/FigmaAnalyzerAgent';
import { DesignSystemAnalyzerAgent } from '../agents/DesignSystemAnalyzerAgent';
import { isDebugMode } from '../utils/debug';
import { PlannerAgent } from '../agents/PlannerAgent';
import { CodeGeneratorAgent } from '../agents/CodeGeneratorAgent';
import { ComparerAgent } from '../agents/ComparerAgent';
import { summarizeContextForPlanner } from '../agents/utils/contextSummarizer';

/**
 * Input for UnifiedFigma task
 */
export const UnifiedFigmaInputSchema = z.object({
  // Common
  userPrompt: z.string().optional().describe('User\'s natural language description of what they want'),
  nodeId: z.string().optional().describe('Figma node ID to analyze'),

  // Predefined pipeline from command
  predefinedAgents: z.array(z.any()).optional().describe('Predefined agent execution plan from command'),

  // Build mode
  designSystemPath: z.string().optional(),
  forceCode: z.boolean().optional(),
});

export type UnifiedFigmaInput = z.infer<typeof UnifiedFigmaInputSchema>;

/**
 * Output for UnifiedFigma task
 */
export const UnifiedFigmaOutputSchema = z.object({
  intent: z.string(),
  executedAgents: z.array(z.string()),
  codegenResults: z.array(CodegenResultSchema).optional(),
  iterations: z.array(
    z.object({
      compareResult: z.any(),
      codegenResults: z.array(CodegenResultSchema),
    })
  ).optional(),
  finalScore: z.number().optional(),
  summary: z.string(),
});

export type UnifiedFigmaOutput = z.infer<typeof UnifiedFigmaOutputSchema>;

/**
 * Agent result storage
 */
interface AgentResults {
  [agentName: string]: any;
}

/**
 * UnifiedFigma Task
 * Intelligently determines and executes the required agents based on user intent
 */
export class UnifiedFigmaTask extends BaseTask<UnifiedFigmaInput, UnifiedFigmaOutput> {
  readonly name = 'UnifiedFigma';
  readonly description = 'Intelligently build or refine UI from Figma based on user intent';
  readonly inputSchema = UnifiedFigmaInputSchema as z.ZodType<UnifiedFigmaInput>;
  readonly outputSchema = UnifiedFigmaOutputSchema;


  protected async execute(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    artifacts: ArtifactStore,
    stream: StreamHandler,
    input: UnifiedFigmaInput
  ): Promise<UnifiedFigmaOutput> {
    console.log('[Helix] [UnifiedFigmaTask] 🚀 Task execution started');
    console.log('[Helix] [UnifiedFigmaTask] Input nodeId:', input.nodeId);
    console.log('[Helix] [UnifiedFigmaTask] Input userPrompt:', input.userPrompt);
    console.log('[Helix] [UnifiedFigmaTask] Input designSystemPath:', input.designSystemPath);
    console.log('[Helix] [UnifiedFigmaTask] Input predefinedAgents:', input.predefinedAgents?.map(a => a.agentName).join(', '));

    // Validate that designSystemPath is provided at task level
    if (!input.designSystemPath) {
      console.warn('[Helix] [UnifiedFigmaTask] ⚠️ No designSystemPath provided in task input');
    }

    // Step 1: Analyze user intent (with optional predefined agents)
    stream.markdown('## Analyzing Intent\n');
    const intentAnalyzer = new IntentAnalyzerAgent();

    const intentAnalysis = await intentAnalyzer.run(ctx, tools, {
      userPrompt: input.userPrompt || 'Build UI from Figma design',
      taskInput: input,
      predefinedAgents: input.predefinedAgents, // Pass predefined agents from command
    });

    stream.markdown(`**Intent:** ${intentAnalysis.intent}\n`);
    stream.markdown(`**Selected Agents:** ${intentAnalysis.selectedAgents.map(a => a.agentName).join(' → ')}\n`);
    stream.markdown(`**Reasoning:** ${intentAnalysis.reasoning}\n\n`);

    // // DEBUG: Only execute FigmaAnalyzer and DesignSystemAnalyzer to debug
    // console.warn('[Helix] [DEBUG] Temporarily disabling other agents. Only FigmaAnalyzer and DesignSystemAnalyzer will run.');
    // intentAnalysis.selectedAgents = intentAnalysis.selectedAgents.filter(
    //   (a: any) =>  a.agentName === 'FigmaAnalyzer' || a.agentName === 'DesignSystemAnalyzer'
    // );
    // if (intentAnalysis.selectedAgents.length === 0) {
    //   intentAnalysis.selectedAgents = [
    //     { agentName: 'DesignSystemAnalyzer', executionOrder: 1, parallelGroup: 1, inputs: {}, dependencies: [] },
    //     { agentName: 'FigmaAnalyzer', executionOrder: 1, parallelGroup: 1, inputs: {}, dependencies: [] }
    //   ];
    // }
    // stream.markdown('> ⚠️ **DEBUG MODE**: Only `FigmaAnalyzer` and `DesignSystemAnalyzer` are enabled.\n\n');

    // Step 2: Execute workflow
    stream.markdown('## Executing Workflow\n');

    const executedAgents: string[] = [];
    let codegenResults: CodegenResult[] = [];
    let compareResult: CompareResult | undefined;

    // Execute agents according to plan (uses shared helper)
    const executionGroups = this.groupByParallel(intentAnalysis.selectedAgents);

    const { executed: executedFromGroups, codegen: cgFromGroups = [], compare: cmpFromGroups } =
      await this.executeGroups(executionGroups, {}, ctx, tools, artifacts, input, stream);

    executedAgents.push(...executedFromGroups);
    codegenResults = cgFromGroups || codegenResults;
    compareResult = cmpFromGroups || compareResult;

    // Apply code changes if CodeGenerator was executed
    if (codegenResults.length > 0 && !ctx.settings.dryRun) {
      await this.applyCodeChanges(codegenResults, ctx, tools, stream);
    }

    const totalFiles = codegenResults.reduce((sum: number, r: any) => sum + (r?.files?.length || 0), 0);

    let summary: string;
    if (compareResult) {
      summary = `Comparison complete. Score: ${compareResult.score}/100, Found ${compareResult.diffs?.length || 0} differences`;
    } else if (totalFiles > 0) {
      summary = `Generated ${totalFiles} file changes using ${executedAgents.length} agents`;
    } else {
      summary = `Executed ${executedAgents.length} agents`;
    }

    // Display agent flow visualization
    stream.displayAgentFlow();

    // Display summary of all metrics
    stream.displayMetricsSummary(ctx.getAgentMetrics());

    return {
      intent: intentAnalysis.intent,
      executedAgents,
      codegenResults: codegenResults.length > 0 ? codegenResults : undefined,
      finalScore: compareResult?.score,
      summary,
    };
  }


  /**
   * Execute a single agent with proper context
   */
  private async executeAgent(
    plan: AgentExecutionPlan,
    agentResults: AgentResults,
    ctx: ExecutionContext,
    tools: ToolRegistry,
    artifacts: ArtifactStore,
    taskInput: UnifiedFigmaInput,
    stream?: StreamHandler
  ): Promise<any> {
    // Create agent instance dynamically based on agent name
    let agent: any;
    switch (plan.agentName) {
      case 'FigmaAnalyzer':
        agent = new FigmaAnalyzerAgent();
        break;
      case 'DesignSystemAnalyzer':
        agent = new DesignSystemAnalyzerAgent();
        break;
      case 'Planner':
        agent = new PlannerAgent();
        break;
      case 'CodeGenerator':
        agent = new CodeGeneratorAgent();
        break;
      case 'Comparer':
        agent = new ComparerAgent();
        break;
      default:
        throw new Error(`Agent ${plan.agentName} not found`);
    }

    // Build agent input from plan, previous results, and task input
    const agentInput = this.buildAgentInput(
      plan, agentResults, taskInput
    );

    // Execute agent with stream support
    const result = await agent.run(ctx, tools, agentInput, stream);

    // Store result in artifacts
    await artifacts.set(
      { runId: ctx.runId, name: `${plan.agentName}-${Date.now()}` },
      result
    );

    return result;
  }

  /**
   * Build input for an agent based on execution plan and previous results
   */
  private buildAgentInput(
    plan: AgentExecutionPlan,
    agentResults: AgentResults,
    taskInput: UnifiedFigmaInput
  ): any {
    const input: any = { ...plan.inputs };

    // Map agent-specific inputs
    switch (plan.agentName) {
      case 'FigmaAnalyzer':
        input.nodeId = input.nodeId || taskInput.nodeId;
        input.forceCode = input.forceCode || taskInput.forceCode;
        break;

      case 'DesignSystemAnalyzer':
        input.figmaAnalysis = agentResults['FigmaAnalyzer']?.figmaAnalysis;
        input.designSystemPath = input.designSystemPath || taskInput.designSystemPath;
        console.log('[Helix] [DesignSystemAnalyzer] input.designSystemPath:', input.designSystemPath);
        console.log('[Helix] [DesignSystemAnalyzer] taskInput.designSystemPath:', taskInput.designSystemPath);

        // Validate that designSystemPath is provided
        if (!input.designSystemPath) {
          throw new Error(
            'Design system path is required for DesignSystemAnalyzer. ' +
            'Please configure it in settings (helix.designSystemPath) or provide it in the task input.'
          );
        }
        break;

      case 'Planner':
        input.goal = input.goal || 'Implement UI components from design';
        // Summarize context to avoid token limit issues
        input.context = summarizeContextForPlanner({
          figmaAnalysis: agentResults['FigmaAnalyzer']?.figmaAnalysis,
          designSystemMapping: agentResults['DesignSystemAnalyzer'],
          compareResult: agentResults['Comparer'],
        });
        break;

      case 'CodeGenerator':
        // Pass subtask and context from Planner
        const plan = agentResults['Planner'];
        input.subtask = plan?.subtasks?.[0] || { title: 'Generate code', description: 'Generate code from design' };
        input.goal = input.goal || taskInput.userPrompt || 'Generate code from design';
        // Summarize context to avoid token limit issues
        input.context = summarizeContextForPlanner({
          figmaAnalysis: agentResults['FigmaAnalyzer']?.figmaAnalysis,
          designSystemMapping: agentResults['DesignSystemAnalyzer'],
          compareResult: agentResults['Comparer'],
        });
        break;

      case 'Comparer':
        // Pass data from previous agents
        input.figmaData = agentResults['FigmaAnalyzer']?.figmaAnalysis;
        input.implementationContext = {
          designSystemMapping: agentResults['DesignSystemAnalyzer'],
          note: 'Implementation context from design system analysis',
        };
        break;
    }

    return input;
  }

  /**
   * Group agents by parallel execution group
   */
  private groupByParallel(agents: AgentExecutionPlan[]): AgentExecutionPlan[][] {
    const sorted = [...agents].sort((a, b) => a.executionOrder - b.executionOrder);
    const groups: AgentExecutionPlan[][] = [];
    
    let currentGroup: AgentExecutionPlan[] = [];
    let currentParallelGroup = -1;

    for (const agent of sorted) {
      if (agent.parallelGroup !== currentParallelGroup) {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [agent];
        currentParallelGroup = agent.parallelGroup;
      } else {
        currentGroup.push(agent);
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Execute grouped agent plans (parallel groups) and handle metrics and result collection.
   * Returns executed agent names, collected codegen results array, and last comparer result.
   */
  private async executeGroups(
    groups: AgentExecutionPlan[][],
    agentResults: AgentResults,
    ctx: ExecutionContext,
    tools: ToolRegistry,
    artifacts: ArtifactStore,
    taskInput: UnifiedFigmaInput,
    stream: StreamHandler
  ): Promise<{ executed: string[]; codegen?: CodegenResult[]; compare?: any }> {
    const executed: string[] = [];
    let codegenResults: CodegenResult[] = [];
    let compareResult: any;

    for (const group of groups) {
      if (group.length === 1) {
        const plan = group[0];
        stream.progress(`Executing ${plan.agentName}...`);

        const beforeMetricsCount = ctx.getAgentMetrics().length;

        const result = await this.executeAgent(plan, agentResults, ctx, tools, artifacts, taskInput, stream);

        agentResults[plan.agentName] = result;
        executed.push(plan.agentName);
        
        


        if (plan.agentName === 'CodeGenerator') {
          codegenResults = result?.codegenResults || [result];
        } else if (plan.agentName === 'Comparer') {
          compareResult = result;
        }

        // Display metrics for this agent
        const allMetrics = ctx.getAgentMetrics();
        if (allMetrics.length > beforeMetricsCount) {
          stream.displayAgentMetrics(allMetrics[allMetrics.length - 1]);
        }
      } else {
        stream.progress(`Executing ${group.map(p => p.agentName).join(', ')} in parallel...`);

        const beforeMetricsCount = ctx.getAgentMetrics().length;

        const results = await Promise.all(
          group.map(plan => this.executeAgent(plan, agentResults, ctx, tools, artifacts, taskInput, stream))
        );

        group.forEach((plan, idx) => {
          agentResults[plan.agentName] = results[idx];
          executed.push(plan.agentName);

          const result = results[idx];
        
          if (plan.agentName === 'CodeGenerator') {
            codegenResults = results[idx]?.codegenResults || [results[idx]];
          } else if (plan.agentName === 'Comparer') {
            compareResult = results[idx];
          }
        });

        // Display metrics for parallel agents
        const allMetrics = ctx.getAgentMetrics();
        const newMetrics = allMetrics.slice(beforeMetricsCount);
        newMetrics.forEach(metric => stream.displayAgentMetrics(metric));
      }
    }

    return { executed, codegen: codegenResults, compare: compareResult };
  }

  /**
   * Apply code changes to workspace
   */
  private async applyCodeChanges(
    codegenResults: CodegenResult[],
    ctx: ExecutionContext,
    tools: ToolRegistry,
    stream: StreamHandler
  ): Promise<void> {
    let filesWritten = 0;

    for (const result of codegenResults) {
      for (const file of result.files) {
        if (file.action === 'create' || file.action === 'modify') {
          if (file.content) {
            await tools.invoke(ctx, 'workspace.writeFile', {
              filePath: file.path,
              content: file.content,
            });
            filesWritten++;
          }
        }
      }
    }

    stream.markdown(`✅ Applied changes to ${filesWritten} files\n`);
  }

  
}
