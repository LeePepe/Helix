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
   * Checks two things:
   * 1. MCP configuration exists in .vscode/mcp.json
   * 2. Figma Desktop is running with local server enabled
   */
  async validateMcpStatus(stream: vscode.ChatResponseStream): Promise<{ available: boolean; needsReload?: boolean }> {
    // Step 1: Check MCP configuration
    const mcpStatus = await this.checkAndConfigureMcp(stream);
    if (!mcpStatus.configured) {
      return { available: false, needsReload: mcpStatus.needsReload };
    }
    if (mcpStatus.needsReload) {
      return { available: false, needsReload: true };
    }

    // Step 2: Check if Figma Desktop MCP tools are available
    const status = this.checkToolsAvailable();

    if (!status.available) {
      stream.markdown('⚠️ **Figma Desktop not connected**\n\n');
      stream.markdown('The MCP is configured but Figma Desktop local server is not responding.\n\n');

      // Provide button to open Figma
      stream.button({
        command: 'vscode.open',
        arguments: [vscode.Uri.parse('figma:///')],
        title: '🎨 Open Figma Desktop',
      });

      stream.markdown('\n\n**Setup Instructions:**\n');
      stream.markdown('1. Open Figma Desktop app\n');
      stream.markdown('2. Go to **Figma menu → Settings → Enable Local Server**\n');
      stream.markdown('3. Or follow the [official guide](https://developers.figma.com/docs/figma-mcp-server/local-server-installation/)\n\n');

      // Provide link to documentation
      stream.button({
        command: 'vscode.open',
        arguments: [vscode.Uri.parse('https://developers.figma.com/docs/figma-mcp-server/local-server-installation/')],
        title: '📖 View Setup Guide',
      });

      stream.markdown('\n\n');
      return { available: false };
    }

    stream.markdown(`✅ Figma MCP connected (${status.toolNames.length} tools available)\n\n`);
    return { available: true };
  }

  /**
   * Check if MCP is configured in .vscode/mcp.json, create/update if needed
   */
  private async checkAndConfigureMcp(stream: vscode.ChatResponseStream): Promise<{ configured: boolean; needsReload: boolean }> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      stream.markdown('❌ **No workspace folder found**\n\n');
      return { configured: false, needsReload: false };
    }

    const mcpConfigPath = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'mcp.json');

    try {
      // Try to read existing config
      const existingContent = await vscode.workspace.fs.readFile(mcpConfigPath);
      const existingConfig = JSON.parse(Buffer.from(existingContent).toString('utf8'));

      // Check if figma-desktop server is already configured
      if (existingConfig?.servers?.['figma-desktop']) {
        return { configured: true, needsReload: false }; // Already configured
      }

      // Add figma-desktop to existing config
      stream.markdown('📝 **Adding Figma MCP to existing configuration...**\n\n');

      if (!existingConfig.servers) {
        existingConfig.servers = {};
      }
      // eslint-disable-next-line @typescript-eslint/naming-convention
      existingConfig.servers['figma-desktop'] = {
        type: 'http',
        url: 'http://127.0.0.1:3845/mcp'
      };

      await vscode.workspace.fs.writeFile(
        mcpConfigPath,
        Buffer.from(JSON.stringify(existingConfig, null, 2), 'utf8')
      );

      stream.markdown('✅ **Figma MCP configuration added to `.vscode/mcp.json`**\n\n');
      stream.markdown('⚠️ **Please reload VS Code window to activate the MCP server**\n\n');

      stream.button({
        command: 'workbench.action.reloadWindow',
        title: '🔄 Reload Window',
      });

      stream.markdown('\n\n');
      return { configured: true, needsReload: true }; // Need reload

    } catch (error) {
      // File doesn't exist or invalid JSON, create new config
      stream.markdown('📝 **Creating Figma MCP configuration...**\n\n');

      // eslint-disable-next-line @typescript-eslint/naming-convention
      const newConfig = {
        servers: {
          'figma-desktop': {
            type: 'http',
            url: 'http://127.0.0.1:3845/mcp'
          }
        }
      };

      // Ensure .vscode folder exists
      const vscodeFolder = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode');
      try {
        await vscode.workspace.fs.createDirectory(vscodeFolder);
      } catch {
        // Directory may already exist
      }

      await vscode.workspace.fs.writeFile(
        mcpConfigPath,
        Buffer.from(JSON.stringify(newConfig, null, 2), 'utf8')
      );

      stream.markdown('✅ **Created `.vscode/mcp.json` with Figma MCP configuration**\n\n');
      stream.markdown('⚠️ **Please reload VS Code window to activate the MCP server**\n\n');

      stream.button({
        command: 'workbench.action.reloadWindow',
        title: '🔄 Reload Window',
      });

      stream.markdown('\n\n');
      return { configured: true, needsReload: true }; // Need reload
    }
  }
}
