import { z } from 'zod';
import { UIPartSchema, DiscoveredCaseSchema, IssueSchema, TraceEventSchema } from './common';

// ============================================================================
// Figma Analysis Result
// ============================================================================

export const FigmaAnalysisResultSchema = z.object({
  schemaVersion: z.literal('1.0'),
  root: UIPartSchema,
  cases: z.array(DiscoveredCaseSchema).optional(), // cross-cutting scenarios (optional)
  tokensHint: z.object({
    typography: z.array(z.string()).optional(),
    colors: z.array(z.string()).optional(),
    spacing: z.array(z.string()).optional(),
    radius: z.array(z.string()).optional(),
    shadows: z.array(z.string()).optional(),
  }).optional(),
  risks: z.array(IssueSchema).optional(), // risks (optional)
  trace: z.array(TraceEventSchema).optional(),
});

export type FigmaAnalysisResult = z.infer<typeof FigmaAnalysisResultSchema>;
