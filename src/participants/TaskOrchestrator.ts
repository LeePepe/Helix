import * as vscode from 'vscode';
import { ExecutionContextFactory, WorkspaceInfo } from '../runtime/ExecutionContext';
import { ArtifactStoreFactory } from '../runtime/ArtifactStore';
import { StreamHandlerFactory } from '../runtime/StreamHandler';
import { setupTools } from '../runtime/toolSetup';
import { UnifiedFigmaTask } from '../tasks/UnifiedFigmaTask';
import { getPredefinedPipeline } from '../tasks/commandPresets';
import { FrameworkDetector } from '../utils/frameworkDetector';
import { ConfigService } from '../services/configService';

/**
 * New task orchestrator using the refactored architecture
 */
export class TaskOrchestrator {
  private frameworkDetector: FrameworkDetector;
  private configService: ConfigService;

  constructor() {
    this.frameworkDetector = new FrameworkDetector();
    this.configService = new ConfigService();
  }

  /**
   * Execute BuildFromFigma task
   */
  async buildFromFigma(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    try {
      // Extract Figma node ID from request
      const nodeId = this.extractNodeId(request.prompt);
      
      // Setup workspace info
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        stream.markdown('❌ No workspace folder found');
        return;
      }

      const framework = await this.frameworkDetector.detectFramework('', workspaceRoot);
      const workspaceInfo: WorkspaceInfo = {
        rootPath: workspaceRoot,
        language: 'typescript', // TODO: detect from workspace
        framework: framework || undefined,
      };

      // Create execution context
      const ctx = ExecutionContextFactory.create(
        workspaceInfo,
        {
          model: this.configService.getModelFamily(),
          dryRun: false,
        },
        token
      );

      // Setup runtime
      const tools = setupTools();
      const artifacts = ArtifactStoreFactory.create(workspaceRoot);
      const streamHandler = StreamHandlerFactory.create(stream);

      // Get predefined agent pipeline for build-from-figma command
      const predefinedAgents = getPredefinedPipeline('build-from-figma');

      // Execute task
      stream.markdown('## Building from Figma Design\n\n');
      const task = new UnifiedFigmaTask();
      const result = await task.run(ctx, tools, artifacts, streamHandler, {
        userPrompt: request.prompt,
        nodeId,
        designSystemPath: this.configService.getDesignSystemPath(),
        predefinedAgents, // Pass predefined agent order from command
        qualityThreshold: 90,
      });

      // Show summary
      stream.markdown(`\n\n## Summary\n\n${result.summary}\n`);
      
      // Show artifact location
      const runDir = artifacts.getRunDir(ctx.runId);
      if (runDir) {
        stream.markdown(`\n📦 Artifacts saved to: \`${runDir}\``);
      }

    } catch (error) {
      stream.markdown(`\n\n❌ **Error**: ${error instanceof Error ? error.message : String(error)}\n`);
      console.error('BuildFromFigma error:', error);
    }
  }

  /**
   * Execute FitAndFinish task
   */
  async fitAndFinish(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    try {
      // Extract Figma node ID from request
      const nodeId = this.extractNodeId(request.prompt);
      
      // Setup workspace info
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        stream.markdown('❌ No workspace folder found');
        return;
      }

      const framework = await this.frameworkDetector.detectFramework('', workspaceRoot);
      const workspaceInfo: WorkspaceInfo = {
        rootPath: workspaceRoot,
        language: 'typescript', // TODO: detect from workspace
        framework: framework || undefined,
      };

      // Create execution context
      const ctx = ExecutionContextFactory.create(
        workspaceInfo,
        {
          model: this.configService.getModelFamily(),
          maxIterations: 3,
          dryRun: false,
        },
        token
      );

      // Setup runtime
      const tools = setupTools();
      const artifacts = ArtifactStoreFactory.create(workspaceRoot);
      const streamHandler = StreamHandlerFactory.create(stream);

      // Get predefined agent pipeline for fit-and-finish command
      const predefinedAgents = getPredefinedPipeline('fit-and-finish');

      // Execute fit & finish task
      stream.markdown('## Fit & Finish Iterations\n\n');
      const task = new UnifiedFigmaTask();
      const result = await task.run(ctx, tools, artifacts, streamHandler, {
        userPrompt: request.prompt,
        nodeId,
        maxIterations: 3,
        predefinedAgents, // Pass predefined agent order from command
        qualityThreshold: 90,
      });

      // Show summary
      stream.markdown(`\n\n## Summary\n\n${result.summary}\n`);
      stream.markdown(`**Final Score:** ${result.finalScore}/100\n`);
      
      // Show artifact location
      const runDir = artifacts.getRunDir(ctx.runId);
      if (runDir) {
        stream.markdown(`\n📦 Artifacts saved to: \`${runDir}\``);
      }

    } catch (error) {
      stream.markdown(`\n\n❌ **Error**: ${error instanceof Error ? error.message : String(error)}\n`);
      console.error('FitAndFinish error:', error);
    }
  }

  /**
   * Extract Figma node ID from URL or prompt
   */
  private extractNodeId(prompt: string): string | undefined {
    // Try to extract from Figma URL
    const urlMatch = prompt.match(/node-id=([^&\s]+)/);
    if (urlMatch) {
      return urlMatch[1].replace(/-/g, ':');
    }

    // Check if direct node ID provided
    const nodeIdMatch = prompt.match(/\b(\d+[-:]\d+)\b/);
    if (nodeIdMatch) {
      return nodeIdMatch[1].replace(/-/g, ':');
    }

    return undefined;
  }
}
