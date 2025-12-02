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
   * Get the full configuration object
   */
  getConfig(): HelixConfig {
    return {
      designSystemPath: this.getDesignSystemPath(),
      enableRemoteFigma: this.isRemoteFigmaEnabled(),
      modelFamily: this.getModelFamily()
    };
  }
}
