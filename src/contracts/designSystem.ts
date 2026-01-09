import { z } from 'zod';
import { IssueSchema, TraceEventSchema } from './common';

// ============================================================================
// Design System Analysis Result
// ============================================================================

export const DesignTokenSchema = z.record(z.any());

export const DesignDomainSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  tokens: DesignTokenSchema,
});

export const DesignSystemAnalysisResultSchema = z.object({
  schemaVersion: z.literal('1.0'),
  domains: z.array(DesignDomainSchema),
  componentPatterns: z.array(z.string()).optional(),
  // Categorized domains produced by LLM categorization: { categoryName: DesignDomain[] }
  categorizedDomains: z.record(z.array(DesignDomainSchema)).optional(),
  // Categorized component patterns produced by LLM categorization: { categoryName: string[] }
  categorizedComponentPatterns: z.record(z.array(z.string())).optional(),
  issues: z.array(IssueSchema).optional(),
  designSystemPath: z.string().optional(),
  frameworkInfo: z.object({
    name: z.string().optional(),
    version: z.string().optional(),
    ui: z.string().optional(),
  }).optional(),
  trace: z.array(TraceEventSchema).optional(),
});

export type DesignToken = z.infer<typeof DesignTokenSchema>;
export type DesignDomain = z.infer<typeof DesignDomainSchema>;
export type DesignSystemAnalysisResult = z.infer<typeof DesignSystemAnalysisResultSchema>;

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
