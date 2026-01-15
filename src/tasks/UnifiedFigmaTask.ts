import { z } from 'zod';
import { ChatPromptReferenceSchema } from '../contracts/common';
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
import { CodeAnalyzerAgent } from '../agents/CodeAnalyzerAgent';
import { LLMService } from '../services/llmService';
import { summarizeContextForPlanner } from '../agents/utils/contextSummarizer';

/**
 * Input for UnifiedFigma task
 */
export const UnifiedFigmaInputSchema = z.object({
  // Common
  userPrompt: z.string().optional().describe('User\'s natural language description of what they want'),
  nodeId: z.string().optional().describe('Figma node ID or URL(s) to analyze - supports multiple URLs separated by spaces, commas, or newlines'),
  nodeIds: z.array(z.string()).optional().describe('Explicit array of Figma node IDs (takes precedence over nodeId if provided)'),
  // Optional list of user-provided chat prompt references to guide generation
  userReferences: z.array(ChatPromptReferenceSchema).optional().describe('List of user-provided references (URLs or notes)'),

  // Predefined pipeline from command
  predefinedAgents: z.array(z.any()).optional().describe('Predefined agent execution plan from command'),

  // Build mode
  designSystemPath: z.string().optional(),
  filePaths: z.array(z.string()).optional(),
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
    console.log('[Helix] [UnifiedFigmaTask] Input nodeId type:', typeof input.nodeId);
    console.log('[Helix] [UnifiedFigmaTask] Input nodeId length:', input.nodeId?.length);
    console.log('[Helix] [UnifiedFigmaTask] Input nodeIds:', input.nodeIds);
    console.log('[Helix] [UnifiedFigmaTask] Input userPrompt:', input.userPrompt);
    console.log('[Helix] [UnifiedFigmaTask] Input designSystemPath:', input.designSystemPath);
    console.log('[Helix] [UnifiedFigmaTask] Input userReferences:', input.userReferences);
    console.log('[Helix] [UnifiedFigmaTask] Input predefinedAgents:', input.predefinedAgents?.map(a => a.agentName).join(', '));

    // Validate that designSystemPath is provided at task level
    if (!input.designSystemPath) {
      console.warn('[Helix] [UnifiedFigmaTask] ⚠️ No designSystemPath provided in task input');
    }

    // Step 1: Analyze user intent (with optional predefined agents)
    stream.markdown('## Analyzing Intent\n');

    // If debug mode is enabled, skip intent analysis and force CodeAnalyzer only.
    let intentAnalysis: any;
    if (false) {
      console.warn('[Helix] [DEBUG] Debug mode enabled. Skipping intent analysis and forcing FigmaAnalyzer.');
      stream.markdown('> ⚠️ **DEBUG MODE**: Skipping intent analysis. Only `FigmaAnalyzer` will run.\n\n');
      intentAnalysis = {
        intent: 'Debug - Figma Analysis Only',
        reasoning: 'Debug mode shortcut: bypassing intent detection.',
        selectedAgents: [
          { agentName: 'FigmaAnalyzer', executionOrder: 1, parallelGroup: 1, inputs: {}, dependencies: [] }
        ]
      };
      console.log('[Helix] [UnifiedFigmaTask] Selected agents (ordered):', intentAnalysis.selectedAgents.map((a: any) => a.agentName).join(', '));
    } else {
      const intentAnalyzer = new IntentAnalyzerAgent();

      intentAnalysis = await intentAnalyzer.run(ctx, tools, {
        userPrompt: input.userPrompt || 'Build UI from Figma design',
        taskInput: input,
        predefinedAgents: input.predefinedAgents, // Pass predefined agents from command
      });

      stream.markdown(`**Intent:** ${intentAnalysis.intent}\n`);
      const selectedNames = intentAnalysis.selectedAgents.map((a: any) => a.agentName);
      console.log('[Helix] [UnifiedFigmaTask] Selected agents (ordered):', selectedNames.join(', '));
      stream.markdown(`**Selected Agents:** ${selectedNames.join(' → ')}\n`);
      if (intentAnalysis.focusAreas) {
        stream.markdown(`**Focus Areas:** ${intentAnalysis.focusAreas}\n`);
        console.log('[Helix] [UnifiedFigmaTask] Focus areas:', intentAnalysis.focusAreas);
      }
      stream.markdown(`**Reasoning:** ${intentAnalysis.reasoning}\n\n`);
    }

    // Step 2: Execute workflow
    stream.markdown('## Executing Workflow\n');

    const executedAgents: string[] = [];
    let codegenResults: CodegenResult[] = [];
    let compareResult: CompareResult | undefined;

    // Execute agents according to plan (uses shared helper)
    const executionGroups = this.groupByParallel(intentAnalysis.selectedAgents);

    const { executed: executedFromGroups, codegen: cgFromGroups = [], compare: cmpFromGroups } =
      await this.executeGroups(executionGroups, {}, ctx, tools, artifacts, input, stream, intentAnalysis.focusAreas);

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
      summary = `Comparison complete. Found ${compareResult.diffs?.length || 0} differences`;
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
    _artifacts: ArtifactStore,
    taskInput: UnifiedFigmaInput,
    stream?: StreamHandler,
    focusAreas?: string
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
      case 'CodeAnalyzer':
        agent = new CodeAnalyzerAgent(new LLMService());
        break;
        break;
      default:
        throw new Error(`Agent ${plan.agentName} not found`);
    }

    console.log(`[Helix] [UnifiedFigmaTask] buildAgentInput for ${plan.agentName} - current agentResults keys:`, Object.keys(agentResults));
    // Build agent input from plan, previous results, and task input
    const agentInput = this.buildAgentInput(
      plan, agentResults, taskInput, focusAreas
    );
    console.log(`[Helix] [UnifiedFigmaTask] Executing agent: ${plan.agentName} with input keys:`, Object.keys(agentInput));

    if (plan.agentName === 'Comparer') {
      console.log('[Helix] [UnifiedFigmaTask] Comparer selected - agentResults snapshot:', Object.keys(agentResults));
    }
    // Execute agent with stream support
    const result = await agent.run(ctx, tools, agentInput, stream);

    // Note: Artifact persistence disabled - results are kept in memory only
    // If you need to persist results for debugging, uncomment the following:
    // await artifacts.set(
    //   { runId: ctx.runId, name: `${plan.agentName}-${Date.now()}` },
    //   result
    // );

    return result;
  }

  /**
   * Build input for an agent based on execution plan and previous results
   */
  private buildAgentInput(
    plan: AgentExecutionPlan,
    agentResults: AgentResults,
    taskInput: UnifiedFigmaInput,
    focusAreas?: string
  ): any {
    const input: any = { ...plan.inputs };

    // Add focusAreas to input if provided
    if (focusAreas) {
      input.focusAreas = focusAreas;
    }

    // Map agent-specific inputs
    switch (plan.agentName) {
      case 'FigmaAnalyzer':
        input.nodeId = input.nodeId || taskInput.nodeId;
        input.nodeIds = input.nodeIds || taskInput.nodeIds;
        input.forceCode = input.forceCode || taskInput.forceCode;
        break;

      case 'DesignSystemAnalyzer':
        input.figmaAnalysis = agentResults['FigmaAnalyzer'];
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

      case 'CodeAnalyzer':
        input.userPrompt = input.userPrompt || taskInput.userPrompt;
        input.userReferences = input.userReferences || taskInput.userReferences;
        break;

      case 'Planner':
        input.goal = input.goal || 'Implement UI components from design';
        // Summarize context to avoid token limit issues
        input.context = summarizeContextForPlanner({
          figmaAnalysis: agentResults['FigmaAnalyzer'],
          designSystemMapping: agentResults['DesignSystemAnalyzer'],
          compareResult: agentResults['Comparer'],
        });
        break;

      case 'CodeGenerator':
        input.goal = input.goal || taskInput.userPrompt || 'Generate code from design';

        // Provide figmaAnalysis and designSystem for BUILD or FIX modes
        input.figmaAnalysis = agentResults['FigmaAnalyzer'];
        input.designSystem = agentResults['DesignSystemAnalyzer'];

        // If Comparer result exists, it's FIX mode - provide compareResult and existingCode
        if (agentResults['Comparer']) {
          input.compareResult = agentResults['Comparer'];

          // Get existing code paths from CodeAnalyzer if available
          // CodeAnalyzer returns { implementationContext: { files: string[] } }
          if (agentResults['CodeAnalyzer']?.implementationContext?.files) {
            const filePaths = agentResults['CodeAnalyzer'].implementationContext.files;

            // Convert string array to array of objects with path and empty content
            // CodeGenerator will read the actual file contents
            input.existingCode = (Array.isArray(filePaths) ? filePaths : []).map((path: string) => ({
              path,
              content: '', // Empty content - will be read by CodeGenerator
            }));

            console.log(`[UnifiedFigmaTask] Prepared ${input.existingCode.length} files for FIX mode:`,
              input.existingCode.map((f: { path: string; content: string }) => f.path).join(', '));
          }
        }
        // Otherwise it's BUILD mode - figmaAnalysis and designSystem are already set
        break;

      case 'Comparer':
        // Pass data from previous agents
        input.figmaData = agentResults['FigmaAnalyzer'];
        input.designSystem = agentResults['DesignSystemAnalyzer'];

        // Use CodeAnalyzer result if available
        if (agentResults['CodeAnalyzer']) {
           console.log('[Helix] [UnifiedFigmaTask] CodeAnalyzer result:', JSON.stringify(agentResults['CodeAnalyzer'], null, 2));
           console.log('[Helix] [UnifiedFigmaTask] CodeAnalyzer implementationContext:', agentResults['CodeAnalyzer'].implementationContext);

           input.codeFiles = agentResults['CodeAnalyzer'].implementationContext;

           console.log('[Helix] [UnifiedFigmaTask] Setting input.codeFiles to:', JSON.stringify(input.codeFiles, null, 2));
           console.log('[Helix] [UnifiedFigmaTask] input.codeFiles type:', typeof input.codeFiles);
           console.log('[Helix] [UnifiedFigmaTask] input.codeFiles.files:', input.codeFiles?.files);
        } else {
           console.log('[Helix] [UnifiedFigmaTask] No CodeAnalyzer result available');
        }

        console.log('[Helix] [UnifiedFigmaTask] Final Comparer input.codeFiles:', JSON.stringify(input.codeFiles, null, 2));
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
    stream: StreamHandler,
    focusAreas?: string
  ): Promise<{ executed: string[]; codegen?: CodegenResult[]; compare?: any }> {
    const executed: string[] = [];
    let codegenResults: CodegenResult[] = [];
    let compareResult: any;

    for (const group of groups) {
      console.log('[Helix] [UnifiedFigmaTask] Executing group:', group.map(g => g.agentName).join(', '));
      if (group.length === 1) {
        const plan = group[0];
        stream.progress(`Executing ${plan.agentName}...`);

        const beforeMetricsCount = ctx.getAgentMetrics().length;

        const result = await this.executeAgent(plan, agentResults, ctx, tools, artifacts, taskInput, stream, focusAreas);

        agentResults[plan.agentName] = result;
        executed.push(plan.agentName);
        
        if (plan.agentName === 'CodeGenerator') {
          codegenResults = result?.codegenResults || [result];
        } else if (plan.agentName === 'Comparer') {
          compareResult = result;
        }

        // Debug: If CodeAnalyzer ran, log its result to help diagnose empty files
        if (plan.agentName === 'CodeAnalyzer') {
          try {
            console.log('[Helix] [UnifiedFigmaTask] CodeAnalyzer result keys:', result ? Object.keys(result) : 'no-result');
            const implCtx = result?.implementationContext;
            if (implCtx && Array.isArray(implCtx.files)) {
              console.log('[Helix] [UnifiedFigmaTask] CodeAnalyzer implementationContext.files.length:', implCtx.files.length);
            } else if (implCtx) {
              console.log('[Helix] [UnifiedFigmaTask] CodeAnalyzer implementationContext present but no files array:', typeof implCtx);
            } else {
              console.log('[Helix] [UnifiedFigmaTask] CodeAnalyzer implementationContext is empty or undefined');
            }
          } catch (e) {
            console.warn('[Helix] [UnifiedFigmaTask] Failed to log CodeAnalyzer result', e);
          }
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
          group.map(plan => this.executeAgent(plan, agentResults, ctx, tools, artifacts, taskInput, stream, focusAreas))
        );

        group.forEach((plan, idx) => {
          agentResults[plan.agentName] = results[idx];
          executed.push(plan.agentName);

          const result = results[idx];
        
          if (plan.agentName === 'CodeGenerator') {
            codegenResults = results[idx]?.codegenResults || [results[idx]];
          } else if (plan.agentName === 'Comparer') {
            compareResult = results[idx];
            console.log('[Helix] [UnifiedFigmaTask] Comparer executed in parallel, result keys:', results[idx] ? Object.keys(results[idx]) : 'no-result');

            // Stream comparer summary when available (parallel)
            const res = results[idx];
            if (res) {
              try {
                const score = typeof res.score === 'number' ? res.score : 'N/A';
                const diffs = Array.isArray(res.diffs) ? res.diffs.length : 'unknown';
                stream.markdown(`**Comparer:** Score: ${score} / 100 — Diffs: ${diffs}\n`);
              } catch (e) {
                console.warn('[Helix] [UnifiedFigmaTask] Failed to stream (parallel) Comparer result', e);
              }
            }
          }
          // Debug: If CodeAnalyzer ran in parallel, log its result
          if (plan.agentName === 'CodeAnalyzer') {
            try {
              console.log('[Helix] [UnifiedFigmaTask] (parallel) CodeAnalyzer result keys:', result ? Object.keys(result) : 'no-result');
              const implCtx = result?.implementationContext;
              if (implCtx && Array.isArray(implCtx.files)) {
                console.log('[Helix] [UnifiedFigmaTask] (parallel) CodeAnalyzer implementationContext.files.length:', implCtx.files.length);
              } else if (implCtx) {
                console.log('[Helix] [UnifiedFigmaTask] (parallel) CodeAnalyzer implementationContext present but no files array:', typeof implCtx);
              } else {
                console.log('[Helix] [UnifiedFigmaTask] (parallel) CodeAnalyzer implementationContext is empty or undefined');
              }
            } catch (e) {
              console.warn('[Helix] [UnifiedFigmaTask] (parallel) Failed to log CodeAnalyzer result', e);
            }
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
