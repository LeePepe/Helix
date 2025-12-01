import * as vscode from 'vscode';
import { HelixConfig, DEFAULT_CONFIG } from '../types/config';

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
   * Get the path to the prompts directory
   */
  getPromptsPath(): string {
    const config = vscode.workspace.getConfiguration('helix');
    return config.get<string>('promptsPath', DEFAULT_CONFIG.promptsPath);
  }

  /**
   * Get the path to the task guides directory
   */
  getGuidesPath(): string {
    const config = vscode.workspace.getConfiguration('helix');
    return config.get<string>('guidesPath', DEFAULT_CONFIG.guidesPath);
  }

  /**
   * Check if remote Figma MCP is enabled
   */
  isRemoteFigmaEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('helix');
    return config.get<boolean>('enableRemoteFigma', DEFAULT_CONFIG.enableRemoteFigma);
  }

  /**
   * Get the full configuration object
   */
  getConfig(): HelixConfig {
    return {
      designSystemPath: this.getDesignSystemPath(),
      promptsPath: this.getPromptsPath(),
      guidesPath: this.getGuidesPath(),
      enableRemoteFigma: this.isRemoteFigmaEnabled()
    };
  }
}
