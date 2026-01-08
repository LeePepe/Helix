import * as vscode from 'vscode';
import { AgentMetrics } from '../contracts';

/**
 * Streaming support for progress updates and partial messages
 */
export interface StreamUpdate {
  type: 'progress' | 'message' | 'artifact' | 'error';
  content: string;
  metadata?: any;
}

/**
 * Stream handler for VSCode chat responses
 */
export class StreamHandler {
  constructor(
    private readonly stream: vscode.ChatResponseStream
  ) {}

  /**
   * Send a progress update
   */
  progress(message: string): void {
    this.stream.progress(message);
  }

  /**
   * Send a markdown message
   */
  markdown(content: string): void {
    this.stream.markdown(content);
  }

  /**
   * Send a reference (file, uri, etc.)
   */
  reference(reference: vscode.Uri | vscode.Location, iconPath?: vscode.Uri | vscode.ThemeIcon): void {
    this.stream.reference(reference, iconPath);
  }

  /**
   * Send a button
   */
  button(command: vscode.Command): void {
    this.stream.button(command);
  }

  /**
   * Send an anchor link
   */
  anchor(value: vscode.Uri | vscode.Location, title?: string): void {
    this.stream.anchor(value, title);
  }

  /**
   * Push an update to the stream
   */
  update(update: StreamUpdate): void {
    switch (update.type) {
      case 'progress':
        this.progress(update.content);
        break;
      case 'message':
        this.markdown(update.content);
        break;
      case 'error':
        this.markdown(`❌ **Error:** ${update.content}`);
        break;
      case 'artifact':
        this.markdown(`📦 ${update.content}`);
        break;
    }
  }

  /**
   * Push multiple updates
   */
  updateMany(updates: StreamUpdate[]): void {
    for (const update of updates) {
      this.update(update);
    }
  }

  /**
   * Display agent metrics in a formatted way
   */
  displayAgentMetrics(metrics: AgentMetrics): void {
    const durationSec = (metrics.durationMs / 1000).toFixed(2);
    const status = metrics.success ? '✅' : '❌';

    let metricsLine = `${status} **${metrics.agentName}** - ${durationSec}s`;

    if (metrics.tokenUsage) {
      const totalTokens = metrics.tokenUsage.totalTokens.toLocaleString();
      metricsLine += ` | 🪙 ${totalTokens} tokens`;
    }

    if (metrics.error) {
      metricsLine += ` | Error: ${metrics.error}`;
    }

    this.markdown(metricsLine + '\n');
  }

  /**
   * Display summary of all agent metrics
   */
  displayMetricsSummary(allMetrics: AgentMetrics[]): void {
    if (allMetrics.length === 0) {
      return;
    }

    const totalDurationMs = allMetrics.reduce((sum, m) => sum + m.durationMs, 0);
    const totalTokens = allMetrics.reduce((sum, m) => sum + (m.tokenUsage?.totalTokens || 0), 0);
    const successCount = allMetrics.filter(m => m.success).length;

    this.markdown('\n---\n\n');
    this.markdown('### 📊 Execution Summary\n\n');
    this.markdown(`- **Total Time:** ${(totalDurationMs / 1000).toFixed(2)}s\n`);
    this.markdown(`- **Total Tokens:** ${totalTokens.toLocaleString()}\n`);
    this.markdown(`- **Agents Executed:** ${successCount}/${allMetrics.length} successful\n`);
    this.markdown('\n');
  }
}

/**
 * Factory to create stream handlers
 */
export class StreamHandlerFactory {
  static create(stream: vscode.ChatResponseStream): StreamHandler {
    return new StreamHandler(stream);
  }
}
