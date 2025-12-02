import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from './configService';

export interface FigmaUrlParts {
  fileKey?: string;
  nodeId?: string;
}

export class FigmaService {
  private configService: ConfigService;

  constructor() {
    this.configService = new ConfigService();
  }
  /**
   * Get design context from Figma using MCP tools
   * Supports both URL-based (remote) and Desktop selection methods
   */
  async getDesignContext(figmaUrl?: string): Promise<any> {
    const tools = vscode.lm.tools;

    try {
      // If URL is provided, try Desktop MCP first, then Remote if enabled
      if (figmaUrl) {
        const urlParts = this.parseFigmaUrl(figmaUrl);

        if (!urlParts.fileKey || !urlParts.nodeId) {
          throw new Error(
            '❌ **Invalid Figma URL**\n\n' +
            'URL must include both file key and node ID.\n' +
            'Example: https://figma.com/file/ABC123/Design?node-id=123-456'
          );
        }

        const token = new vscode.CancellationTokenSource().token;

        // Try Remote MCP if enabled
        const remoteFigmaEnabled = this.configService.isRemoteFigmaEnabled();

        if (remoteFigmaEnabled) {
          const remoteTool = tools.find(tool =>
            tool.name === 'mcp_figma_get_design_context'
          );

          if (remoteTool) {
            const result = await vscode.lm.invokeTool(
              remoteTool.name,
              {
                toolInvocationToken: undefined,
                input: {
                  fileKey: urlParts.fileKey,
                  nodeId: urlParts.nodeId
                }
              },
              token
            );
            return this.parseToolResult(result);
          }
        }

        // Try Desktop MCP (supports URLs)
        const desktopTool = tools.find(tool =>
          tool.name === 'mcp_figma-desktop_get_design_context'
        );

        if (desktopTool) {
          try {
            const result = await vscode.lm.invokeTool(
              desktopTool.name,
              {
                toolInvocationToken: undefined,
                input: {
                  fileKey: urlParts.fileKey,
                  nodeId: urlParts.nodeId
                }
              },
              token
            );
            return this.parseToolResult(result);
          } catch (desktopError) {
            // Desktop MCP failed, try remote if enabled
            console.warn('Desktop MCP failed for URL, trying remote:', desktopError);
          }
        }

        // Neither Desktop nor Remote worked
        throw new Error(
          '❌ **Could not fetch Figma design from URL**\n\n' +
          'Tried:\n' +
          (desktopTool ? '✓ Desktop MCP (failed)\n' : '✗ Desktop MCP (not available)\n') +
          (remoteFigmaEnabled ? '✗ Remote MCP (not available or failed)\n\n' : '✗ Remote MCP (disabled in settings)\n\n') +
          'Options:\n' +
          '1. Ensure Figma Desktop is running with MCP enabled (Shift+D)\n' +
          '2. Enable Remote Figma in settings: `helix.enableRemoteFigma`\n' +
          '3. Use Desktop selection instead (no URL required)'
        );
      }

      // No URL provided - use Desktop selection
      const desktopTool = tools.find(tool =>
        tool.name === 'mcp_figma-desktop_get_design_context'
      );
      console.log(desktopTool);

      if (!desktopTool) {
        throw new Error(
          '❌ **Figma Desktop MCP tools not found**\n\n' +
          'Please set up Figma Desktop MCP:\n' +
          '1. Open Figma Desktop app\n' +
          '2. Enable Dev Mode (Shift+D)\n' +
          '3. Enable MCP in the Dev Mode panel\n' +
          '4. Ensure Figma Desktop is running on http://127.0.0.1:3845/mcp\n\n' +
          'See `docs/initialization/figma-mcp-install.md` for detailed instructions.\n\n' +
          'Alternatively, provide a Figma URL to use remote access.'
        );
      }

      // Invoke Desktop tool (no parameters needed - uses current selection)
      const token = new vscode.CancellationTokenSource().token;
      const result = await vscode.lm.invokeTool(
        desktopTool.name,
        {
          toolInvocationToken: undefined,
          input: {}
        },
        token
      );

      return this.parseToolResult(result);

    } catch (error) {
      if (error instanceof Error && error.message.includes('Figma')) {
        throw error;
      }
      throw new Error(`Failed to fetch Figma design: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Install Figma MCP servers by creating or updating .vscode/mcp.json
   * Installs both Desktop and Remote Figma MCP servers
   */
  async installMcpServers(): Promise<{ success: boolean; message: string }> {
    try {
      // Get workspace root
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return {
          success: false,
          message: 'No workspace folder open. Please open a workspace first.'
        };
      }

      const workspaceRoot = workspaceFolder.uri.fsPath;
      const vscodeDir = path.join(workspaceRoot, '.vscode');
      const mcpJsonPath = path.join(vscodeDir, 'mcp.json');
      const altMcpJsonPath = path.join(workspaceRoot, '.mcp.json');

      // MCP server configuration
      // Desktop is always included, Remote only if enabled
      const figmaServers: any = {
        'figma-desktop': {
          type: 'http',
          url: 'http://127.0.0.1:3845/mcp'
        }
      };

      // Only add remote server if enabled in settings
      if (this.configService.isRemoteFigmaEnabled()) {
        figmaServers['figma'] = {
          type: 'http',
          url: 'https://mcp.figma.com/mcp'
        };
      }

      let configPath = mcpJsonPath;
      let existingConfig: any = { servers: {} };

      // Check if either config file exists
      if (fs.existsSync(mcpJsonPath)) {
        configPath = mcpJsonPath;
        const content = fs.readFileSync(mcpJsonPath, 'utf8');
        existingConfig = JSON.parse(content);
      } else if (fs.existsSync(altMcpJsonPath)) {
        configPath = altMcpJsonPath;
        const content = fs.readFileSync(altMcpJsonPath, 'utf8');
        existingConfig = JSON.parse(content);
      } else {
        // Create .vscode directory if it doesn't exist
        if (!fs.existsSync(vscodeDir)) {
          fs.mkdirSync(vscodeDir, { recursive: true });
        }
      }

      // Ensure servers object exists
      if (!existingConfig.servers) {
        existingConfig.servers = {};
      }

      // Merge Figma servers (preserve existing servers)
      existingConfig.servers = {
        ...existingConfig.servers,
        ...figmaServers
      };

      // Write configuration
      fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2), 'utf8');

      // Show success notification with next steps
      const remoteFigmaEnabled = this.configService.isRemoteFigmaEnabled();
      const message = remoteFigmaEnabled
        ? `✅ Figma MCP servers configured!\n\nYou can now use:\n1. **Desktop selection** (no URL needed) - Open Figma Desktop and enable MCP (Shift+D)\n2. **URL-based access** - Provide Figma URLs directly in commands\n\nRestart VS Code to load the servers.`
        : `✅ Figma Desktop MCP configured!\n\nYou can now use Desktop selection (no URL needed).\n\nNext steps:\n1. Restart VS Code to load MCP server\n2. Open Figma Desktop app\n3. Enable MCP in Figma (Shift+D → Enable MCP)\n\nNote: Remote Figma (URL-based) is disabled. Enable it in settings if needed.`;

      vscode.window.showInformationMessage(
        'Figma MCP configured!',
        'View Instructions'
      ).then(selection => {
        if (selection === 'View Instructions') {
          const instructionsPath = path.join(workspaceRoot, 'docs/initialization/figma-mcp-install.md');
          if (fs.existsSync(instructionsPath)) {
            vscode.commands.executeCommand('vscode.open', vscode.Uri.file(instructionsPath));
          }
        }
      });

      return {
        success: true,
        message
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to install MCP server: ${errorMessage}`
      };
    }
  }

  /**
   * Get design variables/tokens from Figma
   * Supports both Desktop selection and remote (with fileKey)
   */
  async getVariableDefinitions(fileKey?: string): Promise<any> {
    const tools = vscode.lm.tools;

    try {
      const token = new vscode.CancellationTokenSource().token;

      // If fileKey provided, check if remote is enabled and try remote tool
      if (fileKey && this.configService.isRemoteFigmaEnabled()) {
        const remoteTool = tools.find(tool =>
          tool.name === 'mcp_figma_get_variable_defs'
        );

        if (remoteTool) {
          const result = await vscode.lm.invokeTool(
            remoteTool.name,
            {
              toolInvocationToken: undefined,
              input: { fileKey }
            },
            token
          );
          return this.parseToolResult(result);
        }
      }

      // Fall back to Desktop tool (no fileKey needed - uses current selection)
      const desktopTool = tools.find(tool =>
        tool.name === 'mcp_figma-desktop_get_variable_defs'
      );

      if (!desktopTool) {
        console.warn('Figma variables tool not found, skipping...');
        return null;
      }

      const result = await vscode.lm.invokeTool(
        desktopTool.name,
        {
          toolInvocationToken: undefined,
          input: {}
        },
        token
      );

      return this.parseToolResult(result);
    } catch (error) {
      console.error('Failed to fetch Figma variables:', error);
      return null;
    }
  }

  /**
   * Parse Figma URL to extract file key and node ID
   */
  private parseFigmaUrl(url: string): FigmaUrlParts {
    // Match file key: https://figma.com/file/ABC123/...
    const fileKeyMatch = url.match(/file\/([^/?]+)/);

    // Match node ID: ?node-id=123-456 or ?node-id=123:456
    const nodeIdMatch = url.match(/node-id=([^&\s]+)/);

    return {
      fileKey: fileKeyMatch?.[1],
      // Convert 123-456 to 123:456 if needed
      nodeId: nodeIdMatch?.[1]?.replace(/-/g, ':')
    };
  }

  /**
   * Parse tool result from MCP invocation
   */
  private parseToolResult(result: vscode.LanguageModelToolResult): any {
    // Tool results are returned as content parts
    const content = result.content.map(part => {
      if (part instanceof vscode.LanguageModelTextPart) {
        return part.value;
      }
      return '';
    }).join('');

    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  /**
   * Check if Figma MCP tools are available
   * Checks for both Desktop and Remote tools
   */
  checkToolsAvailable(): { available: boolean; toolNames: string[]; hasDesktop: boolean; hasRemote: boolean } {
    const tools = vscode.lm.tools;

    const desktopTools = tools.filter(tool =>
      tool.name.startsWith('mcp_figma-desktop_')
    );

    const remoteTools = this.configService.isRemoteFigmaEnabled() ? tools.filter(tool =>
      tool.name.startsWith('mcp_figma_') && !tool.name.includes('desktop')
    ) : [];

    const allFigmaTools = [...desktopTools , ...remoteTools];

    return {
      available: allFigmaTools.length > 0,
      toolNames: allFigmaTools.map(t => t.name),
      hasDesktop: desktopTools.length > 0,
      hasRemote: remoteTools.length > 0
    };
  }
}
