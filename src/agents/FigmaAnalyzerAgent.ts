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

/**
 * Agent input for Figma analysis
 */
export interface FigmaAnalyzerInput {
  nodeId?: string; // Single node ID or multiple URLs/nodeIds separated by spaces, commas, or newlines
  nodeIds?: string[]; // Explicit array of node IDs (takes precedence if provided)
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
    ctx.trace('agent', 'figma-analyzer-execute', { nodeId: input.nodeId, nodeIds: input.nodeIds });

    console.log('[Helix] [FigmaAnalyzerAgent] === START execute ===');
    console.log('[Helix] [FigmaAnalyzerAgent] input.nodeId:', input.nodeId);
    console.log('[Helix] [FigmaAnalyzerAgent] input.nodeId type:', typeof input.nodeId);
    console.log('[Helix] [FigmaAnalyzerAgent] input.nodeIds:', input.nodeIds);

    // Parse and collect all node IDs from input
    let effectiveNodeIds: string[] = [];

    // Priority 1: Use explicit nodeIds array if provided
    if (input.nodeIds && input.nodeIds.length > 0) {
      effectiveNodeIds = input.nodeIds;
      console.log(`[Helix] [FigmaAnalyzerAgent] Using explicit nodeIds array: ${effectiveNodeIds.join(', ')}`);
    }
    // Priority 2: Parse nodeId string (may contain multiple URLs)
    else if (input.nodeId) {
      console.log('[Helix] [FigmaAnalyzerAgent] Checking if nodeId contains figma.com...');
      console.log('[Helix] [FigmaAnalyzerAgent] includes figma.com:', input.nodeId.includes('figma.com'));

      if (input.nodeId.includes('figma.com')) {
        // Check if there are multiple URLs in the input
        console.log('[Helix] [FigmaAnalyzerAgent] Calling parseMultipleFigmaUrls...');
        const parsed = this.figmaService.parseMultipleFigmaUrls(input.nodeId);
        console.log('[Helix] [FigmaAnalyzerAgent] parseMultipleFigmaUrls returned:', parsed);
        if (parsed.nodeIds.length > 0) {
          effectiveNodeIds = parsed.nodeIds;
          console.log(`[Helix] [FigmaAnalyzerAgent] Parsed ${effectiveNodeIds.length} nodeIds from URLs: ${effectiveNodeIds.join(', ')}`);
        }
      } else {
        // Not a URL, treat as direct node ID(s) - check for comma/space separated
        const ids = input.nodeId.split(/[\s,]+/).filter(id => id.trim());
        effectiveNodeIds = ids;
        console.log(`[Helix] [FigmaAnalyzerAgent] Using direct nodeIds: ${effectiveNodeIds.join(', ')}`);
      }
    }

    console.log('[Helix] [FigmaAnalyzerAgent] Final effectiveNodeIds:', effectiveNodeIds);

    // For backward compatibility, use first nodeId for single-node operations
    const effectiveNodeId = effectiveNodeIds.length > 0 ? effectiveNodeIds[0] : undefined;

    // 1. Get metadata and design context from Figma
    stream?.markdown(`\n### 🎨 Fetching Figma Data\n\n`);
    stream?.markdown(`**Source:** \`${input.nodeId || 'current selection'}\`\n`);
    if (effectiveNodeIds.length > 1) {
      stream?.markdown(`**Parsed Node IDs:** ${effectiveNodeIds.length} nodes\n`);
      effectiveNodeIds.forEach((id, idx) => {
        stream?.markdown(`  ${idx + 1}. \`${id}\`\n`);
      });
    } else if (effectiveNodeId && effectiveNodeId !== input.nodeId) {
      stream?.markdown(`**Node ID:** \`${effectiveNodeId}\`\n`);
    }
    stream?.markdown(`\n`);

    // Fetch metadata and design context for all node IDs
    const nodeIdsToFetch = effectiveNodeIds.length > 0 ? effectiveNodeIds : [undefined];
    const allMetadata: string[] = [];
    const allDesignContext: string[] = [];

    for (let i = 0; i < nodeIdsToFetch.length; i++) {
      const nodeId = nodeIdsToFetch[i];
      const nodeLabel = nodeId || 'current selection';

      if (nodeIdsToFetch.length > 1) {
        stream?.progress(`Fetching data for node ${i + 1}/${nodeIdsToFetch.length}: ${nodeLabel}...`);
      }

      const metadataResult = await this.figmaService.getMetadata(ctx, nodeId);

      if (!metadataResult.ok) {
        stream?.markdown(`\n❌ **Failed to get metadata for \`${nodeLabel}\`**\n`);
        if (nodeIdsToFetch.length === 1) {
          throw new Error(`Failed to get Figma metadata: ${metadataResult.error?.message}`);
        }
        console.warn(`[Helix] [FigmaAnalyzer] Skipping node ${nodeId}: ${metadataResult.error?.message}`);
        continue;
      }

      const nodeMetadata = metadataResult.data.content;
      if (!nodeMetadata || nodeMetadata.length === 0) {
        stream?.markdown(`⚠️ **Warning:** Metadata is empty for \`${nodeLabel}\`\n\n`);
        continue;
      }

      allMetadata.push(nodeMetadata);

      // Fetch design context for this node
      const designContextResult = await this.figmaService.getDesignContext(ctx, nodeId, {
        forceCode: input.forceCode,
      });

      if (!designContextResult.ok) {
        console.warn(`[Helix] [FigmaAnalyzer] Failed to get design context for ${nodeId}, using metadata`);
        allDesignContext.push(nodeMetadata);
      } else {
        allDesignContext.push(designContextResult.data.content);
      }
    }

    if (allMetadata.length === 0) {
      stream?.markdown(`⚠️ **Warning:** No valid metadata retrieved\n\n`);
      return {
        schemaVersion: '1.0',
        root: { id: 'error', name: 'Error', role: 'Error', figmaRefs: [] },
        metadata: '',
        designContext: ''
      };
    }

    // Combine metadata and design context from all nodes
    const metadata = allMetadata.length === 1
      ? allMetadata[0]
      : allMetadata.map((m, i) => `<!-- Node ${i + 1}: ${effectiveNodeIds[i] || 'selection'} -->\n${m}`).join('\n\n');

    const designContext = allDesignContext.length === 1
      ? allDesignContext[0]
      : allDesignContext.map((dc, i) => `/* Node ${i + 1}: ${effectiveNodeIds[i] || 'selection'} */\n${dc}`).join('\n\n');

    stream?.markdown(`✅ **Data Retrieved:** ${metadata.length.toLocaleString()} chars metadata, ${designContext.length.toLocaleString()} chars design context\n\n`);

    // Stream metadata output directly
    if (stream && isDebugMode()) {
      stream.markdown('\n<details>\n');
      stream.markdown('<summary>📋 Debug: Raw Metadata (XML Structure)</summary>\n\n');
      stream.markdown('```xml\n');
      stream.markdown(metadata);
      stream.markdown('\n```\n\n');
      stream.markdown('</details>\n\n');

      if (designContext !== metadata) {
        stream.markdown('<details>\n');
        stream.markdown('<summary>🎨 Debug: Raw Design Context (Full Data)</summary>\n\n');
        stream.markdown('```json\n');
        stream.markdown(designContext);
        stream.markdown('\n```\n\n');
        stream.markdown('</details>\n\n');
      }
    }

    // ========================================================================
    // Phase 1: Structure Analysis
    // ========================================================================
    stream?.markdown(`### 🏗️ Phase 1: Structure Analysis\n\n`);
    if (input.userRequest) {
      stream?.markdown(`**User Intent:** ${input.userRequest}\n\n`);
    }
    stream?.progress('Analyzing structure...');
    console.log('[Helix] [FigmaAnalyzer] Phase 1 - Structure Analysis');

    // Use metadata for structure analysis (lightweight)
    const structure = await this.performStructureAnalysis(ctx, metadata, input.userRequest);

    console.log('[Helix] [FigmaAnalyzer] Structure analysis:', {
      rootName: structure.rootName,
      rootRole: structure.rootRole,
      type: structure.type,
      partsCount: structure.parts.length
    });

    stream?.markdown(`**✅ Structure Analysis Complete**\n\n`);
    stream?.markdown(`- **Type:** ${structure.type}\n`);
    stream?.markdown(`- **Root:** ${structure.rootName} (${structure.rootRole})\n`);
    stream?.markdown(`- **Parts:** ${structure.parts.length}\n\n`);

    if (structure.parts.length > 0) {
      stream?.markdown(`**Breakdown:**\n`);
      structure.parts.forEach((p, idx) => {
        stream?.markdown(`${idx + 1}. **${p.name}** [${p.type}] - ${p.description}\n`);
      });
      stream?.markdown('\n');
    }

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
    stream?.markdown(`### 🔍 Phase 2: Detailed Analysis\n\n`);
    stream?.progress('Analyzing parts...');
    console.log('[Helix] [FigmaAnalyzer] Phase 2 - Detailed Analysis');

    const partResults: FigmaAnalysisResult[] = [];

    // Process parts sequentially
    for (let i = 0; i < structure.parts.length; i++) {
      const part = structure.parts[i];
      stream?.progress(`Analyzing part ${i + 1}/${structure.parts.length}: ${part.name}...`);

      let partMetadata = metadata;
      let partDesignContext = designContext;

      // Optimization: If the part has a specific Node ID different from the root,
      // fetch its specific metadata and design context to reduce noise and context window usage.
      if (part.id && part.id !== effectiveNodeId && part.id.includes(':')) {
        try {
          stream?.progress(`Fetching data for ${part.name}...`);

          // Fetch metadata for structure
          const partMetadataResult = await this.figmaService.getMetadata(ctx, part.id);
          if (partMetadataResult.ok && partMetadataResult.data?.content) {
            partMetadata = partMetadataResult.data.content;
          }

          // Fetch design context for code generation
          const partContextResult = await this.figmaService.getDesignContext(ctx, part.id, {
            forceCode: input.forceCode,
          });
          if (partContextResult.ok && partContextResult.data?.content) {
            partDesignContext = partContextResult.data.content;

            // Stream the data directly
            if (stream && isDebugMode()) {
              stream.markdown('  <details>\n');
              stream.markdown(`  <summary>📋 Data for ${part.name}</summary>\n\n`);
              stream.markdown('  ```xml\n');
              stream.markdown(partMetadata.substring(0, 2000));
              if (partMetadata.length > 2000) {
                stream.markdown('\n... (truncated)\n');
              }
              stream.markdown('\n  ```\n\n');
              stream.markdown('  </details>\n\n');
            }
          }
        } catch (fetchError) {
          console.warn(`[Helix] [FigmaAnalyzer] Failed to fetch data for part ${part.id}`, fetchError);
        }
      }

      try {
        // Analyze the part
        const result = await this.analyzePart(ctx, partMetadata, partDesignContext, {
          id: part.id,
          name: part.name,
          role: part.type
        });

        console.log(`[Helix] [FigmaAnalyzer] Part '${part.name}' analyzed successfully`);
        partResults.push(result);

        // Debug mode: Output raw part analysis result
        if (stream && isDebugMode()) {
          stream.markdown(`  <details>\n`);
          stream.markdown(`  <summary>🔍 Debug: ${part.name} - Raw Input Metadata</summary>\n\n`);
          stream.markdown('  ```xml\n');
          stream.markdown(partMetadata.split('\n').map((line: string) => '  ' + line).join('\n'));
          stream.markdown('\n  ```\n\n');
          stream.markdown('  </details>\n\n');

          stream.markdown(`  <details>\n`);
          stream.markdown(`  <summary>🔍 Debug: ${part.name} - Raw Input Design Context</summary>\n\n`);
          stream.markdown('  ```json\n');
          stream.markdown(partDesignContext.split('\n').map((line: string) => '  ' + line).join('\n'));
          stream.markdown('\n  ```\n\n');
          stream.markdown('  </details>\n\n');

          stream.markdown(`  <details>\n`);
          stream.markdown(`  <summary>🔍 Debug: ${part.name} - Analysis Result</summary>\n\n`);
          stream.markdown('  ```json\n');
          stream.markdown(JSON.stringify(result, null, 2).split('\n').map((line: string) => '  ' + line).join('\n'));
          stream.markdown('\n  ```\n\n');
          stream.markdown('  </details>\n\n');
        }
      } catch (err) {
        console.error(`[Helix] [FigmaAnalyzer] Failed to analyze part '${part.name}':`, err);
        stream?.markdown(`⚠️ Failed to analyze ${part.name}: ${(err as Error).message}\n`);
      }
    }

    // Phase 2 Summary
    const totalMetadataSize = partResults.reduce((sum, r) => sum + (r.metadata?.length || 0), 0);
    const totalDesignContextSize = partResults.reduce((sum, r) => sum + (r.designContext?.length || 0), 0);

    stream?.markdown(`**✅ Phase 2 Complete:** ${partResults.length}/${structure.parts.length} parts analyzed\n`);
    stream?.markdown(`- Metadata: ${totalMetadataSize.toLocaleString()} chars\n`);
    stream?.markdown(`- Design context: ${totalDesignContextSize.toLocaleString()} chars\n\n`);

    // ========================================================================
    // Phase 3: Synthesis
    // ========================================================================
    stream?.markdown(`### 🧩 Phase 3: Synthesis\n\n`);
    stream?.progress('Synthesizing results...');
    console.log('[Helix] [FigmaAnalyzer] Phase 3 - Synthesizing', partResults.length, 'results');

    const finalResult = this.synthesizeResults(structure, partResults, metadata, designContext);

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
      stream.markdown('\n</details>\n\n');

      // Output raw input data
      stream.markdown('<details>\n');
      stream.markdown('<summary>🔍 Debug: Raw Input Metadata (XML)</summary>\n\n');
      stream.markdown('```xml\n');
      stream.markdown(metadata);
      stream.markdown('\n```\n\n');
      stream.markdown('</details>\n\n');

      stream.markdown('<details>\n');
      stream.markdown('<summary>🔍 Debug: Raw Input Design Context</summary>\n\n');
      stream.markdown('```json\n');
      stream.markdown(designContext);
      stream.markdown('\n```\n\n');
      stream.markdown('</details>\n\n');
    }

    // Stream output: Display analysis results before returning
    if (stream) {
      stream.markdown('\n---\n\n');
      stream.markdown('### ✅ Analysis Complete\n\n');

      const partsCount = (finalResult.root as any)?.parts?.length || 0;
      stream.markdown(`**Root:** ${finalResult.root?.name || 'N/A'} (${finalResult.root?.role || 'Unknown'})\n`);
      if (partsCount > 0) {
        stream.markdown(`**Parts:** ${partsCount}\n`);
      }
      stream.markdown(`**Metadata:** ${finalResult.metadata?.length.toLocaleString() || 0} chars\n`);
      stream.markdown(`**Design Context:** ${finalResult.designContext?.length.toLocaleString() || 0} chars\n\n`);

      // Debug mode: Output raw JSON
      if (isDebugMode()) {
        stream.markdown('<details>\n');
        stream.markdown('<summary>🔍 Debug: Raw Analysis Result</summary>\n\n');
        stream.markdown('```json\n');
        stream.markdown(JSON.stringify(finalResult, null, 2));
        stream.markdown('\n```\n\n');
        stream.markdown('</details>\n\n');
      }

      stream.markdown('🎉 Ready for code generation\n\n');
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
    const userIntentSection = userRequest
      ? `\n\n**IMPORTANT - User's Intent**: ${userRequest}\n\nFocus your analysis on parts that are relevant to this user request. Filter out unrelated components.`
      : '';

    const messages = [
      vscode.LanguageModelChatMessage.User(
        `You are a Senior UI Architect. Analyze the provided Figma metadata (XML format) to understand its high-level structure.

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
- **focus**: Provide a specific instruction on what to look for.${userIntentSection}

Example JSON output exactly matching the schema (no extra prose):

{"type":"composite","rootName":"Dashboard","rootRole":"Page","parts":[{"id":"123:456","name":"Header","description":"Top navigation and brand area","focus":"Identify navigation items and brand behaviors","type":"container"}]}`
      ),
      vscode.LanguageModelChatMessage.User(
        `Figma Metadata (XML format with node IDs, layer types, names, positions, sizes):\n\n${context}`
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

    return safe;
  }

  /**
   * Phase 2: Fetch data for a specific part (no LLM analysis)
   */
  private async analyzePart(
    _ctx: ExecutionContext,
    metadata: string,
    designContext: string,
    part: { id: string, name: string, role: string }
  ): Promise<FigmaAnalysisResult> {
    // Simply return the data structure without LLM analysis
    return {
      schemaVersion: '1.0',
      root: {
        id: part.id,
        name: part.name,
        role: part.role,
        figmaRefs: part.id && part.id.includes(':') ? [{ nodeId: part.id }] : [],
        metadata: metadata,
        designContext: designContext,
      },
      metadata: metadata,
      designContext: designContext,
    };
  }

  /**
   * Phase 3: Synthesize results - merge multiple parts into one result
   */
  private synthesizeResults(
    structure: StructureAnalysis,
    results: FigmaAnalysisResult[],
    metadata: string,
    designContext: string
  ): FigmaAnalysisResult {
    console.log('[Helix] [FigmaAnalyzer] Synthesizing:', {
      type: structure.type,
      rootName: structure.rootName,
      rootRole: structure.rootRole,
      resultsCount: results.length
    });

    if (results.length === 0) {
      throw new Error('No analysis results produced.');
    }

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
      // Synthetic root for Composite or Variants - merge all parts as children
      root = {
        id: 'root-synthetic',
        name: structure.rootName ?? 'Unknown Root',
        role: structure.rootRole ?? 'Unknown Role',
        figmaRefs: [],
        layoutNotes: 'Synthetic root aggregation',
        metadata: metadata,
        designContext: designContext,
        // Store all part roots as children array
        children: results.map(r => r.root),
      };
    }

    return {
      schemaVersion: '1.0',
      root,
      metadata: metadata,
      designContext: designContext,
    };
  };

}
