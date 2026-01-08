import * as vscode from 'vscode';
import { AgentMetrics } from '../contracts';

/**
 * Streaming support for progress updates and partial messages
 */
export interface StreamUpdate {
  type: 'progress' | 'message' | 'artifact' | 'error' | 'agent_start' | 'agent_progress' | 'agent_complete' | 'agent_error';
  content: string;
  metadata?: any;
}

/**
 * Agent execution phase
 */
export type AgentPhase = 'starting' | 'executing' | 'validating' | 'complete' | 'error';

/**
 * Agent flow event for tracking agent execution
 */
export interface AgentFlowEvent {
  agentName: string;
  phase: AgentPhase;
  message?: string;
  timestamp: number;
  metadata?: any;
}

/**
 * Stream handler for VSCode chat responses
 */
export class StreamHandler {
  private agentFlowEvents: AgentFlowEvent[] = [];
  private currentAgentStartTime: Map<string, number> = new Map();

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

  /**
   * Report agent starting execution
   */
  agentStart(agentName: string, message?: string): void {
    const timestamp = Date.now();
    this.currentAgentStartTime.set(agentName, timestamp);

    const event: AgentFlowEvent = {
      agentName,
      phase: 'starting',
      message,
      timestamp,
    };
    this.agentFlowEvents.push(event);

    const displayMessage = message || `Starting ${agentName}...`;
    this.progress(displayMessage);
  }

  /**
   * Report agent progress during execution
   */
  agentProgress(agentName: string, phase: 'executing' | 'validating', message?: string): void {
    const event: AgentFlowEvent = {
      agentName,
      phase,
      message,
      timestamp: Date.now(),
    };
    this.agentFlowEvents.push(event);

    if (message) {
      this.progress(`${agentName}: ${message}`);
    }
  }

  /**
   * Report agent completion
   */
  agentComplete(agentName: string, metrics?: AgentMetrics): void {
    const timestamp = Date.now();
    const startTime = this.currentAgentStartTime.get(agentName);
    const duration = startTime ? timestamp - startTime : 0;

    const event: AgentFlowEvent = {
      agentName,
      phase: 'complete',
      timestamp,
      metadata: { durationMs: duration, metrics },
    };
    this.agentFlowEvents.push(event);
    this.currentAgentStartTime.delete(agentName);

    // Display metrics if provided
    if (metrics) {
      this.displayAgentMetrics(metrics);
    }
  }

  /**
   * Report agent error
   */
  agentError(agentName: string, error: string | Error): void {
    const timestamp = Date.now();
    const errorMessage = error instanceof Error ? error.message : error;

    const event: AgentFlowEvent = {
      agentName,
      phase: 'error',
      message: errorMessage,
      timestamp,
    };
    this.agentFlowEvents.push(event);
    this.currentAgentStartTime.delete(agentName);

    this.markdown(`❌ **${agentName}** failed: ${errorMessage}\n`);
  }

  /**
   * Display agent flow visualization
   */
  displayAgentFlow(): void {
    if (this.agentFlowEvents.length === 0) {
      return;
    }

    this.markdown('\n### 🔄 Agent Execution Flow\n\n');

    // Group events by agent
    const agentGroups = new Map<string, AgentFlowEvent[]>();
    for (const event of this.agentFlowEvents) {
      if (!agentGroups.has(event.agentName)) {
        agentGroups.set(event.agentName, []);
      }
      agentGroups.get(event.agentName)!.push(event);
    }

    // Display timeline
    for (const [agentName, events] of agentGroups) {
      const startEvent = events.find(e => e.phase === 'starting');
      const endEvent = events.find(e => e.phase === 'complete' || e.phase === 'error');

      if (startEvent && endEvent) {
        const duration = endEvent.timestamp - startEvent.timestamp;
        const status = endEvent.phase === 'complete' ? '✅' : '❌';
        const durationSec = (duration / 1000).toFixed(2);

        this.markdown(`${status} **${agentName}** (${durationSec}s)\n`);

        // Display intermediate steps
        const intermediateEvents = events.filter(
          e => e.phase !== 'starting' && e.phase !== 'complete' && e.phase !== 'error'
        );

        for (const event of intermediateEvents) {
          if (event.message) {
            this.markdown(`  ↳ ${event.message}\n`);
          }
        }
      }
    }

    this.markdown('\n');
  }

  /**
   * Get all agent flow events
   */
  getAgentFlowEvents(): AgentFlowEvent[] {
    return [...this.agentFlowEvents];
  }

  /**
   * Clear agent flow events
   */
  clearAgentFlow(): void {
    this.agentFlowEvents = [];
    this.currentAgentStartTime.clear();
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
