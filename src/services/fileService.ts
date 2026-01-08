import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ToolResult } from '../contracts';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ErrorCodes } from '../runtime/errors';

/**
 * File service for workspace file operations
 * Unified service supporting both ExecutionContext (new) and direct calls (legacy)
 */
export class FileService {
  /**
   * Read file content
   */
  async readFile(ctx: ExecutionContext, filePath: string): Promise<ToolResult> {
    try {
      ctx.trace('service', 'workspace-read-file', { filePath });

      const content = await fs.readFile(filePath, 'utf-8');

      return {
        ok: true,
        data: { filePath, content },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.WORKSPACE_READ_FAILED,
          message: `Failed to read file: ${filePath}`,
          details: (err as Error).message,
        },
      };
    }
  }

  /**
   * Write file content
   */
  async writeFile(
    ctx: ExecutionContext,
    filePath: string,
    content: string
  ): Promise<ToolResult> {
    try {
      ctx.trace('service', 'workspace-write-file', { filePath, size: content.length });

      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(filePath, content, 'utf-8');

      return {
        ok: true,
        data: { filePath },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.WORKSPACE_WRITE_FAILED,
          message: `Failed to write file: ${filePath}`,
          details: (err as Error).message,
        },
      };
    }
  }

  /**
   * Apply a patch/diff to a file
   */
  async applyPatch(
    ctx: ExecutionContext,
    filePath: string,
    diff: string
  ): Promise<ToolResult> {
    try {
      ctx.trace('service', 'workspace-apply-patch', { filePath, diffSize: diff.length });

      // TODO: Implement proper patch application
      // For now, this is a placeholder that would need a proper diff library
      
      return {
        ok: false,
        error: {
          code: ErrorCodes.WORKSPACE_WRITE_FAILED,
          message: 'Patch application not yet implemented',
          details: 'Use writeFile with full content for now',
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.WORKSPACE_WRITE_FAILED,
          message: `Failed to apply patch: ${filePath}`,
          details: (err as Error).message,
        },
      };
    }
  }

  /**
   * Search for files matching a pattern
   */
  async findFiles(
    ctx: ExecutionContext,
    pattern: string,
    exclude?: string
  ): Promise<ToolResult> {
    try {
      ctx.trace('service', 'workspace-find-files', { pattern, exclude });

      const files = await vscode.workspace.findFiles(
        pattern,
        exclude,
        100 // limit
      );

      return {
        ok: true,
        data: {
          files: files.map(uri => uri.fsPath),
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.WORKSPACE_READ_FAILED,
          message: `Failed to find files: ${pattern}`,
          details: (err as Error).message,
        },
      };
    }
  }

  /**
   * Open a document in the editor
   */
  async openDocument(ctx: ExecutionContext, filePath: string): Promise<ToolResult> {
    try {
      ctx.trace('service', 'workspace-open-document', { filePath });

      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);

      return {
        ok: true,
        data: { filePath },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.WORKSPACE_READ_FAILED,
          message: `Failed to open document: ${filePath}`,
          details: (err as Error).message,
        },
      };
    }
  }

  /**
   * Get workspace root path
   */
  getWorkspaceRoot(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return workspaceFolders?.[0]?.uri.fsPath;
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(ctx: ExecutionContext, dirPath: string): Promise<ToolResult> {
    try {
      ctx.trace('service', 'workspace-list-directory', { dirPath });

      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      return {
        ok: true,
        data: {
          entries: entries.map(entry => ({
            name: entry.name,
            isDirectory: entry.isDirectory(),
            path: path.join(dirPath, entry.name),
          })),
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.WORKSPACE_READ_FAILED,
          message: `Failed to list directory: ${dirPath}`,
          details: (err as Error).message,
        },
      };
    }
  }
}
