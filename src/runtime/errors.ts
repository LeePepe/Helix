/**
 * Application error with structured error information
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly recoverable: boolean = false,
    public readonly cause?: Error,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      details: this.details,
      cause: this.cause?.message,
    };
  }
}

/**
 * Common error codes
 */
export const ErrorCodes = {
  // Tool errors
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',
  TOOL_VALIDATION_FAILED: 'TOOL_VALIDATION_FAILED',
  
  // Service errors
  LLM_REQUEST_FAILED: 'LLM_REQUEST_FAILED',
  LLM_VALIDATION_FAILED: 'LLM_VALIDATION_FAILED',
  FIGMA_MCP_NOT_AVAILABLE: 'FIGMA_MCP_NOT_AVAILABLE',
  FIGMA_REQUEST_FAILED: 'FIGMA_REQUEST_FAILED',
  WORKSPACE_READ_FAILED: 'WORKSPACE_READ_FAILED',
  WORKSPACE_WRITE_FAILED: 'WORKSPACE_WRITE_FAILED',
  
  // Runtime errors
  EXECUTION_CANCELLED: 'EXECUTION_CANCELLED',
  ARTIFACT_NOT_FOUND: 'ARTIFACT_NOT_FOUND',
  ARTIFACT_SAVE_FAILED: 'ARTIFACT_SAVE_FAILED',
  
  // Agent errors
  AGENT_VALIDATION_FAILED: 'AGENT_VALIDATION_FAILED',
  AGENT_EXECUTION_FAILED: 'AGENT_EXECUTION_FAILED',
  
  // Task errors
  TASK_EXECUTION_FAILED: 'TASK_EXECUTION_FAILED',
  TASK_DEPENDENCY_FAILED: 'TASK_DEPENDENCY_FAILED',
} as const;
