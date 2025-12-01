import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface FigmaUrlParts {
  fileKey?: string;
  nodeId?: string;
}

export class FigmaService {
  /**
   * Get design context from Figma using MCP tools
   */
  async getDesignContext(figmaUrl: string): Promise<any> {
    const { fileKey, nodeId } = this.parseFigmaUrl(figmaUrl);

    if (!fileKey || !nodeId) {
      throw new Error('Invalid Figma URL format. Expected: https://figma.com/file/FILE_KEY?node-id=NODE_ID');
    }

    try {
      // Find Figma MCP tools
      const tools = vscode.lm.tools;

      // Look for either figma or figma-desktop tools
      const figmaContextTool = tools.find(tool =>
        tool.name === 'mcp__figma__get_design_context' ||
        tool.name === 'mcp__figma-desktop__get_design_context'
      );

      if (!figmaContextTool) {
        throw new Error(
          '❌ **Figma MCP tools not found**\n\n' +
          'Please install and configure the Figma MCP server:\n' +
          '1. Install Figma MCP server from the Extensions view\n' +
          '2. Or configure in `.vscode/mcp.json`\n\n' +
          'See `.github/ui-fit-finish/initialization/figma-mcp-install.md` for detailed instructions.'
        );
      }

      // Invoke the tool
      const result = await vscode.lm.invokeTool(
        figmaContextTool.name,
        {
          fileKey,
          nodeId
        },
        new vscode.CancellationTokenSource().token
      );

      // Parse result
      const designContext = this.parseToolResult(result);
      return designContext;

    } catch (error) {
      if (error instanceof Error && error.message.includes('Figma MCP tools not found')) {
        throw error;
      }
      throw new Error(`Failed to fetch Figma design: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Install Figma MCP servers by creating or updating .vscode/mcp.json
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
      const figmaServers = {
        'figma-desktop': {
          type: 'http',
          url: 'http://127.0.0.1:3845/mcp'
        },
        'figma': {
          type: 'http',
          url: 'https://mcp.figma.com/mcp'
        }
      };

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
      const message = `✅ Figma MCP servers configured successfully!\n\nNext steps:\n1. Restart VS Code to load MCP servers\n2. Enable MCP in Figma Desktop (Shift+D → Enable MCP)\n3. Authenticate remote server when prompted`;

      vscode.window.showInformationMessage(
        'Figma MCP servers configured!',
        'View Instructions'
      ).then(selection => {
        if (selection === 'View Instructions') {
          const instructionsPath = path.join(workspaceRoot, '.github/ui-fit-finish/initialization/figma-mcp-install.md');
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
        message: `Failed to install MCP servers: ${errorMessage}`
      };
    }
  }

  /**
   * Get design variables/tokens from Figma
   */
  async getVariableDefinitions(fileKey: string): Promise<any> {
    const tools = vscode.lm.tools;

    const variablesTool = tools.find(tool =>
      tool.name === 'mcp__figma__get_variable_defs' ||
      tool.name === 'mcp__figma-desktop__get_variable_defs'
    );

    if (!variablesTool) {
      console.warn('Figma variables tool not found, skipping...');
      return null;
    }

    try {
      const result = await vscode.lm.invokeTool(
        variablesTool.name,
        { fileKey },
        new vscode.CancellationTokenSource().token
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
   */
  checkToolsAvailable(): { available: boolean; toolNames: string[] } {
    const tools = vscode.lm.tools;
    const figmaTools = tools.filter(tool =>
      tool.name.startsWith('mcp__figma__') ||
      tool.name.startsWith('mcp__figma-desktop__')
    );

    return {
      available: figmaTools.length > 0,
      toolNames: figmaTools.map(t => t.name)
    };
  }
}
