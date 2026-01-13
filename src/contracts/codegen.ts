import { z } from 'zod';
import { IssueSchema, TraceEventSchema } from './common';

// ============================================================================
// Codegen Result
// ============================================================================

export const FileChangeSchema = z.object({
  path: z.string(),
  action: z.enum(['create', 'modify', 'delete']),
  diff: z.string().optional(),
  content: z.string().optional(),
});

export type FileChange = z.infer<typeof FileChangeSchema>;

// Iteration tracking for FIX mode
export const FixRoundResultSchema = z.object({
  roundNumber: z.number(),
  tasksAttempted: z.number(),
  tasksSucceeded: z.number(),
  tasksFailed: z.number(),
  filesModified: z.array(z.string()),
  summary: z.string(),
});

export type FixRoundResult = z.infer<typeof FixRoundResultSchema>;

export const CodegenResultSchema = z.object({
  schemaVersion: z.literal('1.0'),
  summary: z.string(),
  files: z.array(FileChangeSchema),
  commands: z.array(z.string()).optional(),
  issues: z.array(IssueSchema).optional(),
  iterations: z.array(FixRoundResultSchema).optional(),
  trace: z.array(TraceEventSchema).optional(),
});

export type CodegenResult = z.infer<typeof CodegenResultSchema>;
