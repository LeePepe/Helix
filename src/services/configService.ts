import * as vscode from 'vscode';
import { HelixConfig, DEFAULT_CONFIG, DEFAULT_TOOLS } from '../types/config';

/**
 * Service for managing Helix configuration
 * Handles workspace-level settings for file paths
 */
export class ConfigService {
  /**
   * Get the path to the design system guide
   */
  getDesignSystemPath(): string {
    const config = vscode.workspace.getConfiguration('helix');
    return config.get<string>('designSystemPath', DEFAULT_CONFIG.designSystemPath);
  }

  /**
   * Check if remote Figma MCP is enabled
   */
  isRemoteFigmaEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('helix');
    return config.get<boolean>('enableRemoteFigma', DEFAULT_CONFIG.enableRemoteFigma);
  }

  /**
   * Get the language model family to use
   */
  getModelFamily(): string {
    const config = vscode.workspace.getConfiguration('helix');
    return config.get<string>('modelFamily', DEFAULT_CONFIG.modelFamily);
  }

  /**
   * Get allowed tools patterns
   * Supports exact names and wildcards (e.g., 'figma-desktop/*')
   */
  getTools(): string[] {
    const config = vscode.workspace.getConfiguration('helix');
    return config.get<string[]>('tools', DEFAULT_TOOLS);
  }

  /**
   * Filter available tools based on configured patterns
   * @param allTools All available tools from vscode.lm.tools
   * @returns Filtered tools matching the configured patterns
   */
  filterTools(allTools: readonly vscode.LanguageModelChatTool[]): vscode.LanguageModelChatTool[] {
    const patterns = this.getTools();
    
    return allTools.filter(tool => {
      return patterns.some(pattern => {
        if (pattern.endsWith('/*')) {
          // Wildcard pattern: match prefix
          const prefix = pattern.slice(0, -2);
          return tool.name.startsWith(prefix);
        } else {
          // Exact match or contains
          return tool.name === pattern || tool.name.includes(pattern);
        }
      });
    });
  }

  /**
   * Get the full configuration object
   */
  getConfig(): HelixConfig {
    return {
      designSystemPath: this.getDesignSystemPath(),
      enableRemoteFigma: this.isRemoteFigmaEnabled(),
      modelFamily: this.getModelFamily(),
      tools: this.getTools()
    };
  }
}
