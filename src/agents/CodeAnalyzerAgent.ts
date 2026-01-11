import * as vscode from 'vscode';
import { z } from 'zod';
import { BaseAgent } from './base/Agent';
import { FigmaAnalysisResult } from '../contracts/figma';
import { DesignSystemAnalysisResult } from '../contracts/designSystem';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ToolRegistry } from '../runtime/ToolRegistry';
import { StreamHandler } from '../runtime/StreamHandler';

export interface CodeAnalyzerInput {
  filePaths: string[];
}

export interface CodeAnalyzerOutput {
  implementationContext: {
    files: Record<string, string>;
  };
}

// Schema for validation
export const CodeAnalyzerOutputSchema = z.object({
  implementationContext: z.object({
    files: z.record(z.string())
  })
});

export class CodeAnalyzerAgent extends BaseAgent<CodeAnalyzerInput, CodeAnalyzerOutput> {
  readonly name = 'CodeAnalyzer';
  readonly description = 'Analyzes existing code implementation by reading specified files';
  readonly outputSchema = CodeAnalyzerOutputSchema;

  protected async execute(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: CodeAnalyzerInput,
    stream?: StreamHandler
  ): Promise<CodeAnalyzerOutput> {
    const implementationContext: { files: Record<string, string> } = { files: {} };
    
    // Log start
    console.log('[Helix] [CodeAnalyzerAgent] Starting analysis of files:', input.filePaths);
    if (stream) {
      stream.agentProgress(this.name, 'start', `Analyzing ${input.filePaths.length} files...`);
    }

    // Read all files
    for (const filePath of input.filePaths) {
      try {
        const result = await tools.invoke(ctx, 'workspace.readFile', { filePath });
        
        if (result.ok && result.data) {
          implementationContext.files[filePath] = result.data.content;
          if (stream) {
             stream.agentProgress(this.name, 'read', `Read ${vscode.workspace.asRelativePath(filePath)}`);
          }
        } else {
          console.warn(`[Helix] [CodeAnalyzerAgent] Failed to read ${filePath}:`, result.error);
          if (stream) {
             stream.markdown(`⚠️ Failed to read file: ${vscode.workspace.asRelativePath(filePath)}\n`);
          }
        }
      } catch (error) {
        console.error(`[Helix] [CodeAnalyzerAgent] Error reading ${filePath}:`, error);
      }
    }

    return {
      figmaData: input.figmaData,
      designSystem: input.designSystem,
      implementationContext
    };
  }
}
