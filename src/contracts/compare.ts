import { z } from 'zod';
import { FigmaRefSchema, TraceEventSchema } from './common';

// ============================================================================
// Compare Result
// ============================================================================

export const DiffSchema = z.object({
  category: z.string(),
  description: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  figmaRefs: z.array(FigmaRefSchema).optional(),
  filePaths: z.array(z.string()).optional(),
});

export type Diff = z.infer<typeof DiffSchema>;

export const NextActionSchema = z.object({
  title: z.string(),
  description: z.string(),
  suggestedSubtasks: z.array(z.string()).optional(),
});

export type NextAction = z.infer<typeof NextActionSchema>;

export const CompareResultSchema = z.object({
  schemaVersion: z.literal('1.0'),
  diffs: z.array(DiffSchema),
  nextActions: z.array(NextActionSchema),
  trace: z.array(TraceEventSchema).optional(),
});

export type CompareResult = z.infer<typeof CompareResultSchema>;
