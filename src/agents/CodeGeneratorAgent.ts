import * as vscode from 'vscode';
import { BaseAgent } from './base/Agent';
import { CodegenResult, CodegenResultSchema, FigmaAnalysisResult, DesignSystemAnalysisResult, CompareResult } from '../contracts';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ToolRegistry } from '../runtime/ToolRegistry';
import { StreamHandler } from '../runtime/StreamHandler';
import promptContent from './prompts/code-generator.md';
import { isDebugMode } from '../utils/debug';

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
      stream.markdown(`### 🔨 Code Generation\n\n`);
      stream.markdown(`**Mode:** ${mode}\n`);
      stream.markdown(`**Goal:** ${goal}\n\n`);
    }

    // Step 2: Execute based on mode
    if (mode === CodeGenerationMode.BUILD) {
      return await this.executeBuildMode(ctx, tools, input, goal, stream);
    } else {
      return await this.executeFixMode(ctx, tools, input, goal, stream);
    }
  }

  /**
   * BUILD mode: Generate new code from Figma + Design System
   * Uses chatWithTools to let LLM directly create files via tools
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
      stream.progress('Preparing build context...');
      const componentsCount = input.figmaAnalysis.root.children?.length || 0;
      const domainsCount = input.designSystem.domains?.length || 0;
      const patternsCount = input.designSystem.componentPatterns?.length || 0;
      stream.markdown(`**Context:** ${componentsCount} components, ${domainsCount} domains, ${patternsCount} patterns\n\n`);
      if (isDebugMode()) {
        stream.markdown('**Debug Info:**\n');
        stream.markdown('```json\n' + JSON.stringify({
          figmaAnalysis: this.summarizeFigmaAnalysis(input.figmaAnalysis),
          designSystem: this.summarizeDesignSystem(input.designSystem),
        }, null, 2) + '\n```\n\n');
      }
    }

    // Prepare context for code generation
    const userMessage = this.prepareBuildContext(input, goal);

    const messages = [
      vscode.LanguageModelChatMessage.User(promptContent),
      vscode.LanguageModelChatMessage.User(userMessage),
    ];

    stream?.progress('Generating code from design...');

    // Use chatWithTools instead of chatJSON to let LLM directly create files
    const llmResult = await tools.invoke(ctx, 'llm.chatWithTools', {
      messages,
      options: {
        toolInvocationToken: ctx.toolInvocationToken,
      },
    });

    if (!llmResult.ok) {
      console.error('[CodeGenerator] Build mode failed:', llmResult.error?.message);
      if (stream) {
        stream.markdown(`❌ Build failed: ${llmResult.error?.message}\n`);
      }
      return {
        schemaVersion: '1.0',
        summary: `Build failed: ${llmResult.error?.message}`,
        files: [],
        trace: ctx.getTraceEvents(),
      };
    }

    const responseContent = llmResult.data?.content || '';

    if (stream) {
      stream.markdown(`\n✅ **Generation Complete**\n\n`);
      stream.markdown(responseContent + '\n');
    }

    return {
      schemaVersion: '1.0',
      summary: responseContent || `Generated code from Figma design`,
      files: [], // Files were created by LLM using tools
      trace: ctx.getTraceEvents(),
    };
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
   * Execute FIX mode: Use LLM to analyze and fix all issues
   */
  private async executeFixMode(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: CodeGeneratorInput,
    goal: string,
    stream?: StreamHandler
  ): Promise<CodegenResult> {
    const compareResult = input.compareResult!;

    if (stream) {
      stream.markdown('## Fix Mode\n\n');
      stream.markdown(`Found ${compareResult.diffs.length} issue(s) to fix.\n\n`);
    }

    // Build the fix prompt with all diffs and next actions
    let userMessage =
      `Mode: FIX - Analyze and fix all design-code differences\n\n` +
      `## Issues to Fix (${compareResult.diffs.length})\n`;

    compareResult.diffs.forEach((diff, idx) => {
      userMessage += `\n### Issue ${idx + 1}: ${diff.category}\n`;
      userMessage += `- **Severity**: ${diff.severity}\n`;
      userMessage += `- **Description**: ${diff.description}\n`;
      if (diff.filePaths?.length) {
        userMessage += `- **Files**: ${diff.filePaths.join(', ')}\n`;
      }
    });

    userMessage += `\n## Recommended Actions\n`;
    compareResult.nextActions.forEach((action, idx) => {
      userMessage += `${idx + 1}. **${action.title}**: ${action.description}\n`;
    });

    // Add focusAreas if provided
    if (input.focusAreas) {
      userMessage += `\n## Focus Areas\n${input.focusAreas}\n`;
      userMessage += `IMPORTANT: Prioritize issues related to these specific areas.\n`;
    }

    userMessage += `\n## Design System\n${JSON.stringify(this.summarizeDesignSystem(input.designSystem!), null, 2)}\n`;

    userMessage += `\n## Instructions\n`;
    userMessage += `1. Analyze all issues and plan the fix order (consider dependencies)\n`;
    userMessage += `2. Read the necessary files using file tools\n`;
    userMessage += `3. Fix each issue one by one\n`;
    userMessage += `4. Write the updated files back using file tools\n`;
    userMessage += `5. After fixing all issues, provide a summary of changes made\n`;

    const messages = [
      vscode.LanguageModelChatMessage.User(promptContent),
      vscode.LanguageModelChatMessage.User(userMessage),
    ];

    const llmResult = await tools.invoke(ctx, 'llm.chatWithTools', {
      messages,
      options: {
        toolInvocationToken: ctx.toolInvocationToken,
      },
    });

    if (!llmResult.ok) {
      console.error('[CodeGenerator] Fix mode failed:', llmResult.error?.message);
      if (stream) {
        stream.markdown(`❌ Fix failed: ${llmResult.error?.message}\n`);
      }
      return {
        schemaVersion: '1.0',
        summary: `Fix failed: ${llmResult.error?.message}`,
        files: [],
        trace: ctx.getTraceEvents(),
      };
    }

    const responseContent = llmResult.data?.content || '';

    if (stream) {
      stream.markdown(`\n## Fix Complete\n\n`);
      stream.markdown(responseContent + '\n');
    }

    return {
      schemaVersion: '1.0',
      summary: responseContent || `Fixed ${compareResult.diffs.length} issue(s)`,
      files: [], // Files were written by LLM using tools
      trace: ctx.getTraceEvents(),
    };
  }

  /**
   * Summarize Figma analysis to reduce token usage
   */
  private summarizeFigmaAnalysis(analysis: FigmaAnalysisResult): any {
    const rootParts = (analysis.root as any).parts;
    return {
      schemaVersion: analysis.schemaVersion,
      rootComponent: {
        name: analysis.root.name,
        role: analysis.root.role,
        partsCount: rootParts?.length || 0,
      },
      metadataSize: analysis.metadata?.length || 0,
      designContextSize: analysis.designContext?.length || 0,
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
