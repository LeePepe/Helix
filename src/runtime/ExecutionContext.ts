import * as vscode from 'vscode';
import { TraceEvent, AgentMetrics, TokenUsage } from '../contracts';

/**
 * Execution settings snapshot for a run
 */
export interface ExecutionSettings {
  model: string;
  maxIterations: number;
  dryRun: boolean;
  replay: boolean;
  enableTelemetry: boolean;
  verbose: boolean;
  reportsPath?: string; // Path to save reports (default: 'reports')
}

/**
 * Workspace information for a run
 */
export interface WorkspaceInfo {
  rootPath: string;
  language?: string;
  framework?: string;
}

/**
 * Execution context for a single run
 * Provides: runId, cancellation, settings snapshot, workspace info, telemetry context
 */
export class ExecutionContext {
  private _cancelled = false;
  private _traceEvents: TraceEvent[] = [];
  private _agentMetrics: AgentMetrics[] = [];
  private _currentTokenUsage: TokenUsage | undefined;

  constructor(
    public readonly runId: string,
    public readonly workspaceInfo: WorkspaceInfo,
    public readonly settings: ExecutionSettings,
    public readonly cancellationToken?: vscode.CancellationToken
  ) {
    // Listen to cancellation token if provided
    if (cancellationToken) {
      cancellationToken.onCancellationRequested(() => {
        this._cancelled = true;
      });
    }
  }

  /**
   * Check if execution has been cancelled
   */
  get cancelled(): boolean {
    return this._cancelled || this.cancellationToken?.isCancellationRequested || false;
  }

  /**
   * Throw if cancelled
   */
  throwIfCancelled(): void {
    if (this.cancelled) {
      throw new Error('Execution cancelled');
    }
  }

  /**
   * Add a trace event
   */
  trace(source: 'task' | 'agent' | 'service', name: string, data?: any): void {
    this._traceEvents.push({
      ts: new Date().toISOString(),
      source,
      name,
      data,
    });
  }

  /**
   * Get all trace events
   */
  getTraceEvents(): TraceEvent[] {
    return [...this._traceEvents];
  }

  /**
   * Record agent metrics
   */
  addAgentMetrics(metrics: AgentMetrics): void {
    this._agentMetrics.push(metrics);
  }

  /**
   * Get all agent metrics
   */
  getAgentMetrics(): AgentMetrics[] {
    return [...this._agentMetrics];
  }

  /**
   * Set current token usage (from LLM calls)
   */
  setTokenUsage(usage: TokenUsage): void {
    this._currentTokenUsage = usage;
  }

  /**
   * Get current token usage
   */
  getTokenUsage(): TokenUsage | undefined {
    return this._currentTokenUsage;
  }

  /**
   * Reset token usage (call before agent execution)
   */
  resetTokenUsage(): void {
    this._currentTokenUsage = undefined;
  }

  /**
   * Get total token usage across all agents
   */
  getTotalTokenUsage(): TokenUsage {
    return this._agentMetrics.reduce(
      (total, metrics) => {
        if (metrics.tokenUsage) {
          return {
            promptTokens: total.promptTokens + metrics.tokenUsage.promptTokens,
            completionTokens: total.completionTokens + metrics.tokenUsage.completionTokens,
            totalTokens: total.totalTokens + metrics.tokenUsage.totalTokens,
          };
        }
        return total;
      },
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    );
  }

  /**
   * Create a child context (for sub-tasks or agents)
   */
  createChild(runId?: string): ExecutionContext {
    return new ExecutionContext(
      runId || `${this.runId}-child-${Date.now()}`,
      this.workspaceInfo,
      this.settings,
      this.cancellationToken
    );
  }
}

/**
 * Factory to create execution contexts
 */
export class ExecutionContextFactory {
  static create(
    workspaceInfo: WorkspaceInfo,
    settings: Partial<ExecutionSettings> = {},
    cancellationToken?: vscode.CancellationToken
  ): ExecutionContext {
    const runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const fullSettings: ExecutionSettings = {
      model: settings.model || 'gpt-4',
      maxIterations: settings.maxIterations || 3,
      dryRun: settings.dryRun || false,
      replay: settings.replay || false,
      enableTelemetry: settings.enableTelemetry !== false,
      verbose: settings.verbose || false,      reportsPath: settings.reportsPath || 'reports',    };

    return new ExecutionContext(runId, workspaceInfo, fullSettings, cancellationToken);
  }
}
