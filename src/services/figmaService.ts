import * as vscode from 'vscode';
import { ToolResult } from '../contracts';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ErrorCodes } from '../runtime/errors';

export interface FigmaUrlParts {
  fileKey?: string;
  nodeId?: string;
}

export interface ParsedFigmaUrls {
  urls: FigmaUrlParts[];
  nodeIds: string[];
}

/**
 * Figma service for MCP tool interactions
 * Unified service supporting both ExecutionContext (new) and direct calls (legacy)
 */
export class FigmaService {
  /**
   * Check if Figma MCP is available
   */
  async checkMCPAvailability(ctx: ExecutionContext): Promise<ToolResult> {
    try {
      ctx.trace('service', 'figma-check-mcp', {});

      const tools = vscode.lm.tools;
      const figmaTools = tools.filter(tool => 
        tool.name.startsWith('mcp_figma-desktop_')
      );

      const isAvailable = figmaTools.length > 0;

      return {
        ok: true,
        data: {
          available: isAvailable,
          tools: figmaTools.map(t => t.name),
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.FIGMA_MCP_NOT_AVAILABLE,
          message: 'Failed to check Figma MCP availability',
          details: (err as Error).message,
        },
      };
    }
  }

  /**
   * Helper function to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get design context from Figma
   * @param nodeId - Can be a node ID (e.g., "123:456") or a full Figma URL (e.g., "https://figma.com/design/ABC/name?node-id=123-456")
   *                 The MCP tool will automatically extract the node ID from the URL if provided.
   */
  async getDesignContext(
    ctx: ExecutionContext,
    nodeId?: string,
    options?: {
      forceCode?: boolean;
      includeCodeConnect?: boolean;
    }
  ): Promise<ToolResult> {
    const maxRetries = 1;
    const retryDelayMs = 2000;

    const tools = vscode.lm.tools;
    const designContextTool = tools.find(t =>
      t.name === 'mcp_figma-desktop_get_design_context'
    );

    if (!designContextTool) {
      console.error('[FigmaService] Design context tool not found');
      return {
        ok: false,
        error: {
          code: ErrorCodes.FIGMA_MCP_NOT_AVAILABLE,
          message: 'Figma Desktop MCP tool not available',
        },
      };
    }

    // Build parameters
    const params: any = {
      clientLanguages: 'swift',
      clientFrameworks: ctx.workspaceInfo.framework || 'unknown',
    };

    if (nodeId) {
      params.nodeId = this.normalizeNodeId(nodeId);
    }

    if (options?.forceCode) {
      params.forceCode = true;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      ctx.trace('service', 'figma-get-design-context', { nodeId, options, attempt });

      // Invoke tool
      const result = await vscode.lm.invokeTool(
        designContextTool.name,
        {
          input: params,
          toolInvocationToken: ctx.toolInvocationToken
        },
        ctx.cancellationToken
      );

      // Collect result - LanguageModelToolResult.content is an array
      const content = result.content.map(part => {
        if (part instanceof vscode.LanguageModelTextPart) {
          return part.value;
        }
        return '';
      }).join('');

      // Check if the response contains an error message (MCP tool may return error as content)
      if (content.includes('An error occurred while using the tool')) {
        console.warn(`[FigmaService] getDesignContext returned error content (attempt ${attempt}/${maxRetries}): ${content} ${nodeId}`);

        if (attempt === maxRetries) {
          return {
            ok: false,
            error: {
              code: ErrorCodes.FIGMA_REQUEST_FAILED,
              message: `Figma MCP tool error after ${maxRetries} attempts: ${content}`,
            },
          };
        }

        // Wait before retrying
        console.log(`[FigmaService] Retrying getDesignContext in ${retryDelayMs}ms...`);
        await this.delay(retryDelayMs);
        continue;
      }

      ctx.trace('service', 'figma-get-design-context-complete', {
        resultSize: content.length,
        attempt,
      });

      return {
        ok: true,
        data: { content },
      };
    }

    // This should never be reached, but TypeScript needs it
    return {
      ok: false,
      error: {
        code: ErrorCodes.FIGMA_REQUEST_FAILED,
        message: 'Unexpected error in getDesignContext retry loop',
      },
    };
  }

  /**
   * Get Figma metadata (structure overview)
   */
  async getMetadata(
    ctx: ExecutionContext,
    nodeId?: string
  ): Promise<ToolResult> {
    try {
      ctx.trace('service', 'figma-get-metadata', { nodeId });

      const tools = vscode.lm.tools;
      const metadataTool = tools.find(t => 
        t.name === 'mcp_figma-desktop_get_metadata'
      );

      if (!metadataTool) {
        return {
          ok: false,
          error: {
            code: ErrorCodes.FIGMA_MCP_NOT_AVAILABLE,
            message: 'Figma metadata tool not available',
          },
        };
      }

      const params: any = {
        clientLanguages: 'swift',
        clientFrameworks: ctx.workspaceInfo.framework || 'unknown',
      };

      if (nodeId) {
        params.nodeId = nodeId;
      }

      const result = await vscode.lm.invokeTool(
        metadataTool.name,
        { 
          input: params,
          toolInvocationToken: ctx.toolInvocationToken 
        },
        ctx.cancellationToken
      );

      const content = result.content.map(part => {
        if (part instanceof vscode.LanguageModelTextPart) {
          return part.value;
        }
        return '';
      }).join('');

      return {
        ok: true,
        data: { content },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.FIGMA_REQUEST_FAILED,
          message: `Failed to get Figma metadata: ${(err as Error).message}`,
        },
      };
    }
  }

  /**
   * Get screenshot of a Figma node
   */
  async getScreenshot(
    ctx: ExecutionContext,
    nodeId?: string
  ): Promise<ToolResult> {
    try {
      ctx.trace('service', 'figma-get-screenshot', { nodeId });

      const tools = vscode.lm.tools;
      const screenshotTool = tools.find(t =>
        t.name === 'mcp_figma-desktop_get_screenshot'
      );

      if (!screenshotTool) {
        return {
          ok: false,
          error: {
            code: ErrorCodes.FIGMA_MCP_NOT_AVAILABLE,
            message: 'Figma screenshot tool not available',
          },
        };
      }

      const params: any = {
        clientLanguages: 'swift',
        clientFrameworks: ctx.workspaceInfo.framework || 'unknown',
      };

      if (nodeId) {
        params.nodeId = nodeId;
      }

      const result = await vscode.lm.invokeTool(
        screenshotTool.name,
        { 
          input: params,
          toolInvocationToken: ctx.toolInvocationToken 
        },
        ctx.cancellationToken
      );

      const content = result.content.map(part => {
        if (part instanceof vscode.LanguageModelTextPart) {
          return part.value;
        }
        return '';
      }).join('');

      return {
        ok: true,
        data: { content },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.FIGMA_REQUEST_FAILED,
          message: `Failed to get Figma screenshot: ${(err as Error).message}`,
        },
      };
    }
  }

  /**
   * Get variable definitions
   */
  async getVariableDefinitions(
    ctx: ExecutionContext,
    nodeId?: string
  ): Promise<ToolResult> {
    try {
      ctx.trace('service', 'figma-get-variables', { nodeId });

      const tools = vscode.lm.tools;
      const variableTool = tools.find(t =>
        t.name === 'mcp_figma-desktop_get_variable_defs'
      );

      if (!variableTool) {
        return {
          ok: false,
          error: {
            code: ErrorCodes.FIGMA_MCP_NOT_AVAILABLE,
            message: 'Figma variable tool not available',
          },
        };
      }

      const params: any = {
        clientLanguages: 'swift',
        clientFrameworks: ctx.workspaceInfo.framework || 'unknown',
      };

      if (nodeId) {
        params.nodeId = nodeId;
      }

      const result = await vscode.lm.invokeTool(
        variableTool.name,
        { 
          input: params,
          toolInvocationToken: ctx.toolInvocationToken 
        },
        ctx.cancellationToken
      );

      const content = result.content.map(part => {
        if (part instanceof vscode.LanguageModelTextPart) {
          return part.value;
        }
        return '';
      }).join('');

      return {
        ok: true,
        data: { content },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.FIGMA_REQUEST_FAILED,
          message: `Failed to get Figma variables: ${(err as Error).message}`,
        },
      };
    }
  }

  /**
   * Parse Figma URL to extract file key and node ID
   * Format: https://figma.com/design/{file_key}/{file_name}?node-id=123-456
   */
  parseFigmaUrl(url: string): FigmaUrlParts {
    // Match file key: https://figma.com/design/ABC123/...
    const fileKeyMatch = url.match(/design\/([^/?]+)/);

    // Match node ID: ?node-id=123-456 or ?node-id=123:456
    const nodeIdMatch = url.match(/node-id=([^&\s]+)/);

    return {
      fileKey: fileKeyMatch?.[1],
      nodeId: nodeIdMatch?.[1]
    };
  }

  /**
   * Parse multiple Figma URLs from a string input
   * Supports URLs separated by spaces, newlines, or commas
   * @param input - String containing one or more Figma URLs
   * @returns Parsed URLs with their node IDs
   */
  parseMultipleFigmaUrls(input: string): ParsedFigmaUrls {
    console.log('[Helix] [FigmaService] parseMultipleFigmaUrls input:', input);
    console.log('[Helix] [FigmaService] parseMultipleFigmaUrls input length:', input.length);

    // Split by common separators: newlines, commas, or multiple spaces
    const urlPattern = /https?:\/\/[^\s,]+figma\.com[^\s,]*/gi;
    const matches = input.match(urlPattern) || [];

    console.log('[Helix] [FigmaService] parseMultipleFigmaUrls matches:', matches);
    console.log('[Helix] [FigmaService] parseMultipleFigmaUrls matches count:', matches.length);

    const urls: FigmaUrlParts[] = [];
    const nodeIds: string[] = [];

    for (const url of matches) {
      console.log('[Helix] [FigmaService] Processing URL:', url);
      const parsed = this.parseFigmaUrl(url.trim());
      console.log('[Helix] [FigmaService] Parsed result:', parsed);
      urls.push(parsed);
      if (parsed.nodeId) {
        // Normalize the node ID
        const normalized = this.normalizeNodeId(parsed.nodeId);
        console.log('[Helix] [FigmaService] Normalized nodeId:', normalized);
        if (normalized) {
          nodeIds.push(normalized);
        }
      }
    }

    console.log('[Helix] [FigmaService] parseMultipleFigmaUrls result - nodeIds:', nodeIds);
    return { urls, nodeIds };
  }

  /**
   * Normalize node ID formats to use ':' as separator (e.g. '123-456' -> '123:456')
   * Accepts values already in '123:456' format and returns them unchanged.
   */
  private normalizeNodeId(nodeId?: string): string | undefined {
    if (!nodeId) return undefined;

    // If it's a full URL, extract node-id param
    if (nodeId.includes('figma.com')) {
      const parts = this.parseFigmaUrl(nodeId);
      nodeId = parts.nodeId || nodeId;
    }

    // If already contains ':', assume normalized
    if (nodeId.includes(':')) return nodeId;

    // Convert dashed form '123-456' to '123:456'
    const dashMatch = nodeId.match(/^(\d+)-(\d+)$/);
    if (dashMatch) {
      return `${dashMatch[1]}:${dashMatch[2]}`;
    }

    // If it contains non-digit separators like '_' or spaces, try to normalize
    const otherMatch = nodeId.match(/^(\d+)[^\d]+(\d+)$/);
    if (otherMatch) {
      return `${otherMatch[1]}:${otherMatch[2]}`;
    }

    return nodeId;
  }

  /**
   * Check if Figma MCP tools are available (legacy interface)
   */
  checkToolsAvailable(): { available: boolean; toolNames: string[]; hasDesktop: boolean; hasRemote: boolean } {
    const tools = vscode.lm.tools;
    const desktopTools = tools.filter(tool =>
      tool.name.startsWith('mcp_figma-desktop_')
    );

    const remoteTools = tools.filter(tool =>
      tool.name.startsWith('mcp_figma_') && !tool.name.includes('desktop')
    );

    const allFigmaTools = [...desktopTools, ...remoteTools];

    return {
      available: allFigmaTools.length > 0,
      toolNames: allFigmaTools.map(t => t.name),
      hasDesktop: desktopTools.length > 0,
      hasRemote: remoteTools.length > 0
    };
  }

  /**
   * Validate Figma MCP status and display to stream
   */
  async validateMcpStatus(stream: vscode.ChatResponseStream): Promise<void> {
    const status = this.checkToolsAvailable();
    
    if (!status.available) {
      stream.markdown('⚠️ **Figma MCP not available.** Please ensure:\n');
      stream.markdown('- Figma Desktop app is running\n');
      stream.markdown('- Figma MCP server is configured in VS Code settings\n\n');
      throw new Error('Figma MCP not available');
    }

    stream.markdown(`✅ Figma MCP connected (${status.toolNames.length} tools available)\n\n`);
  }
}

