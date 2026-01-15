import * as vscode from 'vscode';
import { BaseAgent } from './base/Agent';
import { CompareResult, CompareResultSchema, Diff, NextAction } from '../contracts';
import { FigmaAnalysisResult } from '../contracts/figma';
import { DesignSystemAnalysisResult, DesignDomain } from '../contracts/designSystem';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ToolRegistry } from '../runtime/ToolRegistry';
import { StreamHandler } from '../runtime/StreamHandler';
import { UIPart } from '../contracts/common';
import promptContent from './prompts/comparer.md';

export interface ComparerInput {
  // Direct data input from previous agents
  figmaData?: FigmaAnalysisResult;
  designSystem?: DesignSystemAnalysisResult | null;
  codeFiles?: { files: Record<string, string> };
  /** Focus areas to prioritize (e.g., "typography, colors, spacing") - if not specified, all aspects are compared */
  focusAreas?: string;
}

interface ComparisonTask {
  uiPart: UIPart;
  domain: DesignDomain | null;
  domainName: string;
  taskId: string;
}


export class ComparerAgent extends BaseAgent<ComparerInput, CompareResult> {
  readonly name = 'Comparer';
  readonly description = 'Compares implementation against Figma designs';
  readonly outputSchema = CompareResultSchema;

  protected async execute(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: ComparerInput,
    stream?: StreamHandler
  ): Promise<CompareResult> {
    const figmaData = input.figmaData;
    const designSystem = input.designSystem;
    const codeFiles = input.codeFiles;

    console.log('[Helix] [ComparerAgent] Input figmaData:', JSON.stringify(figmaData, null, 2));
    console.log('[Helix] [ComparerAgent] Input designSystem:', JSON.stringify(designSystem, null, 2));
    console.log('[Helix] [ComparerAgent] Input codeFiles:', JSON.stringify(codeFiles, null, 2));

    if (!figmaData?.root) {
      throw new Error('No Figma data root found');
    }

    // Split into comparison tasks: UI parts × Design System domains
    const tasks = this.splitIntoTasks(figmaData, designSystem, input.focusAreas);
    console.log(`[Helix] [ComparerAgent] Split into ${tasks.length} comparison tasks`);

    if (stream) {
      const uiPartsCount = this.getUIPartsCount(figmaData);
      const domainsCount = designSystem?.domains?.length || 0;
      stream.markdown(`### Comparing ${uiPartsCount} UI components × ${domainsCount} design domains (${tasks.length} tasks in parallel)...\n\n`);
    }

    // Perform parallel comparison for each task
    const taskResults = await Promise.all(
      tasks.map(task =>
        this.compareTask(ctx, tools, task, codeFiles, stream)
      )
    );

    // Merge results
    const result = this.mergeResults(taskResults);

    console.log('[Helix] [ComparerAgent] Comparison complete');

    if (stream) {
      stream.markdown(`\n### Comparison Analysis\n\n`);

      if (result.diffs.length > 0) {
          stream.markdown('#### Key Differences\n');
          result.diffs
          .filter(diff => diff.severity === 'high' || diff.severity === 'medium')
          .forEach(diff => {
              const severityIcon = diff.severity === 'high' ? '🔴' : diff.severity === 'medium' ? '🟡' : '⚪';
              stream.markdown(`- ${severityIcon} **${diff.category}**: ${diff.description}\n`);
          });
          stream.markdown('\n');
      }
    }

    if (!result.trace) {
      result.trace = [];
    }
    result.trace.push(...ctx.getTraceEvents());

    return result;
  }

  /**
   * Get the count of UI parts in the Figma data
   */
  private getUIPartsCount(figmaData: FigmaAnalysisResult): number {
    if (figmaData.root.children && figmaData.root.children.length > 0) {
      return figmaData.root.children.length;
    }
    return 1; // Just the root
  }

  /**
   * Split Figma data and Design System into comparison tasks
   * Creates tasks for each UI part × Design System domain combination
   * Filters domains based on focusAreas if provided
   */
  private splitIntoTasks(
    figmaData: FigmaAnalysisResult,
    designSystem: DesignSystemAnalysisResult | null | undefined,
    focusAreas?: string
  ): ComparisonTask[] {
    const tasks: ComparisonTask[] = [];

    // Extract UI parts
    const uiParts: UIPart[] = [];
    if (figmaData.root.children && figmaData.root.children.length > 0) {
      uiParts.push(...figmaData.root.children);
    } else {
      uiParts.push(figmaData.root);
    }

    // Extract design domains
    let domains: Array<{ domain: DesignDomain | null; name: string }> = [];
    if (designSystem?.domains && designSystem.domains.length > 0) {
      domains.push(...designSystem.domains.map(d => ({ domain: d, name: d.name })));
    } else {
      // If no domains, create a single task with null domain
      domains.push({ domain: null, name: 'general' });
    }

    // Filter domains by focusAreas if provided
    if (focusAreas && domains.length > 0 && domains[0].domain !== null) {
      const focusAreasList = focusAreas.toLowerCase().split(',').map(s => s.trim());
      domains = domains.filter(({ name }) =>
        focusAreasList.some(focus => name.toLowerCase().includes(focus))
      );
      console.log(`[Helix] [ComparerAgent] Filtered domains by focusAreas "${focusAreas}":`, domains.map(d => d.name));
    }

    // Create cross-product of UI parts × domains
    for (const uiPart of uiParts) {
      for (const { domain, name } of domains) {
        tasks.push({
          uiPart,
          domain,
          domainName: name,
          taskId: `${uiPart.id}-${name}`,
        });
      }
    }

    return tasks;
  }

  /**
   * Compare a single task (UI part × Design System domain)
   */
  private async compareTask(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    task: ComparisonTask,
    codeFiles: { files: Record<string, string> } | undefined,
    stream?: StreamHandler
  ): Promise<CompareResult> {
    const { uiPart, domain, domainName, taskId } = task;

    // Debug logging for codeFiles
    console.log(`[Helix] [ComparerAgent] Task ${taskId}: codeFiles type:`, typeof codeFiles);
    console.log(`[Helix] [ComparerAgent] Task ${taskId}: codeFiles is undefined:`, codeFiles === undefined);
    console.log(`[Helix] [ComparerAgent] Task ${taskId}: codeFiles:`, JSON.stringify(codeFiles, null, 2));

    if (codeFiles?.files) {
      const fileKeys = Object.keys(codeFiles.files);
      console.log(`[Helix] [ComparerAgent] Task ${taskId}: codeFiles.files keys:`, fileKeys);
      console.log(`[Helix] [ComparerAgent] Task ${taskId}: codeFiles.files count:`, fileKeys.length);

      // Log first file content preview if available
      if (fileKeys.length > 0) {
        const firstKey = fileKeys[0];
        const firstContent = codeFiles.files[firstKey];
        console.log(`[Helix] [ComparerAgent] Task ${taskId}: First file "${firstKey}" content length:`,
          typeof firstContent === 'string' ? firstContent.length : 'NOT A STRING');
        console.log(`[Helix] [ComparerAgent] Task ${taskId}: First file "${firstKey}" content preview:`,
          typeof firstContent === 'string' ? firstContent.substring(0, 100) : firstContent);
      }
    }

    const prompt = promptContent;
    const domainInfo = domain
      ? `Design System Domain (${domainName}):\n${JSON.stringify(domain, null, 2)}`
      : 'Design System: None available';

    const userMessage = `UI Component to Compare:\n${JSON.stringify(uiPart, null, 2)}\n\n` +
      `${domainInfo}\n\n` +
      `Implementation:\n${JSON.stringify(codeFiles, null, 2)}\n\n` +
      `Focus: Compare the UI component specifically against the "${domainName}" design domain.`;

    // Log the actual message being sent to LLM
    console.log(`[Helix] [ComparerAgent] Task ${taskId}: User message length:`, userMessage.length);
    console.log(`[Helix] [ComparerAgent] Task ${taskId}: User message preview (first 500 chars):`, userMessage.substring(0, 500));

    const messages = [
      vscode.LanguageModelChatMessage.User(prompt),
      vscode.LanguageModelChatMessage.User(userMessage),
    ];

    console.log(`[Helix] [ComparerAgent] Task ${taskId}: Comparing ${uiPart.name} vs ${domainName}`);

    // Use chatWithTools so LLM can read files via workspace.readFile
    const llmResult = await tools.invoke(ctx, 'llm.chatWithTools', {
      messages,
      options: {
        toolInvocationToken: ctx.toolInvocationToken,
      },
    });

    if (!llmResult.ok) {
      console.error(`[Helix] [ComparerAgent] Task ${taskId} failed:`, llmResult.error?.message);
      // Return empty result on failure
      return {
        schemaVersion: '1.0' as const,
        diffs: [],
        nextActions: [],
      };
    }

    // Parse the response content as JSON
    const responseContent = llmResult.data?.content || '';
    console.log(`[Helix] [ComparerAgent] Task ${taskId}: Response content length:`, responseContent.length);

    let result: CompareResult;
    try {
      // Try to parse JSON from the response
      const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                        responseContent.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        result = JSON.parse(jsonStr) as CompareResult;
        console.log(`[Helix] [ComparerAgent] Task ${taskId}: ${result.diffs.length} diffs`);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseErr) {
      console.error(`[Helix] [ComparerAgent] Task ${taskId} failed to parse response:`, parseErr);
      console.error(`[Helix] [ComparerAgent] Task ${taskId} response content:`, responseContent);

      // Return empty result on parse failure
      return {
        schemaVersion: '1.0' as const,
        diffs: [],
        nextActions: [{
          title: 'Parse error',
          description: `Failed to parse comparison result: ${(parseErr as Error).message}`,
          suggestedSubtasks: [],
        }],
      };
    }

    if (stream) {
      stream.markdown(`- ✓ ${uiPart.name} × ${domainName}: ${result.diffs.length} diffs found\n`);
    }

    return result;
  }

  /**
   * Merge multiple comparison results into one
   */
  private mergeResults(results: CompareResult[]): CompareResult {
    if (results.length === 0) {
      return {
        schemaVersion: '1.0' as const,
        diffs: [],
        nextActions: [],
      };
    }

    if (results.length === 1) {
      return results[0];
    }

    // Merge all diffs
    const allDiffs: Diff[] = [];
    for (const result of results) {
      allDiffs.push(...result.diffs);
    }

    // Merge next actions, removing duplicates by title
    const actionMap = new Map<string, NextAction>();
    for (const result of results) {
      for (const action of result.nextActions) {
        if (!actionMap.has(action.title)) {
          actionMap.set(action.title, action);
        }
      }
    }

    // Merge traces
    const allTraces: any[] = [];
    for (const result of results) {
      if (result.trace) {
        allTraces.push(...result.trace);
      }
    }

    return {
      schemaVersion: '1.0' as const,
      diffs: allDiffs,
      nextActions: Array.from(actionMap.values()),
      trace: allTraces.length > 0 ? allTraces : undefined,
    };
  }

  private formatComparerPreview(diffs: any[]): string {
    const lines: string[] = [];

    const toTitleCase = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

    const preview = diffs.slice(0, 10);
    preview.forEach((diff: any, idx: number) => {
      const severity = (diff?.severity || 'low').toLowerCase();
      const severityIcon = severity === 'high' ? '🔴' : severity === 'medium' ? '🟡' : '⚪';
      const category = toTitleCase(diff?.category || 'Other');
      const description = (diff?.description || `Diff #${idx + 1}`).trim();

      let filesPart = 'n/a';
      if (Array.isArray(diff?.filePaths) && diff.filePaths.length > 0) {
        const first = diff.filePaths[0];
        const more = diff.filePaths.length - 1;
        filesPart = more > 0 ? `${first} +${more} more` : first;
      }

      lines.push(`- ${severityIcon} **${category}** — ${description}`);
      lines.push(`  - Files: ${filesPart}`);
    });

    if (diffs.length > preview.length) {
      lines.push(`- …and ${diffs.length - preview.length} more differences`);
    }

    return lines.join('\n');
  }
}
