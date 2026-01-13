import * as vscode from 'vscode';
import { z } from 'zod';
import { BaseAgent } from './base/Agent';
import { FigmaAnalysisResult, FigmaAnalysisResultSchema } from '../contracts';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { StreamHandler } from '../runtime/StreamHandler';
import { ToolRegistry } from '../runtime/ToolRegistry';
import { FigmaService } from '../services/figmaService';
import { LLMService } from '../services/llmService';
import { isDebugMode } from '../utils/debug';
import promptContent from './prompts/figma-analyzer.md';

/**
 * Agent input for Figma analysis
 */
export interface FigmaAnalyzerInput {
  nodeId?: string;
  forceCode?: boolean;
  userRequest?: string; // User's original query/intent for focused analysis
}

// Internal schema for Phase 1: Structure Analysis
const structurePartSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  focus: z.string().describe('Specific instruction on what to focus on for this part'),
  type: z.enum(['container', 'component', 'variant', 'single']),
});

const structureAnalysisSchema = z.object({
  type: z.enum(['single', 'composite', 'variants']),
  rootName: z.string(),
  rootRole: z.string().describe('Role of the root element (e.g. "Page", "Dashboard", "Component Set")'),
  parts: z.array(structurePartSchema),
});

type StructureAnalysis = z.infer<typeof structureAnalysisSchema>;

/**
 * Figma Analyzer Agent
 * Analyzes Figma designs and produces structured UI breakdown
 * 
 * Uses a two-phase approach:
 * 1. Structure Analysis: Identifies logical parts (sub-views, variants)
 * 2. Detailed Analysis: Analyzes each part deeply
 * 3. Synthesis: Combines results into a unified structure
 */
export class FigmaAnalyzerAgent extends BaseAgent<FigmaAnalyzerInput, FigmaAnalysisResult> {
  readonly name = 'FigmaAnalyzer';
  readonly description = 'Analyzes Figma designs and produces structured UI breakdown';
  readonly outputSchema = FigmaAnalysisResultSchema;

  private readonly figmaService: FigmaService;
  private readonly llmService: LLMService;

  constructor(figmaService?: FigmaService, llmService?: LLMService) {
    super();
    this.figmaService = figmaService ?? new FigmaService();
    this.llmService = llmService ?? new LLMService();
  }

  protected async execute(
    ctx: ExecutionContext,
    _tools: ToolRegistry,
    input: FigmaAnalyzerInput,
    stream?: StreamHandler
  ): Promise<FigmaAnalysisResult> {
    ctx.trace('agent', 'figma-analyzer-execute', { nodeId: input.nodeId });

    // Extract node ID from URL if necessary
    let effectiveNodeId = input.nodeId;
    if (input.nodeId?.includes('figma.com')) {
      const parsed = this.figmaService.parseFigmaUrl(input.nodeId);
      if (parsed.nodeId) {
        effectiveNodeId = parsed.nodeId;
        console.log(`[Helix] [FigmaAnalyzerAgent] Cleaned nodeId from URL: ${effectiveNodeId}`);
      }
    }

    // 1. Get metadata from Figma
    stream?.markdown(`\n**🎨 Fetching Figma metadata...**\n`);
    stream?.markdown(`- Source: \`${input.nodeId || 'not provided'}\`\n`);
    if (effectiveNodeId !== input.nodeId && effectiveNodeId) {
      stream?.markdown(`- Cleaned Node ID: \`${effectiveNodeId}\`\n`);
    }

    const designContextResult = await this.figmaService.getMetadata(ctx, effectiveNodeId);

    if (!designContextResult.ok) {
      stream?.markdown(`\n❌ **Failed to get design context**\n`);
      throw new Error(`Failed to get Figma design context: ${designContextResult.error?.message}`);
    }

    const designContext = designContextResult.data.content;
    
    if (!designContext || designContext.length === 0) {
       stream?.markdown(`\n⚠️ **Warning: Design context is empty!**\n\n`);
       // Handle empty context gracefully if possible, or throw
       return { schemaVersion: '1.0', cases: [], root: { id: 'error', name: 'Error', role: 'Error', figmaRefs: [] } };
    }

    stream?.markdown(`\n✅ **Design Context Retrieved** (${designContext.length} chars)\n`);

    // Debug mode: Output design context preview
    if (stream && isDebugMode()) {
      stream.markdown('\n<details>\n');
      stream.markdown('<summary>🔍 Debug: Design Context Preview</summary>\n\n');
      stream.markdown('```\n');
      stream.markdown(designContext);
      stream.markdown('\n```\n\n');
      stream.markdown('</details>\n\n');
    }

    // ========================================================================
    // Phase 1: Structure Analysis
    // ========================================================================
    stream?.markdown(`### 🏗️ Phase 1: Analyzing Structure...\n`);
    if (input.userRequest) {
      stream?.markdown(`**User Intent**: ${input.userRequest}\n`);
    }
    console.log('[Helix] [FigmaAnalyzer] Phase 1 - Structure Analysis');

    const structure = await this.performStructureAnalysis(ctx, designContext, input.userRequest);

    // Debug: print structure rootName/rootRole to investigate undefined values in synthesis
    try {
      console.log('[Helix][FigmaAnalyzer] DEBUG structure.rootName:', structure?.rootName);
      console.log('[Helix][FigmaAnalyzer] DEBUG structure.rootRole :', structure?.rootRole);
      console.log('[Helix][FigmaAnalyzer] DEBUG structure (full):', JSON.stringify(structure, null, 2));
    } catch (e) {
      console.warn('[Helix][FigmaAnalyzer] DEBUG failed to log structure', e);
    }

    stream?.markdown(`\n**✅ Structure Analysis Complete**\n\n`);
    stream?.markdown(`**Structure Type**: ${structure.type}\n`);
    stream?.markdown(`**Root**: ${structure.rootName} (${structure.rootRole})\n`);
    stream?.markdown(`**Parts identified**: ${structure.parts.length}\n`);
    structure.parts.forEach(p => {
       stream?.markdown(`- **${p.name}** [${p.type}]: ${p.description}\n`);
    });
    stream?.markdown('\n');

    // Debug mode: Output raw structure analysis result
    if (stream && isDebugMode()) {
      stream.markdown('<details>\n');
      stream.markdown('<summary>🔍 Debug: Phase 1 Raw Structure Analysis</summary>\n\n');
      stream.markdown('```json\n');
      stream.markdown(JSON.stringify(structure, null, 2));
      stream.markdown('\n```\n\n');
      stream.markdown('</details>\n\n');
    }

    // ========================================================================
    // Phase 2: Detailed Analysis per Part
    // ========================================================================
    stream?.markdown(`### 🔍 Phase 2: Detailed Analysis...\n`);
    console.log('[Helix] [FigmaAnalyzer] Phase 2 - Detailed Analysis');

    const partResults: FigmaAnalysisResult[] = [];
    const MAX_PARALLEL = 4;

    // Helper function to analyze a single part
    const analyzePartWithContext = async (part: typeof structure.parts[0]) => {
      stream?.markdown(`Analyzing part: **${part.name}**...\n`);

      let partContext = designContext;
      let rawFigmaData = designContext; // Store the raw data

      // Optimization: If the part has a specific Node ID different from the root,
      // fetch its specific context to reduce noise and context window usage.
      if (part.id && part.id !== effectiveNodeId && part.id.includes(':')) {
         try {
            stream?.markdown(`  - ⬇️ Fetching specific details for node \`${part.id}\`...\n`);
            const partResult = await this.figmaService.getDesignContext(ctx, part.id, {
                forceCode: input.forceCode
            });
            if (partResult.ok && partResult.data?.content) {
                partContext = partResult.data.content;
                rawFigmaData = partResult.data.content; // Store specific raw data
                stream?.markdown(`  - ✅ Loaded specific context (${partContext.length} chars)\n`);
            } else {
                stream?.markdown(`  - ⚠️ Could not fetch specific details, using shared context.\n`);
            }
         } catch (fetchError) {
             console.warn(`[Helix] [FigmaAnalyzer] Failed to fetch details for part ${part.id}`, fetchError);
             stream?.markdown(`  - ⚠️ Fetch error, using shared context.\n`);
         }
      }

      try {
        const result = await this.analyzePart(ctx, partContext, part);

        // Inject rawFigmaData into the root of the result
        if (result.root) {
          result.root.rawFigmaData = rawFigmaData;
        }

        console.log(`[Helix] [FigmaAnalyzer] Part '${part.name}' analyzed successfully.`);
        console.log(`[Helix] [FigmaAnalyzer] Part '${part.name}' result:`, JSON.stringify(result, null, 2));
        stream?.markdown(`  - ✅ **${part.name}** analyzed successfully\n`);

        // Debug mode: Output raw part analysis result
        if (stream && isDebugMode()) {
          stream.markdown(`  <details>\n`);
          stream.markdown(`  <summary>🔍 Debug: ${part.name} Analysis Result</summary>\n\n`);
          stream.markdown('  ```json\n');
          stream.markdown(JSON.stringify(result, null, 2).split('\n').map(line => '  ' + line).join('\n'));
          stream.markdown('\n  ```\n\n');
          stream.markdown('  </details>\n\n');
        }

        return { success: true, result, part, rawFigmaData };
      } catch (err) {
        console.error(`[Helix] [FigmaAnalyzer] Failed to analyze part '${part.name}':`, err);
        stream?.markdown(`  - ⚠️ Failed to analyze part **${part.name}**: ${(err as Error).message}\n`);
        return { success: false, error: err, part, rawFigmaData };
      }
    };

    // Process parts in batches of MAX_PARALLEL
    for (let i = 0; i < structure.parts.length; i += MAX_PARALLEL) {
      const batch = structure.parts.slice(i, i + MAX_PARALLEL);
      stream?.markdown(`\n**Batch ${Math.floor(i / MAX_PARALLEL) + 1}**: Processing ${batch.length} part(s) in parallel...\n`);

      const batchPromises = batch.map(part => analyzePartWithContext(part));
      const batchResults = await Promise.all(batchPromises);

      // Collect successful results
      batchResults.forEach(({ success, result }) => {
        if (success && result) {
          partResults.push(result);
        }
      });
    }

    // Phase 2 Summary
    stream?.markdown(`\n**✅ Phase 2 Complete**: Analyzed ${partResults.length}/${structure.parts.length} part(s) successfully\n\n`);

    // ========================================================================
    // Phase 3: Synthesis
    // ========================================================================
    stream?.markdown(`### 🧩 Phase 3: Synthesis...\n`);
    console.log('[Helix] [FigmaAnalyzer] Phase 3 - Synthesis of results');
    console.log('[Helix] [FigmaAnalyzer] Number of part results to synthesize:', partResults);

    stream?.markdown(`Merging ${partResults.length} analysis result(s)...\n`);
    const finalResult = this.synthesizeResults(structure, partResults);
    stream?.markdown(`✅ Synthesis complete\n\n`);

    // Add trace info
    if (!finalResult.trace) {
      finalResult.trace = [];
    }
    finalResult.trace.push(...ctx.getTraceEvents());

    // Debug mode: Output synthesis details
    if (stream && isDebugMode()) {
      stream.markdown('<details>\n');
      stream.markdown('<summary>🔍 Debug: Phase 3 Synthesis Details</summary>\n\n');
      stream.markdown(`**Input Structure:**\n`);
      stream.markdown('```json\n');
      stream.markdown(JSON.stringify({
        type: structure.type,
        rootName: structure.rootName,
        rootRole: structure.rootRole,
        partsCount: structure.parts.length
      }, null, 2));
      stream.markdown('\n```\n\n');
      stream.markdown(`**Part Results Count:** ${partResults.length}\n\n`);
      stream.markdown(`**Merged Statistics:**\n`);
      stream.markdown(`- Cases: ${finalResult.cases?.length || 0}\n`);
      stream.markdown(`- Risks: ${finalResult.risks?.length || 0}\n`);
      stream.markdown(`- Color Tokens: ${finalResult.tokensHint?.colors?.length || 0}\n`);
      stream.markdown(`- Typography Tokens: ${finalResult.tokensHint?.typography?.length || 0}\n`);
      stream.markdown(`- Spacing Tokens: ${finalResult.tokensHint?.spacing?.length || 0}\n`);
      stream.markdown('\n</details>\n\n');
    }

    // Stream output: Display analysis results before returning
    if (stream) {
      stream.markdown('\n---\n\n');
      stream.markdown('### ✅ Figma Analysis Completed\n\n');

      // Display root structure
      stream.markdown('#### 🌳 Root Structure\n');
      stream.markdown(`- **Name**: ${finalResult.root?.name || 'N/A'}\n`);
      stream.markdown(`- **Role**: ${finalResult.root?.role || 'Unknown'}\n`);
      if (finalResult.root?.layoutNotes) {
        stream.markdown(`- **Layout**: ${finalResult.root.layoutNotes}\n`);
      }
      const childrenCount = finalResult.root?.children?.length || 0;
      stream.markdown(`- **Children**: ${childrenCount}\n\n`);

      // Display cases
      if (finalResult.cases && finalResult.cases.length > 0) {
        stream.markdown('#### 🧩 Cross-cutting Cases\n');
        stream.markdown(`Found **${finalResult.cases.length}** case(s):\n`);
        finalResult.cases.forEach((c, idx) => {
          stream.markdown(`${idx + 1}. **${c.title}** (${c.id}): ${c.description}\n`);
        });
        stream.markdown('\n');
      } else {
        stream.markdown('#### 🧩 Cross-cutting Cases\n');
        stream.markdown('No cross-cutting cases identified.\n\n');
      }

      // Display risks
      if (finalResult.risks && finalResult.risks.length > 0) {
        stream.markdown('#### ⚠️ Risks & Issues\n');
        stream.markdown(`Found **${finalResult.risks.length}** risk(s):\n`);
        finalResult.risks.forEach((issue, idx) => {
          const emoji = issue.level === 'error' ? '❌' : issue.level === 'warning' ? '⚠️' : 'ℹ️';
          stream.markdown(`${idx + 1}. ${emoji} **${issue.level.toUpperCase()}** (${issue.id}): ${issue.message}${issue.details ? ` — ${issue.details}` : ''}\n`);
        });
        stream.markdown('\n');
      } else {
        stream.markdown('#### ⚠️ Risks & Issues\n');
        stream.markdown('No risks identified.\n\n');
      }

      // Display tokens
      if (finalResult.tokensHint) {
        stream.markdown('#### 🎨 Design Tokens\n');
        const hints = finalResult.tokensHint;
        let hasTokens = false;

        if (hints.colors && hints.colors.length > 0) {
          stream.markdown(`- **Colors** (${hints.colors.length}): ${hints.colors.slice(0, 5).join(', ')}${hints.colors.length > 5 ? '...' : ''}\n`);
          hasTokens = true;
        }
        if (hints.typography && hints.typography.length > 0) {
          stream.markdown(`- **Typography** (${hints.typography.length}): ${hints.typography.slice(0, 5).join(', ')}${hints.typography.length > 5 ? '...' : ''}\n`);
          hasTokens = true;
        }
        if (hints.spacing && hints.spacing.length > 0) {
          stream.markdown(`- **Spacing** (${hints.spacing.length}): ${hints.spacing.slice(0, 5).join(', ')}${hints.spacing.length > 5 ? '...' : ''}\n`);
          hasTokens = true;
        }
        if (hints.radius && hints.radius.length > 0) {
          stream.markdown(`- **Radius** (${hints.radius.length}): ${hints.radius.slice(0, 5).join(', ')}${hints.radius.length > 5 ? '...' : ''}\n`);
          hasTokens = true;
        }
        if (hints.shadows && hints.shadows.length > 0) {
          stream.markdown(`- **Shadows** (${hints.shadows.length}): ${hints.shadows.slice(0, 5).join(', ')}${hints.shadows.length > 5 ? '...' : ''}\n`);
          hasTokens = true;
        }

        if (!hasTokens) {
          stream.markdown('No design tokens detected.\n');
        }
        stream.markdown('\n');
      }

      // Debug mode: Output raw JSON
      if (isDebugMode()) {
        stream.markdown('#### 🔍 Debug: Raw Analysis Result\n\n');
        stream.markdown('```json\n');
        stream.markdown(JSON.stringify(finalResult, null, 2));
        stream.markdown('\n```\n\n');
      }

      stream.markdown('---\n\n');
      stream.markdown('🎉 **Analysis ready for code generation**\n\n');
    }
    console.log('[Helix] [FigmaAnalyzer] Analysis complete.', finalResult);

    return finalResult;
  }

  /**
   * Phase 1: Identity structure and break down
   */
  private async performStructureAnalysis(
    ctx: ExecutionContext, 
    context: string,
    userRequest?: string
  ): Promise<StructureAnalysis> {
    const messages = [
      vscode.LanguageModelChatMessage.User(
        `You are a Senior UI Architect. Analyze the provided Figma design data to understand its high-level structure.

        Determine if this design represents:
        1. A **Single** component or view.
        2. A **Composite** UI consisting of multiple distinct logical regions (e.g., Header, Sidebar, Content Area, Footer).
        3. A **Variant** collection (e.g., Component Set with Primary/Secondary/Disabled states).

        Break down the design into logical **Parts** for detailed analysis. 
        - If it's a huge page, split it into sub-views.
        - If it's a component set, split into variants.
        - If it's simple, keep it as a single part.

        IMPORTANT: The response MUST include top-level fields 'rootName' and 'rootRole' that describe the name and role of the design root (for example: "Dashboard" and "Page"). These fields are required for downstream synthesis. If the root cannot be determined from the context, return sensible defaults: 'rootName: "Unknown Root"', 'rootRole: "Unknown Role"'.

        For each part:
        - **id**: MUST be the actual Figma Node ID found in the source (e.g. "123:456" or "123-456") if available. If unknown, use an empty string.
        - **type**: classify as 'container', 'component', 'variant', or 'single'.
        - **focus**: Provide a specific instruction on what to look for.${
          userRequest
            ? `\n\n**IMPORTANT - User's Intent**: ${userRequest}\n\nFocus your analysis on parts that are relevant to this user request. Filter out unrelated components.`
            : ''
        }\n\nExample JSON output exactly matching the schema (no extra prose):\n\n{"type":"composite","rootName":"Dashboard","rootRole":"Page","parts":[{"id":"123:456","name":"Header","description":"Top navigation and brand area","focus":"Identify navigation items and brand behaviors","type":"container"}]}`
      ),
      vscode.LanguageModelChatMessage.User(
        `Figma Design Context:\n\n${context}` 
      ),
    ];

    const result = await this.llmService.chatJSON(ctx, messages, {
      name: 'StructureAnalysis',
      description: 'Breakdown of UI structure',
      schema: structureAnalysisSchema,
    });

    if (!result.ok) {
      throw new Error(`Structure analysis failed: ${result.error?.message}`);
    }

    // Ensure runtime safety: provide fallbacks if LLM returned undefined rootName/rootRole/parts
    const data = result.data as Partial<StructureAnalysis> | undefined;

    if (!data) {
      throw new Error(`Structure analysis returned no data: ${result.error?.message}`);
    }
    console.log('[Helix][FigmaAnalyzer] Raw StructureAnalysis from LLM:', JSON.stringify(data, null, 2));
    // Provide safe defaults to avoid undefined errors downstream
    const safe: StructureAnalysis = {
      type: (data.type as any) ?? 'single',
      rootName: data.rootName ?? 'Unknown Root',
      rootRole: data.rootRole ?? 'Unknown Role',
      parts: Array.isArray(data.parts) && data.parts.length > 0 ? (data.parts as any) : [{
        id: '',
        name: data.rootName ?? 'root',
        description: 'Auto-generated single part due to missing analysis parts.',
        focus: 'Perform full analysis on the provided context',
        type: 'single' as const,
      }],
    };
    console.log('[Helix][FigmaAnalyzer] Safe StructureAnalysis:', JSON.stringify(safe, null, 2));
    return safe;
  }

  /**
   * Phase 2: Analyze a specific part
   */
  private async analyzePart(
    ctx: ExecutionContext,
    context: string,
    part: { name: string, focus: string }
  ): Promise<FigmaAnalysisResult> {
     const messages = [
      vscode.LanguageModelChatMessage.User(promptContent), // Base prompt
      vscode.LanguageModelChatMessage.User(
        `IMPORTANT: Focus your analysis ONLY on the following part of the design:
        
        **Target**: ${part.name}
        **Focus**: ${part.focus}
        
        Ignore other unrelated parts of the design data if possible.
        Return a complete 'FigmaAnalysisResult' struct for this part.`
      ),
      vscode.LanguageModelChatMessage.User(
        `Figma Design Context:\n\n${context}`
      ),
    ];

    const result = await this.llmService.chatJSON(ctx, messages, {
      name: 'FigmaAnalysisResult',
      description: `Detailed analysis of ${part.name}`,
      schema: FigmaAnalysisResultSchema,
    });

    if (!result.ok) {
      throw new Error(`Part analysis failed for ${part.name}: ${result.error?.message}`);
    }
    
    return result.data as FigmaAnalysisResult;
  }

  /**
   * Phase 3: Synthesize results
   */
  private synthesizeResults(
    structure: StructureAnalysis,
    results: FigmaAnalysisResult[]
  ): FigmaAnalysisResult {
    // Debug: log incoming structure and results to trace undefined rootName/rootRole
    try {
      console.log('[Helix][FigmaAnalyzer] ENTER synthesizeResults. structure.type =', structure?.type);
      console.log('[Helix][FigmaAnalyzer] ENTER synthesizeResults. structure.rootName =', structure?.rootName);
      console.log('[Helix][FigmaAnalyzer] ENTER synthesizeResults. structure.rootRole =', structure?.rootRole);
      console.log('[Helix][FigmaAnalyzer] ENTER synthesizeResults. structure (full) =', JSON.stringify(structure, null, 2));
      console.log('[Helix][FigmaAnalyzer] ENTER synthesizeResults. results length =', results?.length);
    } catch (e) {
      console.warn('[Helix][FigmaAnalyzer] DEBUG synthesizeResults - failed to stringify structure', e);
    }

    if (results.length === 0) {
      throw new Error('No analysis results produced.');
    }

    // Initialize with empty/default
    const distinctCases: any[] = [];
    const distinctRisks: any[] = [];
    type TokenSet = Set<string>;
    const mergedTokens: {
      typography: TokenSet;
      colors: TokenSet;
      spacing: TokenSet;
      radius: TokenSet;
      shadows: TokenSet;
    } = {
      typography: new Set(),
      colors: new Set(),
      spacing: new Set(),
      radius: new Set(),
      shadows: new Set(),
    };

    // Helper to merge arrays/sets
    results.forEach(r => {
      // Merge Cases
      if (r.cases) {
        distinctCases.push(...r.cases);
      }
      
      // Merge Risks
      if (r.risks) {
        distinctRisks.push(...r.risks);
      }
      
      // Merge Tokens
      if (r.tokensHint) {
        r.tokensHint.typography?.forEach((t: string) => mergedTokens.typography.add(t));
        r.tokensHint.colors?.forEach((t: string) => mergedTokens.colors.add(t));
        r.tokensHint.spacing?.forEach((t: string) => mergedTokens.spacing.add(t));
        r.tokensHint.radius?.forEach((t: string) => mergedTokens.radius.add(t));
        r.tokensHint.shadows?.forEach((t: string) => mergedTokens.shadows.add(t));
      }
    });

    // Construct Root
    let root: any;

    if (results.length === 1 && structure.type === 'single') {
       // Direct pass-through if single
       root = results[0].root;

       // Defensive: ensure required fields exist on the returned root
       if (!root.name) {
         root.name = structure.rootName ?? 'Unknown Root';
       }
       if (!root.role) {
         root.role = structure.rootRole ?? 'Unknown Role';
       }
    } else {
       // Synthetic root for Composite or Variants
       root = {
         id: 'root-synthetic',
         name: structure.rootName ?? 'Unknown Root',
         role: structure.rootRole ?? 'Unknown Role',
         figmaRefs: [], // Could try to extract shared refs
         layoutNotes: 'Synthetic root aggregation',
         children: results.map(r => r.root),
         variants: [], // If Variants type, maybe move children to variants? 
       };
       
       // Special handling for variants type?
       // Currently mapping everything as children is safest for "UI Structure"
       // But if they are strictly variants of the same component, maybe we should structure differently.
       // However, UIPart recursion uses `children`. Variants field in UIPart is for DiscoveredCaseSchema (states).
       // So children is the correct structural composition.
    }

    return {
      schemaVersion: '1.0',
      root,
      cases: distinctCases.length > 0 ? distinctCases : undefined,
      risks: distinctRisks.length > 0 ? distinctRisks : undefined,
      tokensHint: (mergedTokens.typography.size > 0 || mergedTokens.colors.size > 0 ||
                   mergedTokens.spacing.size > 0 || mergedTokens.radius.size > 0 ||
                   mergedTokens.shadows.size > 0) ? {
        typography: Array.from(mergedTokens.typography),
        colors: Array.from(mergedTokens.colors),
        spacing: Array.from(mergedTokens.spacing),
        radius: Array.from(mergedTokens.radius),
        shadows: Array.from(mergedTokens.shadows),
      } : undefined
    };
  };

}
