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

export const TokensHintSchema = z.object({
  typography: z.array(z.string()).optional(),
  colors: z.array(z.string()).optional(),
  spacing: z.array(z.string()).optional(),
  radius: z.array(z.string()).optional(),
  shadows: z.array(z.string()).optional(),
}).optional();

export type TokensHint = z.infer<typeof TokensHintSchema>;

export const UIPartSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    role: z.string(), // human-readable e.g. "DialogHeader", "PrimaryButtonRow"
    figmaRefs: z.array(FigmaRefSchema),
    metadata: z.string().optional().describe('XML structure data for this component'),
    designContext: z.string().optional().describe('Full design context data for this component'),
    layoutNotes: z.string().optional(),
    tokensHint: TokensHintSchema, // Design tokens specific to this component
    variants: z.array(DiscoveredCaseSchema).optional(),
  })
);

export type UIPart = {
  id: string;
  name: string;
  role: string;
  figmaRefs: FigmaRef[];
  metadata?: string;
  designContext?: string;
  layoutNotes?: string;
  tokensHint?: TokensHint;
  variants?: DiscoveredCase[];
};

// Reference to an external chat prompt or user-provided guidance
export const ChatPromptReferenceSchema = z.object({
  id: z.string().optional().describe('Optional identifier for the reference'),
  title: z.string().optional().describe('Human-friendly title for the reference'),
  description: z.string().optional().describe('Short description or notes about the reference'),
  url: z.string().url().optional().describe('Optional URL pointing to the reference'),
  content: z.string().optional().describe('Optional raw prompt content or excerpt'),
});

export type ChatPromptReference = z.infer<typeof ChatPromptReferenceSchema>;
