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
      ctx.trace('service', 'figma-get-design-context', { nodeId, options });

      const tools = vscode.lm.tools;
      const designContextTool = tools.find(t => 
        t.name === 'mcp_figma-desktop_get_design_context'
      );

      if (!designContextTool) {
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
        clientLanguages: ctx.workspaceInfo.language || 'unknown',
        clientFrameworks: ctx.workspaceInfo.framework || 'unknown',
      };

      if (nodeId) {
        params.nodeId = nodeId;
      }

      if (options?.forceCode) {
        params.forceCode = true;
      }

      // Invoke tool
      const result = await vscode.lm.invokeTool(
        designContextTool.name,
        params,
        ctx.cancellationToken
      );

      // Collect result - LanguageModelToolResult.content is an array
      const content = result.content.map(part => {
        if (part instanceof vscode.LanguageModelTextPart) {
          return part.value;
        }
        return '';
      }).join('');

      ctx.trace('service', 'figma-get-design-context-complete', {
        resultSize: content.length,
      });

      return {
        ok: true,
        data: { content },
      };
    } catch (err) {
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
        params,
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
        params,
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
        params,
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
      // Convert 123-456 to 123:456 if needed
      nodeId: nodeIdMatch?.[1]?.replace(/-/g, ':')
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

