import * as vscode from 'vscode';

export class FileService {
  /**
   * Read a file from the workspace
   * @param relativePath Path relative to workspace root, or absolute path
   */
  async readFile(relativePath: string): Promise<string> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }

    // Determine if path is absolute or relative
    let fileUri: vscode.Uri;
    if (relativePath.startsWith('/') || relativePath.match(/^[a-zA-Z]:\\/)) {
      // Absolute path
      fileUri = vscode.Uri.file(relativePath);
    } else {
      // Relative path from workspace root
      fileUri = vscode.Uri.joinPath(workspaceFolder.uri, relativePath);
    }

    try {
      const fileContent = await vscode.workspace.fs.readFile(fileUri);
      return Buffer.from(fileContent).toString('utf8');
    } catch (error) {
      throw new Error(`Failed to read file "${relativePath}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Write a file to the workspace
   * @param relativePath Path relative to workspace root, or absolute path
   * @param content File content
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }

    // Determine if path is absolute or relative
    let fileUri: vscode.Uri;
    if (relativePath.startsWith('/') || relativePath.match(/^[a-zA-Z]:\\/)) {
      // Absolute path
      fileUri = vscode.Uri.file(relativePath);
    } else {
      // Relative path from workspace root
      fileUri = vscode.Uri.joinPath(workspaceFolder.uri, relativePath);
    }

    try {
      const buffer = Buffer.from(content, 'utf8');
      await vscode.workspace.fs.writeFile(fileUri, buffer);
    } catch (error) {
      throw new Error(`Failed to write file "${relativePath}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(relativePath: string): Promise<boolean> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return false;
    }

    let fileUri: vscode.Uri;
    if (relativePath.startsWith('/') || relativePath.match(/^[a-zA-Z]:\\/)) {
      fileUri = vscode.Uri.file(relativePath);
    } else {
      fileUri = vscode.Uri.joinPath(workspaceFolder.uri, relativePath);
    }

    try {
      await vscode.workspace.fs.stat(fileUri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the workspace root path
   */
  getWorkspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }
}
