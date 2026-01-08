import { z } from 'zod';
import { ExecutionContext } from '../../runtime/ExecutionContext';
import { ToolRegistry } from '../../runtime/ToolRegistry';
import { AppError, ErrorCodes } from '../../runtime/errors';

/**
 * Base agent interface
 * All agents must implement this interface
 */
export interface Agent<I, O> {
  /**
   * Agent name for identification
   */
  readonly name: string;

  /**
   * Agent description
   */
  readonly description: string;

  /**
   * Input schema for validation
   */
  readonly inputSchema?: z.ZodType<I>;

  /**
   * Output schema for validation
   */
  readonly outputSchema: z.ZodType<O>;

  /**
   * Run the agent
   */
  run(ctx: ExecutionContext, tools: ToolRegistry, input: I): Promise<O>;
}

/**
 * Base agent implementation with common functionality
 */
export abstract class BaseAgent<I, O> implements Agent<I, O> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly outputSchema: z.ZodType<O>;
  
  readonly inputSchema?: z.ZodType<I>;

  /**
   * Run the agent with validation and tracing
   */
  async run(ctx: ExecutionContext, tools: ToolRegistry, input: I): Promise<O> {
    const startTime = Date.now();
    ctx.trace('agent', `${this.name}-start`, { input });

    // Reset token usage before execution
    ctx.resetTokenUsage();

    try {
      // Validate input if schema provided
      if (this.inputSchema) {
        const validationResult = this.inputSchema.safeParse(input);
        if (!validationResult.success) {
          throw new AppError(
            ErrorCodes.AGENT_VALIDATION_FAILED,
            `Input validation failed for ${this.name}`,
            false,
            undefined,
            validationResult.error.errors
          );
        }
      }

      // Execute agent logic
      const output = await this.execute(ctx, tools, input);

      // Validate output
      const outputValidation = this.outputSchema.safeParse(output);
      if (!outputValidation.success) {
        throw new AppError(
          ErrorCodes.AGENT_VALIDATION_FAILED,
          `Output validation failed for ${this.name}`,
          false,
          undefined,
          outputValidation.error.errors
        );
      }

      const endTime = Date.now();
      const durationMs = endTime - startTime;
      const tokenUsage = ctx.getTokenUsage();

      // Record metrics
      ctx.addAgentMetrics({
        agentName: this.name,
        startTime,
        endTime,
        durationMs,
        tokenUsage,
        success: true,
      });

      ctx.trace('agent', `${this.name}-complete`, {
        output: outputValidation.data,
        durationMs,
        tokenUsage,
      });

      return outputValidation.data;
    } catch (err) {
      const endTime = Date.now();
      const durationMs = endTime - startTime;

      // Record failure metrics
      ctx.addAgentMetrics({
        agentName: this.name,
        startTime,
        endTime,
        durationMs,
        tokenUsage: ctx.getTokenUsage(),
        success: false,
        error: (err as Error).message,
      });

      ctx.trace('agent', `${this.name}-error`, {
        error: (err as Error).message,
        durationMs,
      });

      if (err instanceof AppError) {
        throw err;
      }

      throw new AppError(
        ErrorCodes.AGENT_EXECUTION_FAILED,
        `Agent ${this.name} failed: ${(err as Error).message}`,
        false,
        err as Error
      );
    }
  }

  /**
   * Execute the agent logic
   * Must be implemented by subclasses
   */
  protected abstract execute(ctx: ExecutionContext, tools: ToolRegistry, input: I): Promise<O>;
}
