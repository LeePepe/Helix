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
}

// Internal schema for Phase 1: Structure Analysis
const StructurePartSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  focus: z.string().describe('Specific instruction on what to focus on for this part'),
  type: z.enum(['container', 'component', 'variant', 'single']),
});

const StructureAnalysisSchema = z.object({
  type: z.enum(['single', 'composite', 'variants']),
  rootName: z.string(),
  rootRole: z.string().describe('Role of the root element (e.g. "Page", "Dashboard", "Component Set")'),
  parts: z.array(StructurePartSchema),
});

type StructureAnalysis = z.infer<typeof StructureAnalysisSchema>;

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

    // 1. Get design context from Figma
    stream?.markdown(`\n**🎨 Fetching Figma design context...**\n`);
    stream?.markdown(`- Source: \`${input.nodeId || 'not provided'}\`\n`);
    if (effectiveNodeId !== input.nodeId && effectiveNodeId) {
      stream?.markdown(`- Cleaned Node ID: \`${effectiveNodeId}\`\n`);
    }

    const designContextResult = await this.figmaService.getDesignContext(ctx, effectiveNodeId, {
      forceCode: input.forceCode,
    });

    if (!designContextResult.ok) {
      stream?.markdown(`\n❌ **Failed to get design context**\n`);
      throw new Error(`Failed to get Figma design context: ${designContextResult.error?.message}`);
    }

    const designContext = designContextResult.data.content;
    
    if (!designContext || designContext.length === 0) {
       stream?.markdown(`\n⚠️ **Warning: Design context is empty!**\n\n`);
       // Handle empty context gracefully if possible, or throw
       return { schemaVersion: '1.0', root: { id: 'error', name: 'Error', role: 'Error', figmaRefs: [] } };
    }

    stream?.markdown(`\n✅ **Design Context Retrieved** (${designContext.length} chars)\n`);

    // ========================================================================
    // Phase 1: Structure Analysis
    // ========================================================================
    stream?.markdown(`### 🏗️ Phase 1: Analyzing Structure...\n`);
    console.log('[Helix] [FigmaAnalyzer] Phase 1 - Structure Analysis');

    const structure = await this.performStructureAnalysis(ctx, designContext);
    
    stream?.markdown(`**Structure Type**: ${structure.type}\n`);
    stream?.markdown(`**Root**: ${structure.rootName} (${structure.rootRole})\n`);
    stream?.markdown(`**Parts identified**: ${structure.parts.length}\n`);
    structure.parts.forEach(p => {
       stream?.markdown(`- **${p.name}** [${p.type}]: ${p.description}\n`);
    });
    stream?.markdown('\n');

    // ========================================================================
    // Phase 2: Detailed Analysis per Part
    // ========================================================================
    stream?.markdown(`### 🔍 Phase 2: Detailed Analysis...\n`);
    console.log('[Helix] [FigmaAnalyzer] Phase 2 - Detailed Analysis');

    const partResults: FigmaAnalysisResult[] = [];

    // Parallel execution for parts? Or sequential to avoid rate limits?
    // Let's do sequential for safety with LLM limits for now, or limited parallel.
    for (const part of structure.parts) {
      stream?.markdown(`Analyzing part: **${part.name}**...\n`);

      let partContext = designContext;

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
        partResults.push(result);
        console.log(`[Helix] [FigmaAnalyzer] Part '${part.name}' analyzed successfully.`);
      } catch (err) {
        console.error(`[Helix] [FigmaAnalyzer] Failed to analyze part '${part.name}':`, err);
        stream?.markdown(`⚠️ Failed to analyze part **${part.name}**: ${(err as Error).message}\n`);
      }
    }

    // ========================================================================
    // Phase 3: Synthesis
    // ========================================================================
    stream?.markdown(`### 🧩 Phase 3: Synthesis...\n`);
    const finalResult = this.synthesizeResults(structure, partResults);

    // Add trace info
    if (!finalResult.trace) {
      finalResult.trace = [];
    }
    finalResult.trace.push(...ctx.getTraceEvents());

    // Display final summary
    if (stream) {
      if (isDebugMode()) {
        this.displayFigmaAnalysisDetailed(finalResult, stream);
      } else {
        this.displayFigmaAnalysisCompact(finalResult, stream);
      }
    }

    return finalResult;
  }

  /**
   * Phase 1: Identity structure and break down
   */
  private async performStructureAnalysis(
    ctx: ExecutionContext, 
    context: string
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
        
        For each part:
        - **id**: MUST be the actual Figma Node ID found in the source (e.g. "123:456") if available.
        - **type**: classify as 'container', 'component', 'variant', or 'single'.
        - **focus**: Provide a specific instruction on what to look for.`
      ),
      vscode.LanguageModelChatMessage.User(
        `Figma Design Context:\n\n${context}` 
      ),
    ];

    const result = await this.llmService.chatJSON(ctx, messages, {
      name: 'StructureAnalysis',
      description: 'Breakdown of UI structure',
      schema: StructureAnalysisSchema,
    }, { caller: 'FigmaAnalyzerAgent.performStructureAnalysis' });

    if (!result.ok) {
      throw new Error(`Structure analysis failed: ${result.error?.message}`);
    }

    return result.data as StructureAnalysis;
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
    }, { caller: `FigmaAnalyzerAgent.analyzePart:${part.name}` });

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
    if (results.length === 0) {
      throw new Error('No analysis results produced.');
    }

    // Initialize with empty/default
    const distinctCases: any[] = [];
    type TokenSet = Set<string>;
    const mergedTokens: {
      typography: TokenSet;
      colors: TokenSet;
      spacing: TokenSet;
      radius: TokenSet;
      shadows: TokenSet;
    }y[] = [];
    const mergedTokens: any = {
      typography: new Set(),
      colors: new Set(),
      spacing: new Set(),
      radius: new Set(),
      shadows: new Set(),
    };

    // Helper to merge arrays/sets
    results.forEach(r => {
      // Merge Cases
      if (r.cases) distinctCases.push(...r.cases);
      
      // Merge Risks
      if (r.risks) distinctRisks.push(...r.risks);
      
      // Merge Tokens
      if (r.tokensHint) {
        r.tokensHint.typography?.forEach(t => mergedTokens.typography.add(t));
        r.tokensHint.colors?.forEach(t => mergedTokens.colors.add(t));
        r.tokensHint.spacing?.forEach(t => mergedTokens.spacing.add(t));
        r.tokensHint.radius?.forEach(t => mergedTokens.radius.add(t));
        r.tokensHint.shadows?.forEach(t => mergedTokens.shadows.add(t));
      }
    });

    // Construct Root
    let root: any;

    if (results.length === 1 && structure.type === 'single') {
       // Direct pass-through if single
       root = results[0].root;
    } else {
       // Synthetic root for Composite or Variants
       root = {
         id: 'root-synthetic',
         name: structure.rootName,
         role: structure.rootRole,
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
      cases: distinctCases,
      risks: distinctRisks,
      tokensHint: {
        typography: Array.from(mergedTokens.typography),
        colors: Array.from(mergedTokens.colors),
        spacing: Array.from(mergedTokens.spacing),
        radius: Array.from(mergedTokens.radius),
        shadows: Array.from(mergedTokens.shadows),
      }
    };
  };

  /**
   * Compact display for Figma analysis result used in non-debug runs.
   */
  private displayFigmaAnalysisCompact(result: FigmaAnalysisResult, stream: StreamHandler): void {
    stream.markdown('\n---\n\n');
    stream.markdown('### 🎨 Figma Analysis Summary\n');
    
    stream.markdown(`- **Root Element**: ${result.root?.name || 'N/A'} (${result.root?.role || 'Unknown'})\n`);
    stream.markdown(`- **Cross-cutting Cases**: ${result.cases?.length || 0}\n`);
    
    const riskCount = result.risks?.length || 0;
    if (riskCount > 0) {
      stream.markdown(`- **Risks Identified**: ${riskCount}\n`);
    } else {
      stream.markdown(`- **Risks Identified**: None\n`);
    }

    const hasTokens = result.tokensHint && Object.keys(result.tokensHint).length > 0;
    stream.markdown(`- **Tokens Detected**: ${hasTokens ? 'Yes' : 'No'}\n`);
    
    stream.markdown('\n---\n\n');
  }

  /**
   * Detailed display for Figma analysis result used only in debug mode.
   */
  private displayFigmaAnalysisDetailed(result: FigmaAnalysisResult, stream: StreamHandler): void {
    stream.markdown('\n---\n\n');
    stream.markdown('### 🎨 Figma Analysis (DETAILED)\n');

    // Root Element
    if (result.root) {
      stream.markdown('#### 🌳 Root Structure\n');
      stream.markdown(`- **Name**: ${result.root.name}\n`);
      stream.markdown(`- **Role**: ${result.root.role}\n`);
      if (result.root.layoutNotes) {
        stream.markdown(`- **Layout**: ${result.root.layoutNotes}\n`);
      }
      const childrenCount = result.root.children ? result.root.children.length : 0;
      stream.markdown(`- **Children**: ${childrenCount}\n`);
    }

    // Cases
    if (result.cases && result.cases.length > 0) {
      stream.markdown('#### 🧩 Cross-cutting Cases\n');
      let table = '| ID | Title | Description |\n| :--- | :--- | :--- |\n';
      result.cases.forEach((c) => {
        table += `| ${c.id} | ${c.title} | ${c.description} |\n`;
      });
      stream.markdown(table + '\n');
    }

    // Risks
    if (result.risks && result.risks.length > 0) {
      stream.markdown('#### ⚠️ Risks & Issues\n');
      result.risks.forEach((issue) => {
        stream.markdown(`- **${issue.level.toUpperCase()}** (${issue.id}): ${issue.message}${issue.details ? ` — ${issue.details}` : ''}\n`);
      });
      stream.markdown('\n');
    }

    // Tokens Hint
    if (result.tokensHint) {
      stream.markdown('#### 🎨 Tokens Hint\n');
      const hints = result.tokensHint;
      if (hints.colors && hints.colors.length > 0) {
        stream.markdown(`- **Colors**: ${hints.colors.join(', ')}\n`);
      }
      if (hints.typography && hints.typography.length > 0) {
        stream.markdown(`- **Typography**: ${hints.typography.join(', ')}\n`);
      }
      if (hints.spacing && hints.spacing.length > 0) {
        stream.markdown(`- **Spacing**: ${hints.spacing.join(', ')}\n`);
      }
    }

    stream.markdown('\n---\n\n');
  }
}
