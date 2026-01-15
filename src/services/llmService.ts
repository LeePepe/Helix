import * as vscode from 'vscode';
import { ToolResult } from '../contracts';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { AppError, ErrorCodes } from '../runtime/errors';

/**
 * LLM service for chat/JSON mode with streaming, retries, and token accounting
 */
export class LLMService {
  /**
   * Send a chat request and get a response
   */
  async chat(
    ctx: ExecutionContext,
    messages: vscode.LanguageModelChatMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    }
  ): Promise<ToolResult> {
    try {
      ctx.trace('service', 'llm-chat-start', { 
        messageCount: messages.length,
        model: options?.model || ctx.settings.model 
      });

      // Get model
      const modelId = options?.model || ctx.settings.model;
      const models = await vscode.lm.selectChatModels({ family: modelId });
      
      if (models.length === 0) {
        return {
          ok: false,
          error: {
            code: ErrorCodes.LLM_REQUEST_FAILED,
            message: `No language model found for family: ${modelId}`,
          },
        };
      }

      const model = models[0];

      // Send request
      const requestOptions: vscode.LanguageModelChatRequestOptions = {
        justification: 'Helix agent needs LLM for code generation',
      };

      const response = await model.sendRequest(messages, requestOptions, ctx.cancellationToken);

      // Collect response
      let content = '';
      for await (const chunk of response.text) {
        content += chunk;
        ctx.throwIfCancelled();
      }

      // Estimate token usage (rough approximation: ~4 chars per token)
      const estimatedPromptTokens = Math.ceil(
        messages.reduce((sum, msg) => {
          const msgContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          return sum + msgContent.length;
        }, 0) / 4
      );
      const estimatedCompletionTokens = Math.ceil(content.length / 4);
      const tokenUsage = {
        promptTokens: estimatedPromptTokens,
        completionTokens: estimatedCompletionTokens,
        totalTokens: estimatedPromptTokens + estimatedCompletionTokens,
      };
      ctx.setTokenUsage(tokenUsage);

      ctx.trace('service', 'llm-chat-complete', {
        responseLength: content.length,
        tokenUsage,
      });

      return {
        ok: true,
        data: { content },
      };
    } catch (err) {
      ctx.trace('service', 'llm-chat-error', { error: (err as Error).message });
      
      return {
        ok: false,
        error: {
          code: ErrorCodes.LLM_REQUEST_FAILED,
          message: `LLM request failed: ${(err as Error).message}`,
          details: err instanceof AppError ? err.toJSON() : undefined,
        },
      };
    }
  }

  /**
   * Send a request expecting JSON response with optional tool calling support
   */
  async chatJSON<T>(
    ctx: ExecutionContext,
    messages: vscode.LanguageModelChatMessage[],
    schema: { name: string; description: string; schema: any },
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      enableTools?: boolean; // Enable tool calling
    }
  ): Promise<ToolResult> {
    try {
      ctx.trace('service', 'llm-chat-json-start', { 
        messageCount: messages.length,
        schema: schema.name,
        model: options?.model || ctx.settings.model 
      });

      // Add JSON instruction to the last message
      const lastMessage = messages[messages.length - 1];
      const lastMessageContent = typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);
      const jsonPrompt = `${lastMessageContent}\n\nRespond with valid JSON matching this schema: ${JSON.stringify(schema.schema, null, 2)}`;

      console.log('[Helix] [LLMService] JSON request - Schema:', schema.name);
      console.log('[Helix] [LLMService] JSON request - Original messages count:', messages.length);
      console.log('[Helix] [LLMService] JSON request - Last message preview:', lastMessageContent.substring(0, 200));

      const modifiedMessages = [
        ...messages.slice(0, -1),
        vscode.LanguageModelChatMessage.User(jsonPrompt),
      ];

      // Get response
      const chatResult = await this.chat(ctx, modifiedMessages, options);
      
      if (!chatResult.ok) {
        return chatResult;
      }

      // Parse JSON
      try {
        const content = chatResult.data.content;

        console.log('[Helix] [LLMService] Raw LLM response length:', content.length);
        console.log('[Helix] [LLMService] Raw LLM response (first 500 chars):', content);

        // Extract JSON from markdown code blocks if present
        let jsonText = content;
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          console.log('[Helix] [LLMService] Found JSON in markdown code block');
          jsonText = jsonMatch[1].trim();
        } else {
          console.log('[Helix] [LLMService] No markdown code block found, attempting to parse raw content');
        }
        
        const parsed = JSON.parse(jsonText) as T;

        ctx.trace('service', 'llm-chat-json-complete', {
          schema: schema.name
        });

        console.log('[Helix] [LLMService] Successfully parsed JSON response');

        return {
          ok: true,
          data: parsed,
        };
      } catch (parseErr) {
        const content = chatResult.data.content;
        const errorMessage = (parseErr as Error).message;

        console.error('[Helix] [LLMService] JSON Parse Error:', errorMessage);
        console.error('[Helix] [LLMService] Full raw response:', content);
        console.error('[Helix] [LLMService] Expected schema:', JSON.stringify(schema, null, 2));

        ctx.trace('service', 'llm-chat-json-parse-error', {
          error: errorMessage,
          responsePreview: content.substring(0, 200),
          schemaName: schema.name
        });

        return {
          ok: false,
          error: {
            code: ErrorCodes.LLM_VALIDATION_FAILED,
            message: `Failed to parse JSON response: ${errorMessage}`,
            details: {
              rawContent: content,
              contentPreview: content.substring(0, 200),
              expectedSchema: schema.name
            },
          },
        };
      }
    } catch (err) {
      ctx.trace('service', 'llm-chat-json-error', { error: (err as Error).message });
      
      return {
        ok: false,
        error: {
          code: ErrorCodes.LLM_REQUEST_FAILED,
          message: `LLM JSON request failed: ${(err as Error).message}`,
          details: err instanceof AppError ? err.toJSON() : undefined,
        },
      };
    }
  }

  /**
   * Send a request with tool calling support (no JSON mode)
   * Allows LLM to invoke tools directly for file operations
   */
  async chatWithTools(
    ctx: ExecutionContext,
    messages: vscode.LanguageModelChatMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      toolInvocationToken?: vscode.ChatParticipantToolToken;
    }
  ): Promise<ToolResult> {
    try {
      console.log('[LLMService] chatWithTools called');
      console.log('[LLMService] options:', options);
      console.log('[LLMService] toolInvocationToken present:', !!options?.toolInvocationToken);
      console.log('[LLMService] toolInvocationToken value:', options?.toolInvocationToken);

      ctx.trace('service', 'llm-chat-with-tools-start', {
        messageCount: messages.length,
        model: options?.model || ctx.settings.model
      });

      // Get model
      const modelId = options?.model || ctx.settings.model;
      const models = await vscode.lm.selectChatModels({ family: modelId });

      if (models.length === 0) {
        return {
          ok: false,
          error: {
            code: ErrorCodes.LLM_REQUEST_FAILED,
            message: `No language model found for family: ${modelId}`,
          },
        };
      }

      const model = models[0];

      // Get available tools and filter to only file-related tools
      const allTools = vscode.lm.tools;
      console.log('[LLMService] Total available tools:', allTools.length);

      // Filter to only essential file operation tools
      // Note: copilot_createFile is excluded due to "Invalid stream" bug in Copilot Chat extension
      const allowedToolNames = [
        'copilot_readFile',
        'copilot_applyPatch',  // Preferred for creating/editing files
        'copilot_insertEdit',
        // 'copilot_createFile',  // Disabled: causes "Invalid stream" error
        'copilot_editFiles',
        'copilot_replaceString',
        'copilot_multiReplaceString',
        'copilot_findFiles',
        'copilot_findTextInFiles',
        'copilot_listDirectory',
        'copilot_searchCodebase',
        'copilot_searchWorkspaceSymbols',
        'copilot_getChangedFiles',
      ];

      const filteredTools = Array.from(allTools).filter(tool =>
        allowedToolNames.includes(tool.name)
      );

      console.log('[LLMService] Filtered to essential tools:', filteredTools.map(t => t.name).join(', '));

      // Send request with filtered tools
      const requestOptions: vscode.LanguageModelChatRequestOptions = {
        justification: 'Helix agent needs LLM with tool access for code generation',
        tools: filteredTools.length > 0 ? filteredTools : undefined,
      };

      const response = await model.sendRequest(messages, requestOptions, ctx.cancellationToken);

      // Process response with tool calls
      const result = await this.processToolCalls(ctx, messages, model, response, requestOptions, options);

      ctx.trace('service', 'llm-chat-with-tools-complete', {
        responseLength: result.data?.content?.length || 0,
      });

      return result;
    } catch (err) {
      ctx.trace('service', 'llm-chat-with-tools-error', { error: (err as Error).message });

      return {
        ok: false,
        error: {
          code: ErrorCodes.LLM_REQUEST_FAILED,
          message: `LLM request with tools failed: ${(err as Error).message}`,
          details: err instanceof AppError ? err.toJSON() : undefined,
        },
      };
    }
  }

  /**
   * Process tool calls in LLM response
   */
  private async processToolCalls(
    ctx: ExecutionContext,
    messages: vscode.LanguageModelChatMessage[],
    model: vscode.LanguageModelChat,
    response: vscode.LanguageModelChatResponse,
    requestOptions: vscode.LanguageModelChatRequestOptions,
    options?: { toolInvocationToken?: vscode.ChatParticipantToolToken }
  ): Promise<ToolResult> {
    let responseText = '';
    const toolCalls: vscode.LanguageModelToolCallPart[] = [];

    // Collect text and tool calls
    for await (const part of response.stream) {
      if (part instanceof vscode.LanguageModelTextPart) {
        responseText += part.value;
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        toolCalls.push(part);
      }
      ctx.throwIfCancelled();
    }

    // Log LLM output
    console.log('[LLMService] LLM response text:', responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));
    console.log('[LLMService] LLM tool calls count:', toolCalls.length);
    if (toolCalls.length > 0) {
      console.log('[LLMService] LLM tool calls:', toolCalls.map(tc => ({ name: tc.name, callId: tc.callId, input: tc.input })));
    }

    // If no tool calls, return the text response
    if (toolCalls.length === 0) {
      console.log('[LLMService] No tool calls, returning text response');
      return {
        ok: true,
        data: { content: responseText },
      };
    }

    // Execute tool calls
    console.log(`[LLMService] Executing ${toolCalls.length} tool calls:`, toolCalls.map(tc => tc.name).join(', '));

    // Add assistant message with tool calls
    const contentParts: (vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart)[] = [];
    if (responseText) {
      contentParts.push(new vscode.LanguageModelTextPart(responseText));
    }
    contentParts.push(...toolCalls);
    messages.push(vscode.LanguageModelChatMessage.Assistant(contentParts));

    // Execute tools and collect results
    const toolResults = await this.executeTools(ctx, toolCalls, options?.toolInvocationToken);

    // Add tool results as user message
    const userMsg = vscode.LanguageModelChatMessage.User('');
    userMsg.content = toolResults;
    messages.push(userMsg);

    // Continue the conversation with tool results
    const followUpResponse = await model.sendRequest(messages, requestOptions, ctx.cancellationToken);
    return await this.processToolCalls(ctx, messages, model, followUpResponse, requestOptions, options);
  }

  /**
   * Execute tool calls
   */
  private async executeTools(
    ctx: ExecutionContext,
    toolCalls: vscode.LanguageModelToolCallPart[],
    toolInvocationToken?: vscode.ChatParticipantToolToken
  ): Promise<vscode.LanguageModelToolResultPart[]> {
    const results: vscode.LanguageModelToolResultPart[] = [];

    for (const toolCall of toolCalls) {
      try {
        console.log(`[LLMService] Invoking tool: ${toolCall.name}`);
        console.log(`[LLMService] Tool input (full):`, JSON.stringify(toolCall.input, null, 2));
        console.log(`[LLMService] toolInvocationToken present:`, !!toolInvocationToken);
        console.log(`[LLMService] toolInvocationToken value:`, toolInvocationToken);

        const result = await vscode.lm.invokeTool(
          toolCall.name,
          {
            input: toolCall.input,
            toolInvocationToken,
          },
          ctx.cancellationToken
        );

        results.push(new vscode.LanguageModelToolResultPart(toolCall.callId, result.content));
        console.log(`[LLMService] Tool ${toolCall.name} executed successfully`);
      } catch (toolError) {
        const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);
        console.error(`[LLMService] Tool ${toolCall.name} failed:`, errorMsg);
        console.error(`[LLMService] Tool error details:`, toolError);
        results.push(
          new vscode.LanguageModelToolResultPart(
            toolCall.callId,
            [new vscode.LanguageModelTextPart(`Error: ${errorMsg}`)]
          )
        );
      }
    }

    return results;
  }
}
