import * as vscode from 'vscode';
import { ToolResult } from '../contracts';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ErrorCodes } from '../runtime/errors';

export interface FigmaUrlParts {
  fileKey?: string;
  nodeId?: string;
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
    try {
      console.log('[Helix] [FigmaService] ========== getDesignContext START ==========');
      console.log('[Helix] [FigmaService] Input nodeId (or URL):', nodeId);
      console.log('[Helix] [FigmaService] Input options:', JSON.stringify(options, null, 2));

      ctx.trace('service', 'figma-get-design-context', { nodeId, options });

      const tools = vscode.lm.tools;
      console.log('[Helix] [FigmaService] Total available tools:', tools.length);
      console.log('[Helix] [FigmaService] Tool names:', tools.map(t => t.name));

      const designContextTool = tools.find(t =>
        t.name === 'mcp_figma-desktop_get_design_context'
      );

      if (!designContextTool) {
        console.error('[Helix] [FigmaService] ❌ Design context tool not found!');
        return {
          ok: false,
          error: {
            code: ErrorCodes.FIGMA_MCP_NOT_AVAILABLE,
            message: 'Figma Desktop MCP tool not available',
          },
        };
      }

      console.log('[Helix] [FigmaService] ✅ Found design context tool');
      console.log('[Helix] [FigmaService] Tool info:', {
        name: designContextTool.name,
        description: designContextTool.description,
        inputSchema: designContextTool.inputSchema,
      });

      // Build parameters
      const params: any = {
        clientLanguages: ctx.workspaceInfo.language || 'unknown',
        clientFrameworks: ctx.workspaceInfo.framework || 'unknown',
      };

      if (nodeId) {
        // Pass nodeId directly - MCP tool can handle both node IDs and full URLs
        params.nodeId = nodeId;
        const isUrl = nodeId.includes('figma.com');
        console.log(`[Helix] [FigmaService] 📌 Adding ${isUrl ? 'Figma URL' : 'nodeId'} to params:`, nodeId);
      } else {
        console.log('[Helix] [FigmaService] ⚠️  No nodeId provided - will use current selection');
      }

      if (options?.forceCode) {
        params.forceCode = true;
        console.log('[Helix] [FigmaService] 🔧 forceCode enabled');
      }

      console.log('[Helix] [FigmaService] 📤 Invoking MCP tool with params:');
      console.log('[Helix] [FigmaService] Params:', JSON.stringify(params, null, 2));

      // Invoke tool
      const result = await vscode.lm.invokeTool(
        designContextTool.name,
        { 
          input: params,
          toolInvocationToken: ctx.toolInvocationToken
        },
        ctx.cancellationToken
      );
      console.log('[Helix] [FigmaService] ', result);
      console.log('[Helix] [FigmaService] 📥 MCP tool invocation complete');
      console.log('[Helix] [FigmaService] Result content parts:', result.content.length);
      console.log('[Helix] [FigmaService] Result content types:', result.content.map((part: any) => part.constructor.name));

      // Collect result - LanguageModelToolResult.content is an array
      const content = result.content.map(part => {
        if (part instanceof vscode.LanguageModelTextPart) {
          console.log('[Helix] [FigmaService] Text part length:', part.value.length);
          console.log('[Helix] [FigmaService] Text part preview:', part.value.substring(0, 200));
          return part.value;
        }
        console.log('[Helix] [FigmaService] Non-text part:', (part as any).constructor.name);
        return '';
      }).join('');

      console.log('[Helix] [FigmaService] 📊 Final content length:', content.length);
      console.log('[Helix] [FigmaService] Final content preview:', content.substring(0, 500));
      console.log('[Helix] [FigmaService] Content is empty?:', content.length === 0);
      console.log('[Helix] [FigmaService] Content is "Nothing is selected"?:', content.includes('Nothing is selected'));

      ctx.trace('service', 'figma-get-design-context-complete', {
        resultSize: content.length,
      });

      console.log('[Helix] [FigmaService] ========== getDesignContext END ==========');

      return {
        ok: true,
        data: { content },
      };
    } catch (err) {
      console.error('[Helix] [FigmaService] ❌ ERROR in getDesignContext');
      console.error('[Helix] [FigmaService] Error message:', (err as Error).message);
      console.error('[Helix] [FigmaService] Error stack:', (err as Error).stack);

      ctx.trace('service', 'figma-get-design-context-error', {
        error: (err as Error).message,
      });

      return {
        ok: false,
        error: {
          code: ErrorCodes.FIGMA_REQUEST_FAILED,
          message: `Failed to get Figma design context: ${(err as Error).message}`,
        },
      };
    }
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
        clientLanguages: ctx.workspaceInfo.language || 'unknown',
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
        clientLanguages: ctx.workspaceInfo.language || 'unknown',
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
        clientLanguages: ctx.workspaceInfo.language || 'unknown',
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

