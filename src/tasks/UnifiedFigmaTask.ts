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
import { PlannerAgent } from '../agents/PlannerAgent';
import { CodeGeneratorAgent } from '../agents/CodeGeneratorAgent';
import { ComparerAgent } from '../agents/ComparerAgent';

/**
 * Input for UnifiedFigma task
 * Supports both build-from-scratch and iterative refinement scenarios
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

  // Refinement mode
  maxIterations: z.number().optional(),
  qualityThreshold: z.number().default(90),
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
 * Supports both:
 * - Build from Figma: analyze -> design system -> plan -> codegen
 * - Fit & Finish: compare -> plan -> codegen (iterative)
 */
export class UnifiedFigmaTask extends BaseTask<UnifiedFigmaInput, UnifiedFigmaOutput> {
  readonly name = 'UnifiedFigma';
  readonly description = 'Intelligently build or refine UI from Figma based on user intent';
  readonly inputSchema = UnifiedFigmaInputSchema;
  readonly outputSchema = UnifiedFigmaOutputSchema;

  private agentInstances = new Map<string, any>([
    ['FigmaAnalyzer', new FigmaAnalyzerAgent()],
    ['DesignSystemAnalyzer', new DesignSystemAnalyzerAgent()],
    ['Planner', new PlannerAgent()],
    ['CodeGenerator', new CodeGeneratorAgent()],
    ['Comparer', new ComparerAgent()],
  ]);

  protected async execute(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    artifacts: ArtifactStore,
    stream: StreamHandler,
    input: UnifiedFigmaInput
  ): Promise<UnifiedFigmaOutput> {
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

    // Check if this is an iterative refinement task
    const isIterative = intentAnalysis.selectedAgents.some(a => a.agentName === 'Comparer');
    
    if (isIterative) {
      return await this.executeIterativeRefinement(
        ctx, tools, artifacts, stream, input, intentAnalysis
      );
    } else {
      return await this.executeBuildPipeline(
        ctx, tools, artifacts, stream, input, intentAnalysis
      );
    }
  }

  /**
   * Execute build-from-scratch pipeline
   */
  private async executeBuildPipeline(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    artifacts: ArtifactStore,
    stream: StreamHandler,
    input: UnifiedFigmaInput,
    intentAnalysis: any
  ): Promise<UnifiedFigmaOutput> {
    stream.markdown('## Building from Figma\n');

    const agentResults: AgentResults = {};
    const executedAgents: string[] = [];

    // Execute agents according to plan
    const executionGroups = this.groupByParallel(intentAnalysis.selectedAgents);

    for (const group of executionGroups) {
      if (group.length === 1) {
        // Sequential execution
        const plan = group[0];
        stream.progress(`Executing ${plan.agentName}...`);

        const result = await this.executeAgent(
          plan, agentResults, ctx, tools, artifacts, input
        );

        agentResults[plan.agentName] = result;
        executedAgents.push(plan.agentName);

        // Display metrics for this agent
        const metrics = ctx.getAgentMetrics();
        const lastMetric = metrics[metrics.length - 1];
        if (lastMetric) {
          stream.displayAgentMetrics(lastMetric);
        }
      } else {
        // Parallel execution
        stream.progress(`Executing ${group.map(p => p.agentName).join(', ')} in parallel...`);

        const beforeMetricsCount = ctx.getAgentMetrics().length;

        const results = await Promise.all(
          group.map(plan =>
            this.executeAgent(plan, agentResults, ctx, tools, artifacts, input)
          )
        );

        group.forEach((plan, idx) => {
          agentResults[plan.agentName] = results[idx];
          executedAgents.push(plan.agentName);
        });

        // Display metrics for parallel agents
        const allMetrics = ctx.getAgentMetrics();
        const newMetrics = allMetrics.slice(beforeMetricsCount);
        newMetrics.forEach(metric => {
          stream.displayAgentMetrics(metric);
        });
      }
    }

    // Extract codegen results
    const codegenResults = agentResults['CodeGenerator']?.codegenResults || [];

    // Apply changes if not in dry-run mode
    if (!ctx.settings.dryRun && codegenResults.length > 0) {
      await this.applyCodeChanges(codegenResults, ctx, tools, stream);
    }

    const totalFiles = codegenResults.reduce((sum: number, r: any) => sum + r.files.length, 0);
    const summary = `Generated ${totalFiles} file changes using ${executedAgents.length} agents`;

    // Display summary of all metrics
    stream.displayMetricsSummary(ctx.getAgentMetrics());

    return {
      intent: intentAnalysis.intent,
      executedAgents,
      codegenResults,
      summary,
    };
  }

  /**
   * Execute iterative refinement pipeline
   */
  private async executeIterativeRefinement(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    artifacts: ArtifactStore,
    stream: StreamHandler,
    input: UnifiedFigmaInput,
    intentAnalysis: any
  ): Promise<UnifiedFigmaOutput> {
    stream.markdown('## Iterative Refinement\n');

    const maxIterations = input.maxIterations || ctx.settings.maxIterations || 3;
    const qualityThreshold = input.qualityThreshold || 90;
    
    const iterations: Array<{
      compareResult: CompareResult;
      codegenResults: CodegenResult[];
    }> = [];
    
    const executedAgents: string[] = [];

    // First, analyze Figma design (needed for comparison)
    stream.progress('Analyzing Figma design...');
    const figmaAgent = this.agentInstances.get('FigmaAnalyzer');
    const figmaAnalysis = await figmaAgent.run(ctx, tools, {
      nodeId: input.nodeId,
      forceCode: input.forceCode,
    });

    // Display FigmaAnalyzer metrics
    const metrics = ctx.getAgentMetrics();
    if (metrics.length > 0) {
      stream.displayAgentMetrics(metrics[metrics.length - 1]);
    }

    await artifacts.set(
      { runId: ctx.runId, name: 'figmaAnalysis' },
      figmaAnalysis
    );
    executedAgents.push('FigmaAnalyzer');

    for (let i = 0; i < maxIterations; i++) {
      stream.markdown(`### Iteration ${i + 1}\n`);

      const agentResults: AgentResults = {
        FigmaAnalyzer: { figmaAnalysis },
      };

      // Execute agents for this iteration
      const executionGroups = this.groupByParallel(
        intentAnalysis.selectedAgents.filter((a: any) => a.agentName !== 'FigmaAnalyzer')
      );

      for (const group of executionGroups) {
        if (group.length === 1) {
          const plan = group[0];
          stream.progress(`Executing ${plan.agentName}...`);

          const beforeMetricsCount = ctx.getAgentMetrics().length;

          const result = await this.executeAgent(
            plan, agentResults, ctx, tools, artifacts, input
          );

          agentResults[plan.agentName] = result;
          if (!executedAgents.includes(plan.agentName)) {
            executedAgents.push(plan.agentName);
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
            group.map(plan =>
              this.executeAgent(plan, agentResults, ctx, tools, artifacts, input)
            )
          );

          group.forEach((plan, idx) => {
            agentResults[plan.agentName] = results[idx];
            if (!executedAgents.includes(plan.agentName)) {
              executedAgents.push(plan.agentName);
            }
          });

          // Display metrics for parallel agents
          const allMetrics = ctx.getAgentMetrics();
          const newMetrics = allMetrics.slice(beforeMetricsCount);
          newMetrics.forEach(metric => {
            stream.displayAgentMetrics(metric);
          });
        }
      }

      const compareResult = agentResults['Comparer'];
      const codegenResults = agentResults['CodeGenerator']?.codegenResults || [];

      iterations.push({ compareResult, codegenResults });

      stream.markdown(
        `**Score:** ${compareResult.score}/100\n\n` +
        `**Issues:** ${compareResult.diffs?.length || 0} differences found\n`
      );

      // Check if quality threshold reached
      if (compareResult.score >= qualityThreshold) {
        stream.markdown('✅ Quality threshold reached!\n');
        break;
      }

      // Apply changes for next iteration
      if (!ctx.settings.dryRun && codegenResults.length > 0) {
        await this.applyCodeChanges(codegenResults, ctx, tools, stream);
      }
    }

    const finalScore = iterations[iterations.length - 1]?.compareResult.score || 0;
    const summary =
      `Completed ${iterations.length} iterations using ${executedAgents.length} unique agents. ` +
      `Final score: ${finalScore}/100`;

    // Display summary of all metrics
    stream.displayMetricsSummary(ctx.getAgentMetrics());

    return {
      intent: intentAnalysis.intent,
      executedAgents,
      iterations,
      finalScore,
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
    taskInput: UnifiedFigmaInput
  ): Promise<any> {
    const agent = this.agentInstances.get(plan.agentName);
    if (!agent) {
      throw new Error(`Agent ${plan.agentName} not found`);
    }

    // Build agent input from plan, previous results, and task input
    const agentInput = this.buildAgentInput(
      plan, agentResults, taskInput
    );

    // Execute agent
    const result = await agent.run(ctx, tools, agentInput);

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
        break;

      case 'Planner':
        input.goal = input.goal || 'Implement UI components from design';
        input.context = {
          figmaAnalysis: agentResults['FigmaAnalyzer']?.figmaAnalysis,
          designSystemMapping: agentResults['DesignSystemAnalyzer'],
          compareResult: agentResults['Comparer'],
        };
        break;

      case 'CodeGenerator':
        const plan = agentResults['Planner'];
        input.subtask = plan?.subtasks?.[0] || { title: 'Generate code', description: 'Generate code from design' };
        input.context = {
          figmaAnalysis: agentResults['FigmaAnalyzer']?.figmaAnalysis,
          designSystemMapping: agentResults['DesignSystemAnalyzer'],
          compareResult: agentResults['Comparer'],
        };
        // Return wrapped result for consistency
        return { codegenResults: [input] };

      case 'Comparer':
        input.figmaData = agentResults['FigmaAnalyzer']?.figmaAnalysis;
        input.implementationContext = {
          note: 'Implementation context from generated code',
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
