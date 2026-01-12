import * as vscode from 'vscode';
import { z } from 'zod';
import { BaseAgent } from './base/Agent';
import { FigmaAnalysisResult } from '../contracts/figma';
import { DesignSystemAnalysisResult } from '../contracts/designSystem';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ToolRegistry } from '../runtime/ToolRegistry';
import { StreamHandler } from '../runtime/StreamHandler';
import { LLMService } from '../services/llmService';

export interface CodeAnalyzerInput {
  userPrompt?: string;
  userReferences?: Array<{
    id?: string;
    title?: string;
    description?: string;
    url?: string;
    content?: string;
  }>;
}

export interface CodeAnalyzerOutput {
  implementationContext: {
    files: string[];
  };
}

// Schema for validation
export const CodeAnalyzerOutputSchema = z.object({
  implementationContext: z.object({
    files: z.array(z.string())
  })
});

export class CodeAnalyzerAgent extends BaseAgent<CodeAnalyzerInput, CodeAnalyzerOutput> {
  readonly name = 'CodeAnalyzer';
  readonly description = 'Extracts file paths from user prompt and references';
  readonly outputSchema = CodeAnalyzerOutputSchema;

  private readonly llmService: LLMService;

  constructor(llmService?: LLMService) {
    super();
    this.llmService = llmService ?? new LLMService();
  }

  protected async execute(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: CodeAnalyzerInput,
    stream?: StreamHandler
  ): Promise<CodeAnalyzerOutput> {
    const userPrompt = input?.userPrompt || '';
    const userReferences = input?.userReferences || [];

    if (stream) {
      stream.agentStart(this.name, 'Extracting file paths from user prompt and references...');
    }

    // Build context from user references
    const referencesContext = userReferences
      .filter(ref => ref?.content)
      .map(ref => {
        const identifier = ref.title || ref.url || ref.id || 'reference';
        return `Reference: ${identifier}\n${ref.content}`;
      })
      .join('\n\n');

    const messages = [
      vscode.LanguageModelChatMessage.User(
        `Extract file identifiers (names, paths, or components) from the user prompt and references. ` +
        `Identify source code files that the user wants to work with.\n\n` +
        `Return a JSON array of simple file identifiers (e.g., ['Button', 'DialogView', 'app.ts']).\n` +
        `Do not include build artifacts, compiled files, or temporary files.`
      ),
      vscode.LanguageModelChatMessage.User(
        `User Prompt:\n${userPrompt}\n\n${referencesContext ? `References:\n${referencesContext}` : ''}`
      ),
    ];

    try {
      if (stream) {
        stream.agentProgress(this.name, 'executing', 'Extracting file paths...');
      }

      const llmResult = await this.llmService.chatJSON(ctx, messages, {
        name: 'FilePathList',
        description: 'Extract file path list',
        schema: z.array(z.string()),
      });

      if (llmResult.ok && llmResult.data) {
        const extractedIdentifiers = llmResult.data as string[];
        const resolvedPaths: string[] = [];
        
        if (stream) {
          stream.agentProgress(this.name, 'executing', `Searching for ${extractedIdentifiers.length} file(s)...`);
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspaceRoot = workspaceFolders?.[0]?.uri;

        // For each identifier, search workspace and let LLM pick the best match
        for (const identifier of extractedIdentifiers) {
          try {
            let fileUri: vscode.Uri | undefined;
            
            // Try direct path first
            if (identifier.startsWith('/') || identifier.includes(':\\')) {
              fileUri = vscode.Uri.file(identifier);
              try {
                await vscode.workspace.fs.stat(fileUri);
              } catch {
                fileUri = undefined;
              }
            } else if (workspaceRoot) {
              // Try as relative path
              const possibleUri = vscode.Uri.joinPath(workspaceRoot, identifier);
              try {
                await vscode.workspace.fs.stat(possibleUri);
                fileUri = possibleUri;
              } catch {
                // Search workspace for matches
                const searchPattern = identifier.includes('/') ? `**/${identifier}` : `**/*${identifier}*`;
                const excludePattern = '{**/node_modules/**,**/.build/**,**/build/**,**/dist/**,**/*.o,**/*.obj,**/*.exe,**/*.dll}';
                const foundFiles = await vscode.workspace.findFiles(searchPattern, excludePattern, 10);
                
                if (foundFiles.length === 1) {
                  fileUri = foundFiles[0];
                } else if (foundFiles.length > 1) {
                  // Multiple matches - use LLM to pick best one
                  const candidatePaths = foundFiles.map(f => vscode.workspace.asRelativePath(f));
                  
                  if (stream) {
                    stream.agentProgress(this.name, 'executing', `Found ${candidatePaths.length} candidates for "${identifier}", asking LLM...`);
                  }

                  const selectionMessages = [
                    vscode.LanguageModelChatMessage.User(
                      `Given the file identifier "${identifier}" and the following candidate paths, ` +
                      `select the most appropriate SOURCE CODE file (not build artifacts or compiled files).\n\n` +
                      `Candidates:\n${candidatePaths.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n` +
                      `Return the index (1-based) of the best match as a single number.`
                    )
                  ];

                  const selectionResult = await this.llmService.chatJSON(ctx, selectionMessages, {
                    name: 'FileSelection',
                    description: 'Select best file match',
                    schema: z.object({ index: z.number() }),
                  });

                  if (selectionResult.ok && selectionResult.data) {
                    const selection = selectionResult.data as { index: number };
                    const selectedIndex = selection.index - 1;
                    if (selectedIndex >= 0 && selectedIndex < foundFiles.length) {
                      fileUri = foundFiles[selectedIndex];
                    } else {
                      // Fallback to first non-build file
                      fileUri = foundFiles[0];
                    }
                  } else {
                    // Fallback to first match
                    fileUri = foundFiles[0];
                  }
                }
              }
            }

            if (fileUri) {
              const relativePath = vscode.workspace.asRelativePath(fileUri);
              resolvedPaths.push(relativePath);
              
              if (stream) {
                stream.agentProgress(this.name, 'executing', `Resolved: "${identifier}" -> ${relativePath}`);
              }
            } else {
              console.warn(`[Helix] [CodeAnalyzerAgent] Could not resolve file: ${identifier}`);
              if (stream) {
                stream.markdown(`⚠️ Could not resolve file: ${identifier}\n`);
              }
            }
          } catch (error) {
            console.warn(`[Helix] [CodeAnalyzerAgent] Error resolving file: ${identifier}`, error);
            if (stream) {
              stream.markdown(`⚠️ Error resolving file: ${identifier}\n`);
            }
          }
        }

        const result: CodeAnalyzerOutput = { implementationContext: { files: resolvedPaths } };
        
        if (stream) {
          stream.agentComplete(this.name, 'completed', `Resolved ${resolvedPaths.length} of ${extractedIdentifiers.length} file(s)`);
        }

        return result;
      } else {
        throw new Error(llmResult.error?.message || 'LLM analysis failed');
      }
    } catch (err) {
      const errorMsg = (err as Error).message;
      console.error('[Helix] [CodeAnalyzerAgent] Error:', errorMsg);
      
      if (stream) {
        stream.markdown(`⚠️ Failed to extract file paths: ${errorMsg}\n`);
        stream.agentComplete(this.name, 'failed', errorMsg);
      }

      // Return empty context on error
      return { implementationContext: { files: [] } };
    }
  }
}
