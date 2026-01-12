import { z } from 'zod';
import { ExecutionContext } from '../../runtime/ExecutionContext';
import { ToolRegistry } from '../../runtime/ToolRegistry';
import { AppError, ErrorCodes } from '../../runtime/errors';
import { StreamHandler } from '../../runtime/StreamHandler';

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
  run(ctx: ExecutionContext, tools: ToolRegistry, input: I, stream?: StreamHandler): Promise<O>;
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
  async run(ctx: ExecutionContext, tools: ToolRegistry, input: I, stream?: StreamHandler): Promise<O> {
    const startTime = Date.now();
    ctx.trace('agent', `${this.name}-start`, { input });

    // Reset token usage before execution
    ctx.resetTokenUsage();

    // Report agent start to stream
    stream?.agentStart(this.name);

    try {
      // Validate input if schema provided
      if (this.inputSchema) {
        stream?.agentProgress(this.name, 'validating', 'Validating input');
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
      stream?.agentProgress(this.name, 'executing', 'Executing agent logic');
      const output = await this.execute(ctx, tools, input, stream);

      console.log(`[Helix] [${this.name}] Agent execution completed`);
      console.log(`[Helix] [${this.name}] Output type:`, typeof output);
      console.log(`[Helix] [${this.name}] Output is null/undefined:`, output === null || output === undefined);
      console.log(`[Helix] [${this.name}] About to validate output with schema`);

      // Validate output
      stream?.agentProgress(this.name, 'validating', 'Validating output');
      const outputValidation = this.outputSchema.safeParse(output);
      console.log(`[Helix] [${this.name}] Validation result - success:`, this.outputSchema, outputValidation.success);
      if (!outputValidation.success) {
        console.error(`[Helix] [${this.name}] Output validation failed`);
        console.error(`[Helix] [${this.name}] Validation errors:`, JSON.stringify(outputValidation.error.errors, null, 2));
        console.error(`[Helix] [${this.name}] Received output keys:`, Object.keys(output || {}));
        console.error(`[Helix] [${this.name}] Received output:`, JSON.stringify(output, null, 2));
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
      const metrics = {
        agentName: this.name,
        startTime,
        endTime,
        durationMs,
        tokenUsage,
        success: true,
      };
      ctx.addAgentMetrics(metrics);

      ctx.trace('agent', `${this.name}-complete`, {
        output: outputValidation.data,
        durationMs,
        tokenUsage,
      });

      // Report completion to stream
      stream?.agentComplete(this.name, metrics);

      return outputValidation.data;
    } catch (err) {
      const endTime = Date.now();
      const durationMs = endTime - startTime;

      // Record failure metrics
      const errorMetrics = {
        agentName: this.name,
        startTime,
        endTime,
        durationMs,
        tokenUsage: ctx.getTokenUsage(),
        success: false,
        error: (err as Error).message,
      };
      ctx.addAgentMetrics(errorMetrics);

      ctx.trace('agent', `${this.name}-error`, {
        error: (err as Error).message,
        durationMs,
      });

      // Report error to stream
      stream?.agentError(this.name, err as Error);

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
  protected abstract execute(ctx: ExecutionContext, tools: ToolRegistry, input: I, stream?: StreamHandler): Promise<O>;
}
