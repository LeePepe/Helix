import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
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
        console.log('Figma URL provided:', figmaUrl);
        const urlParts = this.parseFigmaUrl(figmaUrl);
        console.log('Parsed Figma URL parts:', urlParts);
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
            console.log('Trying Desktop MCP for Figma URL');

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
            console.log('Figma design fetched via Desktop MCP for URL');
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
   * Check if local Figma MCP server is running
   */
  private async isLocalServerRunning(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.request('http://127.0.0.1:3845/mcp', {
        method: 'HEAD',
        timeout: 500
      }, (res) => {
        console.log('Figma MCP server response status:', res.statusCode);
        // Any response means the server is up
        resolve(true);
      });

      req.on('error', () => {
        console.warn('Figma MCP server not responding');
        resolve(false);
      });

      req.on('timeout', () => {
        console.log('Figma MCP server request timed out');
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * Install Figma MCP servers by creating or updating .vscode/mcp.json
   * Installs both Desktop and Remote Figma MCP servers
   */
  async installMcpServers(): Promise<{ success: boolean; message: string }> {
    try {
      const configPath = this.ensureMcpConfigExists();
      this.addFigmaMcpConfig(configPath);
      return await this.verifyAndNotifyMcpInstallation();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to install MCP server: ${errorMessage}`
      };
    }
  }

  /**
   * Ensure MCP config file exists, creating it if necessary
   */
  private ensureMcpConfigExists(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open. Please open a workspace first.');
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;
    const vscodeDir = path.join(workspaceRoot, '.vscode');
    const mcpJsonPath = path.join(vscodeDir, 'mcp.json');
    const altMcpJsonPath = path.join(workspaceRoot, '.mcp.json');

    // Check if either config file exists
    if (fs.existsSync(mcpJsonPath)) return mcpJsonPath;
    if (fs.existsSync(altMcpJsonPath)) return altMcpJsonPath;

    // Create .vscode directory if it doesn't exist
    if (!fs.existsSync(vscodeDir)) {
      fs.mkdirSync(vscodeDir, { recursive: true });
    }

    // Create empty config
    fs.writeFileSync(mcpJsonPath, JSON.stringify({ servers: {} }, null, 2), 'utf8');
    return mcpJsonPath;
  }

  /**
   * Add Figma configuration to MCP config file
   */
  private addFigmaMcpConfig(configPath: string): void {
    const content = fs.readFileSync(configPath, 'utf8');
    let existingConfig: any;
    try {
      existingConfig = JSON.parse(content);
    } catch {
      existingConfig = { servers: {} };
    }

    if (!existingConfig.servers) {
      existingConfig.servers = {};
    }

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

    existingConfig.servers = {
      ...existingConfig.servers,
      ...figmaServers
    };

    fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2), 'utf8');
  }

  /**
   * Verify installation and notify user
   */
  private async verifyAndNotifyMcpInstallation(): Promise<{ success: boolean; message: string }> {
      // Check if server is running to give better feedback
      const isRunning = await this.isLocalServerRunning();
      const toolsStatus = this.checkToolsAvailable();

      // Show success notification with next steps
      const remoteFigmaEnabled = this.configService.isRemoteFigmaEnabled();
      let message = remoteFigmaEnabled
        ? `✅ Figma MCP servers configured!\n\nYou can now use:\n1. **Desktop selection** (no URL needed) - Open Figma Desktop and enable MCP (Shift+D)\n2. **URL-based access** - Provide Figma URLs directly in commands`
        : `✅ Figma Desktop MCP configured!\n\nYou can now use Desktop selection (no URL needed).`;

      if (!toolsStatus.available) {
        message += `\n\n**Action Required:** Restart VS Code to load the new MCP servers.`;
      }

      if (!isRunning) {
        message += `\n\n⚠️ **Note:** Figma Desktop does not seem to be running or MCP is not enabled. Please open Figma and enable MCP (Shift+D).`;
      }

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const workspaceRoot = workspaceFolder?.uri.fsPath;

      const selection = await vscode.window.showInformationMessage(
        message,
        'View Instructions'
      );

      if (selection === 'View Instructions' && workspaceRoot) {
        const instructionsPath = path.join(workspaceRoot, 'docs/initialization/figma-mcp-install.md');
        if (fs.existsSync(instructionsPath)) {
          vscode.commands.executeCommand('vscode.open', vscode.Uri.file(instructionsPath));
        }
      }

      return {
        success: true,
        message
      };
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
   * Format: https://figma.com/design/{file_key}/{file_name}?node-id=123-456
   */
  private parseFigmaUrl(url: string): FigmaUrlParts {
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
   * Check if MCP configuration file exists
   */
  private checkMcpConfigExists(): boolean {
    return !!this.getMcpConfigPath();
  }

  /**
   * Get path to MCP config file if it exists
   */
  private getMcpConfigPath(): string | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return null;

    const workspaceRoot = workspaceFolder.uri.fsPath;
    const mcpJsonPath = path.join(workspaceRoot, '.vscode', 'mcp.json');
    const altMcpJsonPath = path.join(workspaceRoot, '.mcp.json');

    if (fs.existsSync(mcpJsonPath)) return mcpJsonPath;
    if (fs.existsSync(altMcpJsonPath)) return altMcpJsonPath;
    return null;
  }

  /**
   * Check if MCP config contains Figma servers
   */
  private checkMcpConfigContent(): { valid: boolean; missing: string[] } {
    const configPath = this.getMcpConfigPath();
    if (!configPath) return { valid: false, missing: ['config_file'] };

    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(content);
      const servers = config.servers || {};
      const missing: string[] = [];

      if (!servers['figma-desktop']) {
        missing.push('figma-desktop');
      }

      if (this.configService.isRemoteFigmaEnabled() && !servers['figma']) {
        missing.push('figma');
      }

      return {
        valid: missing.length === 0,
        missing
      };
    } catch {
      return { valid: false, missing: ['parse_error'] };
    }
  }

  /**
   * Validate MCP status with auto-recovery attempts
   * 1. Check if tools are valid (available) -> Pass
   * 2. Check if MCP config exists -> Create if missing
   * 3. Check if MCP content is valid -> Update if invalid
   * 4. Check if Figma Desktop is running -> Prompt to open
   * 5. If all configured but tools missing -> Prompt to restart
   */
  async validateMcpStatus(stream?: vscode.ChatResponseStream): Promise<void> {
    // 1. Check if tools are already loaded and ready
    const status = this.checkToolsAvailable();
    if (status.available) {
      return; // All good!
    }

    // Tools are not available, let's diagnose and try to fix
    if (stream) {
      stream.progress('Figma MCP tools not detected. Diagnosing...');
    }

    // 2 & 3. Check Config File and Content
    const configExists = this.checkMcpConfigExists();
    const contentCheck = this.checkMcpConfigContent();

    if (!configExists || !contentCheck.valid) {
      if (stream) {
        stream.markdown('⚙️ **Configuring Figma MCP...**\n\n');
      }
      
      try {
        const configPath = this.ensureMcpConfigExists();
        this.addFigmaMcpConfig(configPath);
        
        if (stream) {
          stream.markdown('✅ Configuration updated.\n\n');
          stream.markdown('**Action Required:** Please **Restart VS Code** to load the new MCP servers.\n');
        }
      } catch (error) {
        throw new Error(`Failed to configure Figma MCP: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 4. Config is good, but tools are missing. Check if Desktop Server is running.
    const isRunning = await this.isLocalServerRunning();
    
    if (!isRunning) {
      if (stream) {
        stream.markdown('⚠️ **Figma Desktop not detected**\n\n');
        stream.markdown('The MCP server is configured, but Figma Desktop seems to be closed or MCP is disabled.\n');
        stream.markdown('1. Open Figma Desktop\n');
        stream.markdown('2. Enable Dev Mode (Shift+D)\n');
        stream.markdown('3. Enable MCP in Dev Mode settings\n');
        stream.button({
          command: 'helix.openFigma',
          title: 'Open Figma Desktop'
        });
      }
      throw new Error('Figma Desktop MCP server not running. Please open Figma and enable MCP.');
    }

    // 5. Server is running, Config is good, but Tools still missing.
    // This usually means VS Code needs a restart to pick up the config or connection failed.
    if (stream) {
      stream.markdown('⚠️ **Restart Required**\n\n');
      stream.markdown('Figma Desktop is running and configured, but VS Code hasn\'t loaded the tools yet.\n');
      stream.markdown('Please **Restart VS Code** to establish the connection.\n');
    }
    
    throw new Error('Figma MCP tools not loaded. Please restart VS Code.');
  }

  /**
   * Check if Figma MCP tools are available
   * Checks for both Desktop and Remote tools
   */
  checkToolsAvailable(): { available: boolean; toolNames: string[]; hasDesktop: boolean; hasRemote: boolean } {
    const tools = vscode.lm.tools;
    console.log('Available tools:', tools.map(t => t.name).filter(name => name.includes('figma')));
    const desktopTools = tools.filter(tool =>
      tool.name.startsWith('mcp_figma-desktop_')
    );

    const remoteTools = this.configService.isRemoteFigmaEnabled() ? tools.filter(tool =>
      tool.name.startsWith('mcp_figma_') && !tool.name.includes('desktop')
    ) : [];

    const allFigmaTools = [...desktopTools, ...remoteTools];

    return {
      available: allFigmaTools.length > 0,
      toolNames: allFigmaTools.map(t => t.name),
      hasDesktop: desktopTools.length > 0,
      hasRemote: remoteTools.length > 0
    };
  }
}
