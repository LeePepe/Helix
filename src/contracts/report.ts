import { z } from 'zod';
import { TraceEventSchema } from './common';

// ============================================================================
// Report Generation
// ============================================================================

export const ReportMetadataSchema = z.object({
  componentName: z.string(),
  figmaUrl: z.string().optional(),
  codeFilePath: z.string().optional(),
  timestamp: z.string(),
});

export type ReportMetadata = z.infer<typeof ReportMetadataSchema>;

export const ReportResultSchema = z.object({
  schemaVersion: z.literal('1.0'),
  reportPath: z.string(),
  content: z.string(),
  metadata: ReportMetadataSchema,
  trace: z.array(TraceEventSchema).optional(),
});

export type ReportResult = z.infer<typeof ReportResultSchema>;
