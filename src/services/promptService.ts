import * as vscode from 'vscode';
import { ConfigService } from './configService';

/**
 * Service for loading and composing prompts from external files
 * Uses simple string concatenation (no template variables)
 */
export class PromptService {
  private configService: ConfigService;

  constructor() {
    this.configService = new ConfigService();
  }

  /**
   * Load a task-specific prompt from docs/tasks/
   */
  async loadTaskPrompt(taskName: 'fit-finish' | 'gen-code'): Promise<string> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }

    const guidesPath = this.configService.getGuidesPath();
    const promptFile = `${taskName}.md`;
    const promptUri = vscode.Uri.joinPath(workspaceFolder.uri, guidesPath, promptFile);

    try {
      const fileContent = await vscode.workspace.fs.readFile(promptUri);
      return Buffer.from(fileContent).toString('utf8');
    } catch (error) {
      throw new Error(
        `Failed to load task prompt: ${guidesPath}/${promptFile}. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Load any prompt file by name from .github/prompts/
   */
  async loadPrompt(promptFileName: string): Promise<string> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }

    const promptsPath = this.configService.getPromptsPath();
    const promptUri = vscode.Uri.joinPath(workspaceFolder.uri, promptsPath, promptFileName);

    try {
      const fileContent = await vscode.workspace.fs.readFile(promptUri);
      return Buffer.from(fileContent).toString('utf8');
    } catch (error) {
      throw new Error(
        `Failed to load prompt file: ${promptsPath}/${promptFileName}. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }


  /**
   * Compose the final prompt by concatenating all parts
   * Simple string concatenation with clear section markers
   */
  composePrompt(
    basePrompt: string,
    designSystemGuide: string,
    figmaSpec: any,
    additionalContext?: Record<string, any>
  ): string {
    let composedPrompt = basePrompt;

    // Add Design System Guide
    composedPrompt += '\n\n## Design System Guide\n\n';
    composedPrompt += designSystemGuide;

    // Add Figma Specification
    composedPrompt += '\n\n## Figma Design Specification\n\n';
    composedPrompt += JSON.stringify(figmaSpec, null, 2);

    // Add any additional context
    if (additionalContext) {
      for (const [key, value] of Object.entries(additionalContext)) {
        composedPrompt += `\n\n## ${this.formatSectionTitle(key)}\n\n`;
        if (typeof value === 'string') {
          composedPrompt += value;
        } else {
          composedPrompt += JSON.stringify(value, null, 2);
        }
      }
    }

    return composedPrompt;
  }

  /**
   * Format a camelCase key into a readable section title
   * Example: codeContent -> Code Content
   */
  private formatSectionTitle(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }
}
