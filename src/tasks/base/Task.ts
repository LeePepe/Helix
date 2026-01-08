import { z } from 'zod';
import { ExecutionContext } from '../../runtime/ExecutionContext';
import { ArtifactStore } from '../../runtime/ArtifactStore';
import { ToolRegistry } from '../../runtime/ToolRegistry';
import { StreamHandler } from '../../runtime/StreamHandler';
import { AppError, ErrorCodes } from '../../runtime/errors';

/**
 * Base task interface
 * All tasks must implement this interface
 */
export interface Task<I, O> {
  /**
   * Task name for identification
   */
  readonly name: string;

  /**
   * Task description
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
   * Run the task
   */
  run(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    artifacts: ArtifactStore,
    stream: StreamHandler,
    input: I
  ): Promise<O>;
}

/**
 * Base task implementation with common functionality
 */
export abstract class BaseTask<I, O> implements Task<I, O> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly outputSchema: z.ZodType<O>;
  
  readonly inputSchema?: z.ZodType<I>;

  /**
   * Run the task with validation and tracing
   */
  async run(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    artifacts: ArtifactStore,
    stream: StreamHandler,
    input: I
  ): Promise<O> {
    ctx.trace('task', `${this.name}-start`, { input });
    stream.progress(`Starting ${this.name}...`);

    try {
      // Validate input if schema provided
      if (this.inputSchema) {
        const validationResult = this.inputSchema.safeParse(input);
        if (!validationResult.success) {
          throw new AppError(
            ErrorCodes.TASK_EXECUTION_FAILED,
            `Input validation failed for ${this.name}`,
            false,
            undefined,
            validationResult.error.errors
          );
        }
      }

      // Execute task logic
      const output = await this.execute(ctx, tools, artifacts, stream, input);

      // Validate output
      const outputValidation = this.outputSchema.safeParse(output);
      if (!outputValidation.success) {
        throw new AppError(
          ErrorCodes.TASK_EXECUTION_FAILED,
          `Output validation failed for ${this.name}`,
          false,
          undefined,
          outputValidation.error.errors
        );
      }

      ctx.trace('task', `${this.name}-complete`, { output: outputValidation.data });
      stream.progress(`Completed ${this.name}`);
      
      return outputValidation.data;
    } catch (err) {
      ctx.trace('task', `${this.name}-error`, { error: (err as Error).message });
      stream.update({ type: 'error', content: `${this.name} failed: ${(err as Error).message}` });
      
      if (err instanceof AppError) {
        throw err;
      }
      
      throw new AppError(
        ErrorCodes.TASK_EXECUTION_FAILED,
        `Task ${this.name} failed: ${(err as Error).message}`,
        false,
        err as Error
      );
    }
  }

  /**
   * Execute the task logic
   * Must be implemented by subclasses
   */
  protected abstract execute(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    artifacts: ArtifactStore,
    stream: StreamHandler,
    input: I
  ): Promise<O>;
}
