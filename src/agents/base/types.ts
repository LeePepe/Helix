import * as vscode from 'vscode';

/**
 * Agent 上下文，包含执行环境信息
 */
export interface AgentContext {
  workspaceRoot: string;
  stream: vscode.ChatResponseStream;
  token: vscode.CancellationToken;
  extensionContext: vscode.ExtensionContext;
}

/**
 * Agent 输入，泛型 T 为具体数据类型
 */
export interface AgentInput<T = any> {
  data: T;
  context: AgentContext;
}

/**
 * Agent 输出，泛型 T 为具体结果类型
 */
export interface AgentOutput<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    executionTime?: number;
    agentName?: string;
    executionMode?: 'llm' | 'tool';
    [key: string]: any;
  };
}

/**
 * Agent 基础接口
 */
export interface Agent<TInput = any, TOutput = any> {
  name: string;
  description: string;
  executionMode: 'llm' | 'tool';
  execute(input: AgentInput<TInput>): Promise<AgentOutput<TOutput>>;
}

/**
 * 维度任务定义
 */
export interface DimensionTask {
  id: string;
  name: string;
  agentType: string;
  executionMode: 'llm' | 'tool';
  config: Record<string, any>;
  priority: number;
  dependencies: string[];
}

/**
 * 执行计划
 */
export interface ExecutionPlan {
  dimensions: DimensionTask[];
  dependencies: Map<string, string[]>;
  parallelGroups: DimensionTask[][];
  metadata: {
    totalDimensions: number;
    estimatedTime: number;
  };
}

/**
 * 动态 Agent 定义
 */
export interface DynamicAgentDefinition {
  name: string;
  description: string;
  executionMode: 'llm' | 'tool';
  prompt?: string;
  toolConfig?: {
    extractorType: 'css' | 'token' | 'ast';
    comparatorType: 'exact' | 'fuzzy' | 'semantic';
  };
}

/**
 * 并行任务定义
 */
export interface ParallelTask {
  agentName: string;
  input: AgentInput;
  dependencies?: string[];
}

/**
 * 并行执行结果
 */
export interface ParallelExecutionResult {
  results: Map<string, AgentOutput>;
  executionOrder: string[];
  totalTime: number;
}

/**
 * 差异定义
 */
export interface Difference {
  category: string;
  severity: 'critical' | 'minor';
  property: string;
  figmaValue: string;
  codeValue: string;
  fix: string;
  filePath?: string;
  lineNumber?: number;
  status?: 'fixed' | 'manual' | 'pending';
}

/**
 * 维度结果
 */
export interface DimensionResult {
  dimension: string;
  matchRate: number;
  differences: Difference[];
  executionMode?: 'llm' | 'tool';
}

/**
 * 聚合结果
 */
export interface AggregatedResult {
  totalDimensions: number;
  overallMatchRate: number;
  dimensionResults: DimensionResult[];
  allDifferences: Difference[];
  criticalCount: number;
  minorCount: number;
}
