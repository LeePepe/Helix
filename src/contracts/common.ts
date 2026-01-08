import { z } from 'zod';

// ============================================================================
// Common Types
// ============================================================================

export const FigmaRefSchema = z.object({
  fileKey: z.string().optional(),
  nodeId: z.string(),
  nodeName: z.string().optional(),
  url: z.string().optional(),
});

export type FigmaRef = z.infer<typeof FigmaRefSchema>;

export const IssueSchema = z.object({
  id: z.string(),
  level: z.enum(['info', 'warning', 'error']),
  message: z.string(),
  details: z.string().optional(),
});

export type Issue = z.infer<typeof IssueSchema>;

export const TraceEventSchema = z.object({
  ts: z.string(), // ISO timestamp
  source: z.enum(['task', 'agent', 'service']),
  name: z.string(),
  data: z.any().optional(), // Must be JSON-safe
});

export type TraceEvent = z.infer<typeof TraceEventSchema>;

export const TokenUsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const AgentMetricsSchema = z.object({
  agentName: z.string(),
  startTime: z.number(), // timestamp in ms
  endTime: z.number(), // timestamp in ms
  durationMs: z.number(),
  tokenUsage: TokenUsageSchema.optional(),
  success: z.boolean(),
  error: z.string().optional(),
});

export type AgentMetrics = z.infer<typeof AgentMetricsSchema>;

export const ToolCallSchema = z.object({
  toolId: z.string(),
  args: z.record(z.any()),
  timestamp: z.string(),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ToolResultSchema = z.object({
  ok: z.boolean(),
  data: z.any().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }).optional(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

export const DiscoveredCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  conditions: z.array(z.string()), // human-readable conditions
  figmaRefs: z.array(FigmaRefSchema),
  optional: z.boolean(),
  tags: z.array(z.string()).optional(),
});

export type DiscoveredCase = z.infer<typeof DiscoveredCaseSchema>;

export const UIPartSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    role: z.string(), // human-readable e.g. "DialogHeader", "PrimaryButtonRow"
    figmaRefs: z.array(FigmaRefSchema),
    layoutNotes: z.string().optional(),
    children: z.array(UIPartSchema).optional(),
    variants: z.array(DiscoveredCaseSchema).optional(),
  })
);

export type UIPart = {
  id: string;
  name: string;
  role: string;
  figmaRefs: FigmaRef[];
  layoutNotes?: string;
  children?: UIPart[];
  variants?: DiscoveredCase[];
};
