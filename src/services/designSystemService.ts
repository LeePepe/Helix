import * as vscode from 'vscode';

export class DesignSystemService {
  private designSystemContent: string | null = null;
  private designSystemPath: string | null = null;

  /**
   * Load the design system guide from the workspace
   */
  async loadDesignSystem(): Promise<void> {
    const config = vscode.workspace.getConfiguration('helix');
    const configPath = config.get<string>('designSystemPath', '.github/design-system-guide.md');

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open. Please open a workspace to use Helix.');
    }

    const designSystemUri = vscode.Uri.joinPath(workspaceFolder.uri, configPath);
    this.designSystemPath = designSystemUri.fsPath;

    try {
      const fileContent = await vscode.workspace.fs.readFile(designSystemUri);
      this.designSystemContent = Buffer.from(fileContent).toString('utf8');
      console.log(`Design system guide loaded from: ${this.designSystemPath}`);
    } catch (error) {
      throw new Error(
        `Failed to load design system guide at "${configPath}". ` +
        `Please ensure the file exists or update the path in settings (helix.designSystemPath).`
      );
    }
  }

  /**
   * Get the loaded design system content
   */
  getGuideContent(): string {
    if (!this.designSystemContent) {
      throw new Error('Design system guide not loaded. Call loadDesignSystem() first.');
    }
    return this.designSystemContent;
  }

  /**
   * Check if the design system is loaded
   */
  isLoaded(): boolean {
    return this.designSystemContent !== null;
  }

  /**
   * Get the path to the design system guide
   */
  getGuidePath(): string | null {
    return this.designSystemPath;
  }
}
