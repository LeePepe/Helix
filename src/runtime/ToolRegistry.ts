import { ToolResult } from '../contracts';
import { AppError, ErrorCodes } from './errors';
import { ExecutionContext } from './ExecutionContext';

/**
 * Tool definition
 */
export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  execute: (ctx: ExecutionContext, args: Record<string, any>) => Promise<ToolResult>;
}

/**
 * Unified tool invocation interface
 * Provides consistent error handling and tracing for all tools
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Register a tool
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.id)) {
      throw new AppError(
        ErrorCodes.TOOL_VALIDATION_FAILED,
        `Tool already registered: ${tool.id}`,
        false
      );
    }
    this.tools.set(tool.id, tool);
  }

  /**
   * Register multiple tools
   */
  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Check if a tool is registered
   */
  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  /**
   * Get a tool definition
   */
  get(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  /**
   * List all registered tools
   */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Invoke a tool by id with consistent error handling
   */
  async invoke(
    ctx: ExecutionContext,
    toolId: string,
    args: Record<string, any>
  ): Promise<ToolResult> {
    // Check cancellation
    ctx.throwIfCancelled();

    // Find tool
    const tool = this.tools.get(toolId);
    if (!tool) {
      const result: ToolResult = {
        ok: false,
        error: {
          code: ErrorCodes.TOOL_NOT_FOUND,
          message: `Tool not found: ${toolId}`,
        },
      };
      ctx.trace('service', 'tool-error', { toolId, error: result.error });
      return result;
    }

    // Trace invocation
    ctx.trace('service', 'tool-invoke', { toolId, tool: tool.name, args });

    try {
      // Execute tool
      const result = await tool.execute(ctx, args);
      
      // Trace result
      ctx.trace('service', 'tool-result', { 
        toolId, 
        ok: result.ok,
        error: result.error 
      });

      return result;
    } catch (err) {
      // Wrap error in ToolResult
      const error = err as Error;
      const result: ToolResult = {
        ok: false,
        error: {
          code: ErrorCodes.TOOL_EXECUTION_FAILED,
          message: error.message,
          details: error instanceof AppError ? error.toJSON() : undefined,
        },
      };

      ctx.trace('service', 'tool-error', { toolId, error: result.error });
      return result;
    }
  }

  /**
   * Invoke multiple tools in sequence
   */
  async invokeMany(
    ctx: ExecutionContext,
    calls: Array<{ toolId: string; args: Record<string, any> }>
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const call of calls) {
      const result = await this.invoke(ctx, call.toolId, call.args);
      results.push(result);
      
      // Stop on first error if not recoverable
      if (!result.ok && result.error?.code !== ErrorCodes.TOOL_VALIDATION_FAILED) {
        break;
      }
    }
    return results;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
  }
}
