import { z } from 'zod';
import { UIPartSchema, TraceEventSchema } from './common';

// ============================================================================
// Figma Analysis Result
// ============================================================================

export const FigmaAnalysisResultSchema = z.object({
  schemaVersion: z.literal('1.0'),
  root: UIPartSchema,
  metadata: z.string().optional(), // Raw Figma metadata (XML format)
  designContext: z.string().optional(), // Full Figma design context data
  trace: z.array(TraceEventSchema).optional(),
});

export type FigmaAnalysisResult = z.infer<typeof FigmaAnalysisResultSchema>;
