import * as vscode from 'vscode';
import { BaseAgent } from './base/Agent';
import {
  DesignSystemAnalysisResult,
  DesignSystemAnalysisResultSchema,
  DesignDomain
} from '../contracts';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ToolRegistry } from '../runtime/ToolRegistry';
import { LLMService } from '../services/llmService';
import { DesignSystemService } from '../services/designSystemService';
import { ConfigService } from '../services/configService';
import { PromptService } from '../services/promptService';
import { ChatService } from '../services/chatService';
import { StreamHandler } from '../runtime/StreamHandler';
import { isDebugMode } from '../utils/debug';
import * as path from 'path';
import * as crypto from 'crypto';
import { ArtifactStoreFactory } from '../runtime/ArtifactStore';
import { CacheService } from '../services/cacheService';

/**
 * Input for the Design System Analyzer
 */
export interface DesignSystemAnalyzerInput {
  /** Path to the design system guide document */
  designSystemPath: string;
  /** Optional framework hint to improve analysis */
  framework?: string;
}

/**
 * Agent responsible for analyzing design systems and extracting tokens, components,
 * and patterns from the project's design system guide
 */
export class DesignSystemAnalyzerAgent extends BaseAgent<
  DesignSystemAnalyzerInput,
  DesignSystemAnalysisResult
> {
  readonly name = 'DesignSystemAnalyzer';
  readonly description = 'Analyzes project design system guides to extract tokens, components and patterns';
  readonly outputSchema = DesignSystemAnalysisResultSchema;
  
  private llmService: LLMService;
  private designSystemService: DesignSystemService;
  
  constructor(private extensionUri?: vscode.Uri) {
    super();
    this.llmService = new LLMService();
    
    // Create service instances
    const configService = new ConfigService();
    const promptService = extensionUri ? new PromptService(extensionUri) : null as any;
    const chatService = new ChatService(configService);
    
    this.designSystemService = new DesignSystemService(
      promptService,
      configService,
      chatService
    );
  }

  protected async execute(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: DesignSystemAnalyzerInput,
    stream?: any
  ): Promise<DesignSystemAnalysisResult> {
    console.log('[Helix] [DesignSystemAnalyzer] 🚀 Execution started');
    console.log('[Helix] [DesignSystemAnalyzer] Input designSystemPath:', input.designSystemPath);
    console.log('[Helix] [DesignSystemAnalyzer] Input framework:', input.framework);
    
    // 1. Read design system documentation using DesignSystemService
    let designSystemContent: string;
    try {
      designSystemContent = await this.designSystemService.loadGuideContent();
      console.log('[Helix] [DesignSystemAnalyzer] ✅ Design system file read successfully via DesignSystemService');
    } catch (error) {
      console.error('[Helix] [DesignSystemAnalyzer] ❌ Failed to read design system file:', error);
      throw error;
    }

    ctx.trace('agent', 'design-system-guide-loaded', { 
      path: input.designSystemPath, 
      contentLength: designSystemContent.length 
    });

    // 1.5 Compute hash of the design system content and check cache
    const hash = crypto.createHash('sha256').update(designSystemContent).digest('hex');
    const workspaceRoot = ctx.workspaceInfo?.rootPath;
    const artifactStore = ArtifactStoreFactory.create(workspaceRoot);
    const cacheService = new CacheService(artifactStore);
    const CACHE_RUN_ID = 'design-system-cache';

    try {
      const cached = await cacheService.get<DesignSystemAnalysisResult>(CACHE_RUN_ID, hash);
      if (cached) {
        console.log('[Helix] [DesignSystemAnalyzer] 🧠 Cache hit. Returning cached analysis for hash:', hash);
        ctx.trace('agent', 'design-system-cache-hit', { hash });

        if (stream) {
          if (isDebugMode()) {
            this.displayDesignSystemDetailed(cached, stream);
          } else {
            this.displayDesignSystemCompact(cached, stream);
          }
        }

        return cached;
      } else {
        console.log('[Helix] [DesignSystemAnalyzer] 💾 No cache for hash. Proceeding with analysis. Hash:', hash);
        ctx.trace('agent', 'design-system-cache-miss', { hash });
      }
    } catch (e) {
      console.warn('[Helix] [DesignSystemAnalyzer] ⚠️ Cache check failed, continuing without cache.', e);
    }

    // 2. Analyze design system content to identify domains and tokens
    console.log('[Helix] [DesignSystemAnalyzer] 📊 Analyzing design system domains...');
    const designDomains = await this.analyzeDesignSystemDomains(ctx, tools, designSystemContent);
    console.log('[Helix] [DesignSystemAnalyzer] ✅ Domains analyzed. Count:', designDomains.length);
    
    // 3. Detect framework information
    console.log('[Helix] [DesignSystemAnalyzer] 🔍 Detecting framework information...');
    const frameworkInfo = await this.detectFrameworkInfo(ctx, tools, designSystemContent, input.framework);
    console.log('[Helix] [DesignSystemAnalyzer] ✅ Framework detected:', frameworkInfo);
    
    // 4. Detect component patterns
    console.log('[Helix] [DesignSystemAnalyzer] 🧩 Extracting component patterns...');
    const componentPatterns = await this.extractComponentPatterns(ctx, tools, designSystemContent, frameworkInfo);
    console.log('[Helix] [DesignSystemAnalyzer] ✅ Component patterns extracted. Count:', componentPatterns.length);

    // 4.5 Categorize domains and component patterns
    console.log('[Helix] [DesignSystemAnalyzer] 🗂️ Categorizing domains and component patterns...');
    const categorizedDomains = await this.categorizeDomains(ctx, designDomains);
    const categorizedComponentPatterns = await this.categorizeComponentPatterns(ctx, componentPatterns);
    console.log('[Helix] [DesignSystemAnalyzer] ✅ Categorization complete. Domain categories:', Object.keys(categorizedDomains).length, 'Pattern categories:', Object.keys(categorizedComponentPatterns).length);

    // 5. Create final result
    console.log('[Helix] [DesignSystemAnalyzer] 📦 Creating final result...');
    const result: DesignSystemAnalysisResult = {
      schemaVersion: '1.0',
      domains: designDomains,
      componentPatterns,
      categorizedDomains,
      categorizedComponentPatterns,
      issues: [], // No issues generated
      designSystemPath: input.designSystemPath,
      frameworkInfo,
      trace: ctx.getTraceEvents()
    };

    console.log('[Helix] [DesignSystemAnalyzer] ✨ Analysis complete!');
    console.log('[Helix] [DesignSystemAnalyzer] Summary: Domains:', designDomains.length, '| Patterns:', componentPatterns.length);
    
    // Emit display to the stream. Use detailed view in debug mode.
    if (stream) {
      if (isDebugMode()) {
        this.displayDesignSystemDetailed(result, stream);
      } else {
        this.displayDesignSystemCompact(result, stream);
      }
    }
    
    // 5.5 Cache the analysis result by file hash for future runs
    try {
      await cacheService.cache<DesignSystemAnalysisResult>(CACHE_RUN_ID, hash, result);
      ctx.trace('agent', 'design-system-cache-store', { hash });
      console.log('[Helix] [DesignSystemAnalyzer] 💾 Cached analysis result with key (hash):', hash);
    } catch (e) {
      console.warn('[Helix] [DesignSystemAnalyzer] ⚠️ Failed to cache analysis result.', e);
    }
    
    return result;
  }

  /**
   * Compact display for design system mapping used in non-debug runs.
   */
  private displayDesignSystemCompact(result: DesignSystemAnalysisResult, stream: StreamHandler): void {
    stream.markdown('\n---\n\n');
    stream.markdown('### 🛠️ Design System Summary\n');
    const domainCount = result.domains?.length || 0;
    const patternCount = result.componentPatterns?.length || 0;
    const issuesCount = result.issues?.length || 0;
    const categorizedDomainCount = result.categorizedDomains ? Object.keys(result.categorizedDomains).length : 0;
    stream.markdown(`- Domains discovered: **${domainCount}**\n`);
    stream.markdown(`- Component patterns: **${patternCount}**\n`);
    stream.markdown(`- Domain categories: **${categorizedDomainCount}**\n`);
    if (issuesCount > 0) {
      stream.markdown(`- Issues detected: **${issuesCount}** (see details below)\n`);
    }
    stream.markdown('\n---\n\n');
  }

  /**
   * Detailed display for design system mapping used only in debug mode.
   */
  private displayDesignSystemDetailed(result: DesignSystemAnalysisResult, stream: StreamHandler): void {
    stream.markdown('\n---\n\n');
    stream.markdown('### 🛠️ Design System Analysis (DETAILED)\n');

    if (result.domains && result.domains.length > 0) {
      stream.markdown('#### 📚 Domains & Tokens\n');
      let table = '| Domain | # Tokens | Description |\n| :--- | :---: | :--- |\n';
      result.domains.forEach((d: any) => {
        const tokenCount = d.tokens ? Object.keys(d.tokens).length : 0;
        table += `| ${d.name} | ${tokenCount} | ${d.description || ''} |\n`;
      });
      stream.markdown(table + '\n');
    }

    if (result.componentPatterns && result.componentPatterns.length > 0) {
      stream.markdown('#### 🧩 Component Patterns\n');
      result.componentPatterns.forEach((p: string, idx: number) => {
        stream.markdown(`${idx + 1}. ${p}\n`);
      });
      stream.markdown('\n');
    }

    if (result.issues && result.issues.length > 0) {
      stream.markdown('#### ⚠️ Issues\n');
      result.issues.forEach((issue: any) => {
        stream.markdown(`- **${issue.level.toUpperCase()}** (${issue.id}): ${issue.message}${issue.details ? ` — ${issue.details}` : ''}\n`);
      });
      stream.markdown('\n');
    }

    stream.markdown('\n---\n\n');
  }

  /**
   * Analyzes design system documentation to extract domains dynamically
   * Let the LLM determine what domains exist in the design system
   */
  private async analyzeDesignSystemDomains(
    ctx: ExecutionContext, 
    tools: ToolRegistry, 
    designSystemContent: string
  ): Promise<DesignDomain[]> {
    console.log('[Helix] [DesignSystemAnalyzer] [analyzeDesignSystemDomains] Starting LLM request...');
    // Create prompt for LLM to analyze design system domains
    const messages = [
      vscode.LanguageModelChatMessage.User(
        `Analyze this design system documentation and extract all tokens organized by domain.
        
        Design System Documentation:
        ${designSystemContent}
        
        INSTRUCTIONS:
        1. Identify ALL design domains present in this documentation (like colors, typography, spacing, etc.)
        2. For EACH identified domain, extract ALL tokens and their values
        3. Structure your response as an ARRAY of domain objects
        4. Do NOT limit yourself to predefined domains - extract ALL domains you discover
        
        Return your analysis as a JSON array where each object has:
        - name: The domain name (e.g., "colors", "typography", "spacing", etc.)
        - description: A brief description of this domain (optional)
        - tokens: An object containing all tokens in this domain with their values
        
        Example response structure (adapt to the ACTUAL domains you discover):
        [
          {
            "name": "colors",
            "description": "Color palette used throughout the application",
            "tokens": {
              "primary": "#1A2B3C",
              "secondary": "#4D5E6F",
              "error": "#FF0000"
            }
          },
          {
            "name": "typography",
            "description": "Text styles for different content types",
            "tokens": {
              "heading1": { "size": "24px", "weight": "bold", "family": "Inter" },
              "body": { "size": "16px", "weight": "regular", "family": "Inter" }
            }
          }
        ]
        
        IMPORTANT: Return ONLY the JSON array. Don't include any markdown formatting or explanatory text.
        `
      )
    ];

    const llmResult = await this.llmService.chat(ctx, messages);
    console.log('[Helix] [DesignSystemAnalyzer] [analyzeDesignSystemDomains] LLM response received. OK:', llmResult.ok);

    if (!llmResult.ok) {
      console.error('[Helix] [DesignSystemAnalyzer] [analyzeDesignSystemDomains] LLM request failed:', llmResult.error);
      ctx.trace('agent', 'design-system-domain-analysis-failed', { error: llmResult.error });
      return [];
    }

    // Try to parse the JSON response
    try {
      const response = llmResult.data.content;
      const jsonMatch = response.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/) || 
                      response.match(/(\[[\s\S]*\])/) || 
                      [null, response];
                      
      const jsonStr = jsonMatch ? jsonMatch[1] : response;
      const parsedResponse = JSON.parse(jsonStr);
      
      if (Array.isArray(parsedResponse)) {
        // Log discovered domains
        const domainNames = parsedResponse.map(d => d.name);
        console.log('[Helix] [DesignSystemAnalyzer] [analyzeDesignSystemDomains] Parsed domains:', domainNames);
        ctx.trace('agent', 'design-system-domains-discovered', { domains: domainNames });
        
        return parsedResponse as DesignDomain[];
      }
    } catch (error) {
      console.error('[Helix] [DesignSystemAnalyzer] [analyzeDesignSystemDomains] JSON parse failed:', error);
      ctx.trace('agent', 'design-system-domain-json-parse-failed', { error });
    }

    console.log('[Helix] [DesignSystemAnalyzer] [analyzeDesignSystemDomains] Returning empty array');
    return [];
  }

  /**
   * Detect framework information from the design system content
   */
  private async detectFrameworkInfo(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    designSystemContent: string,
    frameworkHint?: string
  ): Promise<{
    name?: string;
    version?: string;
    ui?: string;
  }> {
    // If framework hint is provided, use it as a starting point
    let frameworkPrompt = frameworkHint ? 
      `Based on the design system documentation below and the hint that this project uses "${frameworkHint}", ` :
      `Based on the design system documentation below, `;
    
    frameworkPrompt += `
      identify the frontend framework, version (if mentioned), and UI library used.
      
      Design System Documentation:
      ${designSystemContent.slice(0, 5000)}
      
      Please return your analysis as a JSON object with these properties:
      - name: The primary framework name (e.g., "react", "vue", "angular", etc.)
      - version: The version of the framework if mentioned
      - ui: The UI component library or design system (e.g., "material-ui", "chakra-ui", "tailwind", etc.)
      
      Example: { "name": "react", "version": "18.2.0", "ui": "material-ui" }
      
      If any information is not clearly specified, omit the property rather than guessing.
    `;

    console.log('[Helix] [DesignSystemAnalyzer] [detectFrameworkInfo] Sending LLM request...');
    const messages = [vscode.LanguageModelChatMessage.User(frameworkPrompt)];
    const llmResult = await this.llmService.chat(ctx, messages);
    console.log('[Helix] [DesignSystemAnalyzer] [detectFrameworkInfo] LLM response received. OK:', llmResult.ok);
    
    if (!llmResult.ok) {
      console.error('[Helix] [DesignSystemAnalyzer] [detectFrameworkInfo] LLM request failed');
      return {};
    }

    try {
      const response = llmResult.data.content;
      const jsonMatch = response.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || 
                      response.match(/({[\s\S]*})/) || 
                      [null, response];
                      
      const jsonStr = jsonMatch ? jsonMatch[1] : response;
      const parsedResponse = JSON.parse(jsonStr);
      
      ctx.trace('agent', 'framework-detection', parsedResponse);
      return {
        name: parsedResponse.name,
        version: parsedResponse.version,
        ui: parsedResponse.ui,
      };
    } catch (error) {
      ctx.trace('agent', 'framework-detection-failed', { error });
      return {};
    }
  }

  /**
   * Extract component patterns from design system documentation
   */
  private async extractComponentPatterns(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    designSystemContent: string,
    frameworkInfo: { name?: string; version?: string; ui?: string; }
  ): Promise<string[]> {
    const componentPrompt = `
      Analyze this design system documentation and extract all component patterns mentioned.
      
      Design System Documentation:
      ${designSystemContent}
      
      Framework Information:
      ${JSON.stringify(frameworkInfo)}
      
      INSTRUCTIONS:
      1. Identify ALL UI components defined or referenced in the documentation
      2. Include both basic components (Button, Input) and complex components (DataTable, Modal)
      3. Extract component naming patterns, props patterns, and usage patterns
      4. For each component, provide a string describing the pattern
      
      Return your results as a JSON array of strings, each describing a component pattern.
      Each pattern should include the component name and key usage information.
      
      Example:
      [
        "Button components use variant prop for style variations: primary, secondary, text",
        "Modal components require isOpen state and onClose handler",
        "Form components follow controlId pattern for accessibility",
        "Layout components use responsive props with breakpoints: sm, md, lg, xl"
      ]
      
      Focus on implementation patterns rather than just listing component names.
    `;

    console.log('[Helix] [DesignSystemAnalyzer] [extractComponentPatterns] Sending LLM request...');
    const messages = [vscode.LanguageModelChatMessage.User(componentPrompt)];
    const llmResult = await this.llmService.chat(ctx, messages);
    console.log('[Helix] [DesignSystemAnalyzer] [extractComponentPatterns] LLM response received. OK:', llmResult.ok);
    
    if (!llmResult.ok) {
      console.error('[Helix] [DesignSystemAnalyzer] [extractComponentPatterns] LLM request failed');
      return [];
    }

    try {
      const response = llmResult.data.content;
      const jsonMatch = response.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/) || 
                      response.match(/(\[[\s\S]*\])/) || 
                      [null, response];
                      
      const jsonStr = jsonMatch ? jsonMatch[1] : response;
      const patterns = JSON.parse(jsonStr);
      
      if (Array.isArray(patterns)) {
        ctx.trace('agent', 'component-patterns-extracted', { count: patterns.length });
        return patterns;
      }
    } catch (error) {
      ctx.trace('agent', 'component-patterns-extraction-failed', { error });
    }
    
    return [];
  }

  /**
   * Categorize domains using LLM to dynamically determine categories
   */
  private async categorizeDomains(
    ctx: ExecutionContext,
    domains: DesignDomain[]
  ): Promise<Record<string, DesignDomain[]>> {
    console.log('[Helix] [DesignSystemAnalyzer] [categorizeDomains] Starting LLM categorization...');
    
    const domainList = domains.map((d, i) => `${i}. ${d.name}`).join('\n');
    
    const prompt = `
      Analyze these design system domains and organize them into logical categories.
      
      Domains:
      ${domainList}
      
      INSTRUCTIONS:
      1. Create 3-6 meaningful categories that best organize these domains
      2. Each category should group related domain indices together
      3. Use clear, descriptive category names (you may use emoji prefixes)
      4. Return a JSON object mapping category names to arrays of domain indices
      
      Example format:
      {
        "🎨 Visual Styling": [0, 3, 5],
        "✏️ Text & Typography": [1, 4],
        "📐 Layout & Spacing": [2, 6]
      }
      
      Return ONLY the JSON object, no markdown formatting or explanatory text.
    `;

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const llmResult = await this.llmService.chat(ctx, messages);
    
    if (!llmResult.ok) {
      console.error('[Helix] [DesignSystemAnalyzer] [categorizeDomains] LLM request failed');
      // Fallback: return uncategorized
      return { allDomains: domains };
    }

    try {
      const response = llmResult.data.content;
      const jsonMatch = response.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || 
                      response.match(/({[\s\S]*})/) || 
                      [null, response];
                      
      const jsonStr = jsonMatch ? jsonMatch[1] : response;
      const categoryMapping: Record<string, number[]> = JSON.parse(jsonStr);
      
      // Build categorized result from mapping
      const categorized: Record<string, DesignDomain[]> = {};
      
      Object.entries(categoryMapping).forEach(([category, indices]) => {
        categorized[category] = indices
          .filter(idx => idx >= 0 && idx < domains.length)
          .map(idx => domains[idx]);
      });
      
      console.log('[Helix] [DesignSystemAnalyzer] [categorizeDomains] Categories created:', Object.keys(categorized));
      return categorized;
    } catch (error) {
      console.error('[Helix] [DesignSystemAnalyzer] [categorizeDomains] JSON parse failed:', error);
      return { allDomains: domains };
    }
  }

  /**
   * Categorize component patterns using LLM to dynamically determine categories
   */
  private async categorizeComponentPatterns(
    ctx: ExecutionContext,
    patterns: string[]
  ): Promise<Record<string, string[]>> {
    console.log('[Helix] [DesignSystemAnalyzer] [categorizeComponentPatterns] Starting LLM categorization...');
    
    const patternsList = patterns.map((p, i) => `${i}. ${p}`).join('\n');
    
    const prompt = `
      Analyze these component patterns and organize them into logical categories.
      
      Component Patterns:
      ${patternsList}
      
      INSTRUCTIONS:
      1. Create 3-6 meaningful categories that best organize these patterns
      2. Each category should group related pattern indices together
      3. Use clear, descriptive category names (you may use emoji prefixes)
      4. Return a JSON object mapping category names to arrays of pattern indices
      
      Example format:
      {
        "🖱️ Actions & Controls": [0, 5, 7],
        "💬 Overlays & Dialogs": [1, 3],
        "📝 Forms & Input": [2, 4, 6]
      }
      
      Return ONLY the JSON object, no markdown formatting or explanatory text.
    `;

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const llmResult = await this.llmService.chat(ctx, messages);
    
    if (!llmResult.ok) {
      console.error('[Helix] [DesignSystemAnalyzer] [categorizeComponentPatterns] LLM request failed');
      // Fallback: return uncategorized
      return { allPatterns: patterns };
    }

    try {
      const response = llmResult.data.content;
      const jsonMatch = response.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || 
                      response.match(/({[\s\S]*})/) || 
                      [null, response];
                      
      const jsonStr = jsonMatch ? jsonMatch[1] : response;
      const categoryMapping: Record<string, number[]> = JSON.parse(jsonStr);
      
      // Build categorized result from mapping
      const categorized: Record<string, string[]> = {};
      
      Object.entries(categoryMapping).forEach(([category, indices]) => {
        categorized[category] = indices
          .filter(idx => idx >= 0 && idx < patterns.length)
          .map(idx => patterns[idx]);
      });
      
      console.log('[Helix] [DesignSystemAnalyzer] [categorizeComponentPatterns] Categories created:', Object.keys(categorized));
      return categorized;
    } catch (error) {
      console.error('[Helix] [DesignSystemAnalyzer] [categorizeComponentPatterns] JSON parse failed:', error);
      return { allPatterns: patterns };
    }
  }
}