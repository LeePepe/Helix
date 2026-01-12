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
   * Send a request expecting JSON response
   */
  async chatJSON<T>(
    ctx: ExecutionContext,
    messages: vscode.LanguageModelChatMessage[],
    schema: { name: string; description: string; schema: any },
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
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
}
