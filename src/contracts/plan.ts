import { z } from 'zod';
import { FigmaRefSchema, TraceEventSchema } from './common';

// ============================================================================
// Plan Result (DAG)
// ============================================================================

export const SubtaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  dependsOn: z.array(z.string()), // subtask ids
  inputs: z.object({
    figmaRefs: z.array(FigmaRefSchema),
    uiPartIds: z.array(z.string()).optional(),
    notes: z.string().optional(),
  }),
  acceptanceCriteria: z.array(z.string()),
  suggestedTools: z.array(z.string()).optional(), // tool ids
});

export type Subtask = z.infer<typeof SubtaskSchema>;

// ============================================================================
// Agent Workflow Plan
// ============================================================================

export const AgentWorkflowStepSchema = z.object({
  agentName: z.string(),
  executionOrder: z.number(),
  parallelGroup: z.number(),
  inputs: z.record(z.any()).optional(),
  dependencies: z.array(z.string()),
  rationale: z.string().optional(), // Why this agent is needed
});

export type AgentWorkflowStep = z.infer<typeof AgentWorkflowStepSchema>;

// ============================================================================
// Plan Result - supports both subtasks and agent workflow
// ============================================================================

export const PlanResultSchema = z.object({
  schemaVersion: z.literal('1.0'),
  goal: z.string(),

  // Planning mode: what type of plan is this?
  planType: z.enum(['subtasks', 'agent-workflow', 'hybrid']).default('subtasks'),

  // Traditional code implementation subtasks
  subtasks: z.array(SubtaskSchema).optional(),

  // Agent workflow for dynamic agent orchestration
  agentWorkflow: z.array(AgentWorkflowStepSchema).optional(),

  // Reasoning about the plan
  reasoning: z.string().optional(),

  estimatedIterations: z.number().optional(),
  trace: z.array(TraceEventSchema).optional(),
});

export type PlanResult = z.infer<typeof PlanResultSchema>;
