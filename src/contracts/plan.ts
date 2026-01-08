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

export const PlanResultSchema = z.object({
  schemaVersion: z.literal('1.0'),
  goal: z.string(),
  subtasks: z.array(SubtaskSchema),
  estimatedIterations: z.number().optional(),
  trace: z.array(TraceEventSchema).optional(),
});

export type PlanResult = z.infer<typeof PlanResultSchema>;
