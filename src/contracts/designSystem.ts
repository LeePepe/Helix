import { z } from 'zod';
import { IssueSchema, TraceEventSchema } from './common';

// ============================================================================
// Design System Mapping Result
// ============================================================================

export const ComponentMappingSchema = z.object({
  uiPartId: z.string(),
  suggestedComponent: z.string(),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
});

export type ComponentMapping = z.infer<typeof ComponentMappingSchema>;

export const TokenMappingSchema = z.object({
  tokenType: z.enum(['color', 'typography', 'spacing', 'radius', 'shadow']),
  figmaToken: z.string(),
  dsToken: z.string(),
  confidence: z.number().min(0).max(1),
});

export type TokenMapping = z.infer<typeof TokenMappingSchema>;

export const DesignSystemMappingResultSchema = z.object({
  schemaVersion: z.literal('1.0'),
  componentMappings: z.array(ComponentMappingSchema),
  tokenMappings: z.array(TokenMappingSchema),
  gaps: z.array(IssueSchema),
  trace: z.array(TraceEventSchema).optional(),
});

export type DesignSystemMappingResult = z.infer<typeof DesignSystemMappingResultSchema>;
