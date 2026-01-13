import * as vscode from 'vscode';
import { BaseAgent } from './base/Agent';
import { CodegenResult, CodegenResultSchema, FigmaAnalysisResult, DesignSystemAnalysisResult, CompareResult, FixRoundResult } from '../contracts';
import { Diff, NextAction } from '../contracts/compare';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ToolRegistry } from '../runtime/ToolRegistry';
import { StreamHandler } from '../runtime/StreamHandler';
import promptContent from './prompts/code-generator.md';
import { z } from 'zod';

/**
 * Code generation mode (automatically detected from input)
 */
export enum CodeGenerationMode {
  /** Build new code from Figma + Design System */
  BUILD = 'BUILD',
  /** Fix existing code based on Compare result + Design System */
  FIX = 'FIX'
}

/**
 * Task for parallel FIX mode execution
 */
interface FixTask {
  diff: Diff;
  nextAction?: NextAction;
  taskId: string;
  filePaths: string[];
  priority: number;
  analysisResult?: {
    strategy: string;
    estimatedComplexity: 'low' | 'medium' | 'high';
    requiredFiles: string[];
    dependencies: string[];
  };
}

/**
 * Result of pre-analyzing diffs to plan fix tasks
 */
interface FixTaskAnalysisResult {
  schemaVersion: '1.0';
  tasks: Array<{
    diffIndex: number;
    category: string;
    priority: 'high' | 'medium' | 'low';
    strategy: string;
    estimatedComplexity: 'low' | 'medium' | 'high';
    requiredFiles: string[];
    dependencies: string[];
    recommendedAction?: string;
  }>;
  reasoning: string;
}

const FixTaskAnalysisResultSchema = z.object({
  schemaVersion: z.literal('1.0'),
  tasks: z.array(z.object({
    diffIndex: z.number(),
    category: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
    strategy: z.string(),
    estimatedComplexity: z.enum(['low', 'medium', 'high']),
    requiredFiles: z.array(z.string()),
    dependencies: z.array(z.string()),
    recommendedAction: z.string().optional(),
  })),
  reasoning: z.string(),
});

/**
 * Result of design analysis before BUILD mode
 */
interface DesignAnalysisResult {
  schemaVersion: '1.0';
  componentCoverage: {
    totalComponents: number;
    coveredByDesignSystem: number;
    missingPatterns: string[];
  };
  tokenCoverage: {
    colors: { defined: number; missing: string[] };
    typography: { defined: number; missing: string[] };
    spacing: { defined: number; missing: string[] };
  };
  recommendations: Array<{
    level: 'info' | 'warning' | 'error';
    message: string;
    action: string;
  }>;
  canProceed: boolean;
  reasoning: string;
}

const DesignAnalysisResultSchema = z.object({
  schemaVersion: z.literal('1.0'),
  componentCoverage: z.object({
    totalComponents: z.number(),
    coveredByDesignSystem: z.number(),
    missingPatterns: z.array(z.string()),
  }),
  tokenCoverage: z.object({
    colors: z.object({ defined: z.number(), missing: z.array(z.string()) }),
    typography: z.object({ defined: z.number(), missing: z.array(z.string()) }),
    spacing: z.object({ defined: z.number(), missing: z.array(z.string()) }),
  }),
  recommendations: z.array(z.object({
    level: z.enum(['info', 'warning', 'error']),
    message: z.string(),
    action: z.string(),
  })),
  canProceed: z.boolean(),
  reasoning: z.string(),
});

/**
 * Unified input for CodeGenerator
 * The mode is automatically detected based on which fields are provided:
 * - BUILD mode: has figmaAnalysis + designSystem, no compareResult
 * - FIX mode: has compareResult + designSystem
 */
export interface CodeGeneratorInput {
  goal?: string;

  // === BUILD MODE: New code generation from Figma ===
  /** Figma analysis result (for BUILD mode) */
  figmaAnalysis?: FigmaAnalysisResult;
  /** Design system analysis (for both BUILD and FIX modes) */
  designSystem?: DesignSystemAnalysisResult;

  // === FIX MODE: Fix existing code based on comparison ===
  /** Compare result identifying issues to fix (for FIX mode) */
  compareResult?: CompareResult;
  /** Existing code files that need fixing (for FIX mode) */
  existingCode?: Array<{
    path: string;
    content: string;
  }>;

  // === CONFIGURATION OPTIONS ===
  /** Maximum number of parallel tasks in FIX mode (default: 5) */
  maxParallelTasks?: number;
  /** Maximum number of iteration rounds in FIX mode (default: 3) */
  maxIterations?: number;
  /** Skip design analysis in BUILD mode (default: false) */
  skipDesignAnalysis?: boolean;
  /** Focus areas to prioritize (e.g., "typography, colors, spacing") - if not specified, all aspects are processed */
  focusAreas?: string;
}

export class CodeGeneratorAgent extends BaseAgent<CodeGeneratorInput, CodegenResult> {
  readonly name = 'CodeGenerator';
  readonly description = 'Generates production-quality code from specifications';
  readonly outputSchema = CodegenResultSchema;

  /**
   * Detect the generation mode based on input fields
   */
  private detectMode(input: CodeGeneratorInput): CodeGenerationMode {
    // FIX mode: has compareResult
    if (input.compareResult) {
      return CodeGenerationMode.FIX;
    }
    // BUILD mode: has figmaAnalysis
    if (input.figmaAnalysis) {
      return CodeGenerationMode.BUILD;
    }

    throw new Error('Invalid input: must provide either figmaAnalysis (BUILD mode) or compareResult (FIX mode)');
  }

  protected async execute(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: CodeGeneratorInput,
    stream?: StreamHandler
  ): Promise<CodegenResult> {
    // Step 1: Detect mode
    const mode = this.detectMode(input);
    const goal = input.goal || (mode === CodeGenerationMode.BUILD ? 'Build new UI from design' : 'Fix code to match design');

    console.log(`[CodeGenerator] Mode: ${mode}, Goal: ${goal}`);
    if (stream) {
      stream.markdown(`**Mode:** ${mode}\n**Goal:** ${goal}\n\n`);
    }

    // Step 2: Execute based on mode
    if (mode === CodeGenerationMode.BUILD) {
      return await this.executeBuildMode(ctx, tools, input, goal, stream);
    } else {
      return await this.executeFixModeWithIterations(ctx, tools, input, goal, stream);
    }
  }

  /**
   * BUILD mode: Generate new code from Figma + Design System
   */
  private async executeBuildMode(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: CodeGeneratorInput,
    goal: string,
    stream?: StreamHandler
  ): Promise<CodegenResult> {
    if (!input.figmaAnalysis) {
      throw new Error('figmaAnalysis is required for BUILD mode');
    }
    if (!input.designSystem) {
      throw new Error('designSystem is required for BUILD mode');
    }

    if (stream) {
      stream.markdown('📋 **Preparing build context...**\n\n');
      stream.markdown(`- Figma components: ${input.figmaAnalysis.root.children?.length || 0}\n`);
      stream.markdown(`- Design system domains: ${input.designSystem.domains?.length || 0}\n`);
      stream.markdown(`- Component patterns: ${input.designSystem.componentPatterns?.length || 0}\n\n`);
    }

    // NEW: Preliminary design analysis
    if (!input.skipDesignAnalysis) {
      const analysis = await this.analyzeDesignBeforeGeneration(ctx, tools, input, stream);

      // Display analysis to user
      if (stream) {
        stream.markdown('### Design Analysis\n\n');
        stream.markdown(`- Components covered: ${analysis.componentCoverage.coveredByDesignSystem}/${analysis.componentCoverage.totalComponents}\n`);
        stream.markdown(`- Color tokens: ${analysis.tokenCoverage.colors.defined} defined\n`);
        stream.markdown(`- Typography tokens: ${analysis.tokenCoverage.typography.defined} defined\n`);
        stream.markdown(`- Spacing tokens: ${analysis.tokenCoverage.spacing.defined} defined\n\n`);

        if (analysis.recommendations.length > 0) {
          stream.markdown('**Recommendations:**\n');
          analysis.recommendations.forEach(r => {
            const icon = r.level === 'error' ? '❌' : r.level === 'warning' ? '⚠️' : 'ℹ️';
            stream.markdown(`${icon} ${r.message}: ${r.action}\n`);
          });
          stream.markdown('\n');
        }
      }

      // Ask user to proceed if issues found
      if (!analysis.canProceed || analysis.recommendations.some(r => r.level === 'warning' || r.level === 'error')) {
        const choice = await vscode.window.showInformationMessage(
          `Design analysis found ${analysis.recommendations.length} issue(s). Proceed anyway?`,
          { modal: true },
          'Proceed',
          'Cancel'
        );

        if (choice !== 'Proceed') {
          throw new Error('User cancelled code generation after design analysis');
        }
      }
    }

    // Prepare context for code generation
    const userMessage = this.prepareBuildContext(input, goal);

    const messages = [
      vscode.LanguageModelChatMessage.User(promptContent),
      vscode.LanguageModelChatMessage.User(userMessage),
    ];

    if (stream) {
      stream.markdown('🤖 **Generating code from design...**\n\n');
    }

    return await this.invokeCodeGeneration(ctx, tools, messages, stream);
  }

  /**
   * Prepare context for BUILD mode
   */
  private prepareBuildContext(input: CodeGeneratorInput, goal: string): string {
    const context = {
      mode: 'BUILD',
      goal,
      figmaAnalysis: this.summarizeFigmaAnalysis(input.figmaAnalysis!),
      designSystem: this.summarizeDesignSystem(input.designSystem!),
    };

    let contextMessage = `Mode: BUILD - Generate new code from design\n\n` +
      `Goal: ${goal}\n\n`;

    // Add focusAreas if provided
    if (input.focusAreas) {
      contextMessage += `**Focus Areas**: ${input.focusAreas}\n` +
        `IMPORTANT: Only generate code related to these specific areas. Leave other aspects minimal or use defaults.\n\n`;
    }

    contextMessage += `Context:\n${JSON.stringify(context, null, 2)}`;

    return contextMessage;
  }

  /**
   * Invoke LLM for code generation (JSON mode, no tools)
   */
  private async invokeCodeGeneration(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    messages: vscode.LanguageModelChatMessage[],
    stream?: StreamHandler
  ): Promise<CodegenResult> {
    const llmResult = await tools.invoke(ctx, 'llm.chatJSON', {
      messages,
      schema: {
        name: 'CodegenResult',
        description: 'Code generation result with file changes',
        schema: CodegenResultSchema,
      },
    });

    if (!llmResult.ok) {
      throw new Error(`LLM request failed: ${llmResult.error?.message}`);
    }

    const result = llmResult.data as CodegenResult;
    if (!result.trace) {
      result.trace = [];
    }
    result.trace.push(...ctx.getTraceEvents());

    if (stream) {
      stream.markdown('✅ **Code generation completed**\n\n');
      if (result.files?.length) {
        stream.markdown(`Generated ${result.files.length} file(s):\n`);
        result.files.forEach(f => {
          stream.markdown(`- ${f.action}: [${f.path}](${f.path})\n`);
        });
        stream.markdown('\n');
      }
      if (result.summary) {
        stream.markdown(`**Summary:** ${result.summary}\n\n`);
      }
      if (result.issues?.length) {
        stream.markdown(`⚠️ **Issues (${result.issues.length}):**\n`);
        result.issues.forEach(issue => {
          const emoji = issue.level === 'error' ? '❌' : issue.level === 'warning' ? '⚠️' : 'ℹ️';
          stream.markdown(`${emoji} ${issue.message}\n`);
        });
        stream.markdown('\n');
      }
    }

    return result;
  }

  /**
   * Analyze Figma design for implementation readiness before BUILD mode
   */
  private async analyzeDesignBeforeGeneration(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: CodeGeneratorInput,
    stream?: StreamHandler
  ): Promise<DesignAnalysisResult> {
    if (stream) {
      stream.markdown('🔍 **Analyzing design for implementation readiness...**\n\n');
    }

    // Extract Figma components
    const figmaComponents = input.figmaAnalysis!.root.children?.map((c: any) => c.name) || [input.figmaAnalysis!.root.name];

    // Extract design system patterns
    const designSystemPatterns = input.designSystem?.componentPatterns || [];

    // Extract tokens from Figma
    const figmaTokens = input.figmaAnalysis!.tokensHint || { colors: [], typography: [], spacing: [], radius: [], shadows: [] };

    // Create analysis prompt
    const analysisPrompt = `Analyze this Figma design for implementation readiness.

## Figma Components
${figmaComponents.map((name: string, i: number) => `${i + 1}. ${name}`).join('\n')}

## Design System Patterns Available
${designSystemPatterns.length > 0 ? designSystemPatterns.map((p, i) => `${i + 1}. ${p}`).join('\n') : 'None defined'}

## Design Tokens in Figma
- Colors: ${figmaTokens.colors?.join(', ') || 'none'}
- Typography: ${figmaTokens.typography?.join(', ') || 'none'}
- Spacing: ${figmaTokens.spacing?.join(', ') || 'none'}

## Design System Domains
${input.designSystem?.domains?.map(d => `- ${d.name}: ${d.tokens?.length || 0} tokens`).join('\n') || 'None defined'}

## Your Task
1. Check component completeness: Are all Figma components covered by design system patterns?
2. Check token coverage: Are colors, typography, spacing tokens defined in the design system?
3. Identify missing patterns or tokens
4. Generate recommendations with specific actions
5. Determine if we can proceed (canProceed: false only for critical blocking issues)

Return DesignAnalysisResult JSON.`;

    const messages = [
      vscode.LanguageModelChatMessage.User(promptContent),
      vscode.LanguageModelChatMessage.User(analysisPrompt),
    ];

    const llmResult = await tools.invoke(ctx, 'llm.chatJSON', {
      messages,
      schema: {
        name: 'DesignAnalysisResult',
        description: 'Analysis of design implementation readiness',
        schema: DesignAnalysisResultSchema,
      },
    });

    if (!llmResult.ok) {
      // If analysis fails, return a permissive result so we don't block
      console.warn('[CodeGenerator] Design analysis failed:', llmResult.error?.message);

      if (stream) {
        stream.markdown('⚠️ **Design analysis failed, proceeding anyway...**\n\n');
      }

      return {
        schemaVersion: '1.0',
        componentCoverage: {
          totalComponents: figmaComponents.length,
          coveredByDesignSystem: 0,
          missingPatterns: [],
        },
        tokenCoverage: {
          colors: { defined: 0, missing: [] },
          typography: { defined: 0, missing: [] },
          spacing: { defined: 0, missing: [] },
        },
        recommendations: [{
          level: 'warning',
          message: 'Design analysis could not be completed',
          action: 'Proceeding with code generation anyway',
        }],
        canProceed: true,
        reasoning: 'Analysis failed but allowing generation to proceed',
      };
    }

    const analysisResult = llmResult.data as DesignAnalysisResult;

    // Stream the analysis results
    if (stream) {
      stream.markdown('✅ **Design analysis complete**\n\n');
      stream.markdown(`**Component Coverage:**\n`);
      stream.markdown(`- Total components: ${analysisResult.componentCoverage.totalComponents}\n`);
      stream.markdown(`- Covered by design system: ${analysisResult.componentCoverage.coveredByDesignSystem}\n`);

      if (analysisResult.componentCoverage.missingPatterns.length > 0) {
        stream.markdown(`- Missing patterns: ${analysisResult.componentCoverage.missingPatterns.join(', ')}\n`);
      }
      stream.markdown('\n');

      stream.markdown(`**Token Coverage:**\n`);
      stream.markdown(`- Colors: ${analysisResult.tokenCoverage.colors.defined} defined${analysisResult.tokenCoverage.colors.missing.length > 0 ? `, ${analysisResult.tokenCoverage.colors.missing.length} missing` : ''}\n`);
      stream.markdown(`- Typography: ${analysisResult.tokenCoverage.typography.defined} defined${analysisResult.tokenCoverage.typography.missing.length > 0 ? `, ${analysisResult.tokenCoverage.typography.missing.length} missing` : ''}\n`);
      stream.markdown(`- Spacing: ${analysisResult.tokenCoverage.spacing.defined} defined${analysisResult.tokenCoverage.spacing.missing.length > 0 ? `, ${analysisResult.tokenCoverage.spacing.missing.length} missing` : ''}\n`);
      stream.markdown('\n');

      if (analysisResult.recommendations.length > 0) {
        stream.markdown(`**Recommendations (${analysisResult.recommendations.length}):**\n`);
        analysisResult.recommendations.forEach(rec => {
          const icon = rec.level === 'error' ? '❌' : rec.level === 'warning' ? '⚠️' : 'ℹ️';
          stream.markdown(`${icon} ${rec.message}: ${rec.action}\n`);
        });
        stream.markdown('\n');
      }

      stream.markdown(`**Reasoning:** ${analysisResult.reasoning}\n\n`);
      stream.markdown(`**Can Proceed:** ${analysisResult.canProceed ? '✅ Yes' : '❌ No'}\n\n`);
    }

    return analysisResult;
  }

  /**
   * Pre-analyze diffs and nextActions using LLM to plan fix tasks
   */
  private async analyzeDiffsForFixTasks(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: CodeGeneratorInput,
    stream?: StreamHandler
  ): Promise<FixTaskAnalysisResult> {
    if (stream) {
      stream.markdown('🔍 **Analyzing diffs to plan fix strategy...**\n\n');
    }

    const compareResult = input.compareResult!;

    // Create analysis prompt
    const analysisPrompt = `Analyze these diffs and next actions to plan fix tasks.

## Diffs to Fix
${compareResult.diffs.map((diff, idx) => `
### Diff ${idx}
- Category: ${diff.category}
- Severity: ${diff.severity}
- Description: ${diff.description}
- Files: ${diff.filePaths?.join(', ') || 'not specified'}
`).join('\n')}

## Recommended Next Actions
${compareResult.nextActions.map((action, idx) => `
${idx + 1}. **${action.title}**: ${action.description}
`).join('\n')}

## Design System Context
${JSON.stringify(this.summarizeDesignSystem(input.designSystem!), null, 2)}

## Your Task
For each diff, analyze and create a fix task plan:
1. **Priority**: Assign based on severity and impact (high/medium/low)
2. **Strategy**: Describe the specific approach to fix this diff (e.g., "Update CSS class names", "Add missing props", "Refactor component structure")
3. **Estimated Complexity**: Assess how complex this fix is (low/medium/high)
4. **Required Files**: List the specific files that need to be read and modified
5. **Dependencies**: List other diff indices that should be fixed first (if any)
6. **Recommended Action**: Match with a next action if applicable

Consider:
- Some diffs may have dependencies on others (e.g., must fix structure before styling)
- Group related diffs by file or component
- High severity issues should have high priority
- Complex fixes may need multiple files

Return FixTaskAnalysisResult JSON.`;

    const messages = [
      vscode.LanguageModelChatMessage.User(promptContent),
      vscode.LanguageModelChatMessage.User(analysisPrompt),
    ];

    const llmResult = await tools.invoke(ctx, 'llm.chatJSON', {
      messages,
      schema: {
        name: 'FixTaskAnalysisResult',
        description: 'Analysis of diffs to plan fix tasks',
        schema: FixTaskAnalysisResultSchema,
      },
    });

    if (!llmResult.ok) {
      // If analysis fails, create default tasks
      console.warn('[CodeGenerator] Diff analysis failed:', llmResult.error?.message);

      const defaultTasks = compareResult.diffs.map((diff, idx) => ({
        diffIndex: idx,
        category: diff.category,
        priority: diff.severity as 'high' | 'medium' | 'low',
        strategy: `Fix ${diff.category} issue: ${diff.description}`,
        estimatedComplexity: 'medium' as const,
        requiredFiles: diff.filePaths || [],
        dependencies: [],
      }));

      return {
        schemaVersion: '1.0',
        tasks: defaultTasks,
        reasoning: 'Analysis failed, created default task plan based on diff severity',
      };
    }

    const analysis = llmResult.data as FixTaskAnalysisResult;

    if (stream) {
      stream.markdown(`📋 **Analysis complete: ${analysis.tasks.length} fix tasks planned**\n\n`);

      // Group by priority
      const highPriority = analysis.tasks.filter(t => t.priority === 'high');
      const mediumPriority = analysis.tasks.filter(t => t.priority === 'medium');
      const lowPriority = analysis.tasks.filter(t => t.priority === 'low');

      if (highPriority.length > 0) {
        stream.markdown(`- 🔴 High priority: ${highPriority.length}\n`);
      }
      if (mediumPriority.length > 0) {
        stream.markdown(`- 🟡 Medium priority: ${mediumPriority.length}\n`);
      }
      if (lowPriority.length > 0) {
        stream.markdown(`- ⚪ Low priority: ${lowPriority.length}\n`);
      }
      stream.markdown('\n');

      // Output detailed task information
      stream.markdown('**Task Details:**\n\n');
      analysis.tasks.forEach((task, index) => {
        const priorityIcon = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '⚪';
        const complexityBadge = task.estimatedComplexity === 'high' ? '🔥' : task.estimatedComplexity === 'medium' ? '⚡' : '✨';

        stream.markdown(`${index + 1}. ${priorityIcon} **${task.category}** ${complexityBadge}\n`);
        stream.markdown(`   - **Strategy:** ${task.strategy}\n`);
        stream.markdown(`   - **Complexity:** ${task.estimatedComplexity}\n`);
        stream.markdown(`   - **Files:** ${task.requiredFiles.length > 0 ? task.requiredFiles.join(', ') : 'TBD'}\n`);
        if (task.dependencies && task.dependencies.length > 0) {
          stream.markdown(`   - **Dependencies:** Task ${task.dependencies.join(', Task ')}\n`);
        }
        if (task.recommendedAction) {
          stream.markdown(`   - **Action:** ${task.recommendedAction}\n`);
        }
        stream.markdown('\n');
      });

      stream.markdown(`**Reasoning:** ${analysis.reasoning}\n\n`);
    }

    return analysis;
  }

  /**
   * Split compare result into parallel fix tasks using analysis results
   */
  private splitIntoFixTasks(
    compareResult: CompareResult,
    analysisResult: FixTaskAnalysisResult,
    maxParallelTasks: number
  ): FixTask[] {
    const tasks: FixTask[] = [];

    // Map priority to number for sorting
    const priorityToNumber = (priority: string): number => {
      switch (priority.toLowerCase()) {
        case 'high': return 3;
        case 'medium': return 2;
        case 'low': return 1;
        default: return 1;
      }
    };

    // Create tasks from analysis results
    for (const taskAnalysis of analysisResult.tasks) {
      const diff = compareResult.diffs[taskAnalysis.diffIndex];
      if (!diff) {
        console.warn(`[CodeGenerator] Diff index ${taskAnalysis.diffIndex} not found in compareResult`);
        continue;
      }

      // Find matching next action based on analysis recommendation
      let matchingAction: NextAction | undefined;
      if (taskAnalysis.recommendedAction) {
        matchingAction = compareResult.nextActions.find(action =>
          action.title.toLowerCase().includes(taskAnalysis.recommendedAction!.toLowerCase()) ||
          taskAnalysis.recommendedAction!.toLowerCase().includes(action.title.toLowerCase())
        );
      }

      // If no match via recommendation, try matching by category
      if (!matchingAction) {
        matchingAction = compareResult.nextActions.find(action =>
          action.title.toLowerCase().includes(diff.category.toLowerCase()) ||
          action.description.toLowerCase().includes(diff.description.toLowerCase())
        );
      }

      tasks.push({
        diff,
        nextAction: matchingAction,
        taskId: `diff-${taskAnalysis.diffIndex}`,
        filePaths: taskAnalysis.requiredFiles.length > 0 ? taskAnalysis.requiredFiles : (diff.filePaths || []),
        priority: priorityToNumber(taskAnalysis.priority),
        analysisResult: {
          strategy: taskAnalysis.strategy,
          estimatedComplexity: taskAnalysis.estimatedComplexity,
          requiredFiles: taskAnalysis.requiredFiles,
          dependencies: taskAnalysis.dependencies,
        },
      });
    }

    // Sort by priority (high to low)
    tasks.sort((a, b) => b.priority - a.priority);

    // Filter out tasks with unmet dependencies in this batch
    const selectedTasks: FixTask[] = [];
    const selectedIndices = new Set<number>();

    for (const task of tasks) {
      if (selectedTasks.length >= maxParallelTasks) {
        break;
      }

      // Check if all dependencies are already selected
      const taskIndex = parseInt(task.taskId.replace('diff-', ''));
      const hasDependencies = task.analysisResult?.dependencies.length ?? 0 > 0;

      if (hasDependencies) {
        const allDependenciesMet = task.analysisResult!.dependencies.every((depIdx: string) =>
          selectedIndices.has(typeof depIdx === 'string' ? parseInt(depIdx) : depIdx)
        );

        if (!allDependenciesMet) {
          // Skip this task for now if dependencies not met
          continue;
        }
      }

      selectedTasks.push(task);
      selectedIndices.add(taskIndex);
    }

    return selectedTasks;
  }

  /**
   * Execute a single fix task in parallel
   */
  private async executeFixTaskParallel(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    task: FixTask,
    input: CodeGeneratorInput,
    stream?: StreamHandler
  ): Promise<CodegenResult> {
    console.log(`[CodeGenerator] Executing task ${task.taskId}: ${task.diff.category}`);

    if (stream) {
      stream.markdown(`⏳ **Starting:** ${task.diff.category} - ${task.diff.description}\n`);
    }

    // Create focused prompt for this ONE diff with strategy guidance
    let userMessage =
      `Mode: FIX - Fix ONE specific diff\n\n` +
      `Diff to fix:\n${JSON.stringify(task.diff, null, 2)}\n\n` +
      `${task.analysisResult ? `**Fix Strategy**: ${task.analysisResult.strategy}\n**Estimated Complexity**: ${task.analysisResult.estimatedComplexity}\n\n` : ''}` +
      `${task.nextAction ? `**Recommended action**: ${task.nextAction.title} - ${task.nextAction.description}\n\n` : ''}`;

    // Add focusAreas if provided
    if (input.focusAreas) {
      userMessage += `**Focus Areas**: ${input.focusAreas}\n` +
        `IMPORTANT: Only fix issues related to these specific areas. Skip diffs unrelated to the focus areas.\n\n`;
    }

    userMessage +=
      `**Files to modify**: ${task.filePaths.length > 0 ? task.filePaths.join(', ') : 'not specified'}\n\n` +
      `Design system context:\n${JSON.stringify(this.summarizeDesignSystem(input.designSystem!), null, 2)}\n\n` +
      `IMPORTANT: \n` +
      `1. Use file tools to read the files listed above\n` +
      `2. Follow the fix strategy provided\n` +
      `3. Fix ONLY this specific diff\n` +
      `4. Write the updated files back using file tools`;

    const messages = [
      vscode.LanguageModelChatMessage.User(promptContent),
      vscode.LanguageModelChatMessage.User(userMessage),
    ];

    try {
      const llmResult = await tools.invoke(ctx, 'llm.chatWithTools', {
        messages,
        options: {
          toolInvocationToken: ctx.toolInvocationToken,
        },
      });

      if (!llmResult.ok) {
        console.error(`[CodeGenerator] Task ${task.taskId} failed:`, llmResult.error?.message);

        if (stream) {
          stream.markdown(`❌ **Failed:** ${task.diff.category} - ${llmResult.error?.message}\n`);
        }

        // Return empty result on failure (don't throw)
        return {
          schemaVersion: '1.0',
          summary: `Failed to fix ${task.diff.category}: ${llmResult.error?.message}`,
          files: [],
          trace: ctx.getTraceEvents(),
        };
      }

      const responseContent = llmResult.data?.content || '';

      if (stream) {
        stream.markdown(`✅ **Completed:** ${task.diff.category} - ${task.diff.description}\n`);
        if (task.filePaths.length > 0) {
          stream.markdown(`   Modified: ${task.filePaths.join(', ')}\n`);
        }
      }

      return {
        schemaVersion: '1.0',
        summary: responseContent || `Fixed ${task.diff.category}`,
        files: [], // Files were written by LLM using tools
        trace: ctx.getTraceEvents(),
      };
    } catch (error: any) {
      console.error(`[CodeGenerator] Task ${task.taskId} exception:`, error);

      if (stream) {
        stream.markdown(`❌ **Exception:** ${task.diff.category} - ${error.message}\n`);
      }

      return {
        schemaVersion: '1.0',
        summary: `Exception fixing ${task.diff.category}: ${error.message}`,
        files: [],
        trace: ctx.getTraceEvents(),
      };
    }
  }

  /**
   * Merge multiple CodegenResults into one
   */
  private mergeFixResults(taskResults: CodegenResult[]): CodegenResult {
    if (taskResults.length === 0) {
      return {
        schemaVersion: '1.0',
        summary: 'No fixes were applied',
        files: [],
      };
    }

    if (taskResults.length === 1) {
      return taskResults[0];
    }

    // Collect all files (deduplicate by path, later changes override)
    const filesMap = new Map<string, any>();
    for (const result of taskResults) {
      if (result.files) {
        for (const file of result.files) {
          filesMap.set(file.path, file);
        }
      }
    }

    // Merge commands (deduplicate)
    const commandsSet = new Set<string>();
    for (const result of taskResults) {
      if (result.commands) {
        result.commands.forEach(cmd => commandsSet.add(cmd));
      }
    }

    // Merge issues
    const allIssues: any[] = [];
    for (const result of taskResults) {
      if (result.issues) {
        allIssues.push(...result.issues);
      }
    }

    // Merge traces
    const allTraces: any[] = [];
    for (const result of taskResults) {
      if (result.trace) {
        allTraces.push(...result.trace);
      }
    }

    // Create combined summary
    const summaries = taskResults.map(r => r.summary).filter(s => s);
    const combinedSummary = `Fixed ${taskResults.length} issue(s):\n${summaries.join('\n')}`;

    return {
      schemaVersion: '1.0',
      summary: combinedSummary,
      files: Array.from(filesMap.values()),
      commands: commandsSet.size > 0 ? Array.from(commandsSet) : undefined,
      issues: allIssues.length > 0 ? allIssues : undefined,
      trace: allTraces.length > 0 ? allTraces : undefined,
    };
  }

  /**
   * Execute FIX mode with user-controlled iterations
   */
  private async executeFixModeWithIterations(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: CodeGeneratorInput,
    goal: string,
    stream?: StreamHandler
  ): Promise<CodegenResult> {
    const maxIterations = input.maxIterations || 3;
    const maxParallelTasks = input.maxParallelTasks || 5;
    const iterations: FixRoundResult[] = [];
    const allResults: CodegenResult[] = [];

    let currentCompareResult = input.compareResult!;

    // Pre-analyze diffs once before starting iterations
    if (stream) {
      stream.markdown('## Fix Mode: Pre-Analysis\n\n');
    }

    const analysisResult = await this.analyzeDiffsForFixTasks(ctx, tools, input, stream);

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      if (stream) {
        stream.markdown(`\n### Round ${iteration}/${maxIterations}\n\n`);
      }

      // Split diffs into parallel tasks using analysis
      const tasks = this.splitIntoFixTasks(currentCompareResult, analysisResult, maxParallelTasks);

      if (tasks.length === 0) {
        if (stream) {
          stream.markdown('✅ No more issues to fix!\n\n');
        }
        break;
      }

      if (stream) {
        stream.markdown(`Processing ${tasks.length} issue(s) in parallel...\n\n`);

        // Output details of tasks being executed in this round
        stream.markdown('**Tasks in this round:**\n');
        tasks.forEach((task, index) => {
          const priorityIcon = task.priority === 3 ? '🔴' : task.priority === 2 ? '🟡' : '⚪';
          const complexityBadge = task.analysisResult?.estimatedComplexity === 'high' ? '🔥' :
                                  task.analysisResult?.estimatedComplexity === 'medium' ? '⚡' : '✨';

          stream.markdown(`${index + 1}. ${priorityIcon} ${complexityBadge} **${task.diff.category}**: ${task.diff.description}\n`);
          stream.markdown(`   - Files: ${task.filePaths.join(', ') || 'TBD'}\n`);
          if (task.analysisResult) {
            stream.markdown(`   - Strategy: ${task.analysisResult.strategy}\n`);
          }
        });
        stream.markdown('\n🔄 **Executing fixes...**\n\n');
      }

      // Execute all tasks in parallel
      const taskResults = await Promise.allSettled(
        tasks.map(task => this.executeFixTaskParallel(ctx, tools, task, input, stream))
      );

      // Separate succeeded and failed
      const succeeded = taskResults.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<CodegenResult>).value);
      const failed = taskResults.filter(r => r.status === 'rejected');

      // Merge succeeded results
      const roundResult = this.mergeFixResults(succeeded);
      allResults.push(roundResult);

      // Track iteration stats
      const filesModified = [...new Set(roundResult.files?.map(f => f.path) || [])];
      iterations.push({
        roundNumber: iteration,
        tasksAttempted: tasks.length,
        tasksSucceeded: succeeded.length,
        tasksFailed: failed.length,
        filesModified,
        summary: roundResult.summary,
      });

      if (stream) {
        stream.markdown(`\n---\n\n`);
        stream.markdown(`## ✅ Round ${iteration} Summary\n\n`);
        stream.markdown(`**Results:**\n`);
        stream.markdown(`- ✅ Succeeded: ${succeeded.length}\n`);
        if (failed.length > 0) {
          stream.markdown(`- ❌ Failed: ${failed.length}\n`);
        }
        stream.markdown(`- 📊 Total: ${tasks.length} tasks\n\n`);

        if (filesModified.length > 0) {
          stream.markdown(`**Files Modified (${filesModified.length}):**\n`);
          filesModified.forEach(file => {
            stream.markdown(`- [${file}](${file})\n`);
          });
          stream.markdown('\n');
        } else {
          stream.markdown(`**Files Modified:** None\n\n`);
        }

        // Show summary of what was fixed
        if (roundResult.summary) {
          stream.markdown(`**Summary:**\n${roundResult.summary}\n\n`);
        }

        // Calculate remaining issues
        const remainingIssues = currentCompareResult.diffs.length - tasks.length;
        if (remainingIssues > 0) {
          stream.markdown(`**Remaining Issues:** ${remainingIssues} more to fix\n\n`);
        }
      }

      // Ask user to continue (unless last iteration or all tasks completed)
      if (iteration < maxIterations && currentCompareResult.diffs.length > tasks.length) {
        const choice = await vscode.window.showInformationMessage(
          `Round ${iteration} complete. Fixed ${succeeded.length}/${tasks.length} issues. Continue?`,
          { modal: true },
          'Yes, continue',
          'Stop here'
        );

        if (choice !== 'Yes, continue') {
          if (stream) {
            stream.markdown('🛑 User stopped iteration.\n\n');
          }
          break;
        }

        // Remove completed diffs for next iteration
        const completedTaskIds = new Set(tasks.map(t => t.taskId));
        currentCompareResult = {
          ...currentCompareResult,
          diffs: currentCompareResult.diffs.filter((_, idx) => !completedTaskIds.has(`diff-${idx}`)),
        };
      }
    }

    // Merge all iterations into final result
    const finalResult = this.mergeFixResults(allResults);
    finalResult.iterations = iterations;

    return finalResult;
  }

  /**
   * Summarize Figma analysis to reduce token usage
   */
  private summarizeFigmaAnalysis(analysis: FigmaAnalysisResult): any {
    return {
      schemaVersion: analysis.schemaVersion,
      rootComponent: {
        name: analysis.root.name,
        role: analysis.root.role,
        childCount: analysis.root.children?.length || 0,
      },
      casesCount: analysis.cases?.length || 0,
      tokensHint: analysis.tokensHint,
      risks: analysis.risks?.map(r => ({ level: r.level, message: r.message })) || [],
    };
  }

  /**
   * Summarize design system to reduce token usage
   */
  private summarizeDesignSystem(designSystem: DesignSystemAnalysisResult): any {
    return {
      schemaVersion: designSystem.schemaVersion,
      domainsCount: designSystem.domains?.length || 0,
      componentPatterns: designSystem.componentPatterns || [],
      frameworkInfo: designSystem.frameworkInfo,
      designSystemPath: designSystem.designSystemPath,
    };
  }

  /**
   * Summarize compare result to reduce token usage
   */
  private summarizeCompareResult(compareResult: CompareResult): any {
    return {
      schemaVersion: compareResult.schemaVersion,
      score: compareResult.score,
      diffs: compareResult.diffs.map(d => ({
        category: d.category,
        description: d.description,
        severity: d.severity,
        filePaths: d.filePaths || [],
      })),
      nextActions: compareResult.nextActions.map(a => ({
        title: a.title,
        description: a.description,
      })),
    };
  }
}
