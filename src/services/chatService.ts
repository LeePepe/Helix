import * as vscode from 'vscode';
import { ConfigService } from './configService';

export class ChatService {
  constructor(private configService: ConfigService) {}

  /**
   * Send a request to the language model, optionally with tool support
   */
  async sendRequest(
    content: string | vscode.LanguageModelChatMessage[],
    options: {
      request: vscode.ChatRequest;
      stream: vscode.ChatResponseStream;
      token: vscode.CancellationToken;
    }
  ): Promise<string> {
    const { request, stream, token } = options;
    const cancelToken = token || new vscode.CancellationTokenSource().token;

    // Normalize messages
    const messages = typeof content === 'string' 
      ? [vscode.LanguageModelChatMessage.User(content)]
      : content;

    // Select model
    const models = await vscode.lm.selectChatModels({
      vendor: 'copilot',
      family: this.configService.getModelFamily()
    });

    if (models.length === 0) {
      throw new Error('No language model available. Please ensure GitHub Copilot Chat is installed and active.');
    }

    return await this.processRequestWithTools(models[0], messages, request, stream, cancelToken);
  }

  private async processRequestWithTools(
    model: vscode.LanguageModelChat,
    messages: vscode.LanguageModelChatMessage[],
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<string> {
    const tools = this.configService.filterTools(vscode.lm.tools);
    const options: vscode.LanguageModelChatRequestOptions = {
      tools: tools.length > 0 ? tools : undefined
    };

    return await this.processLLMResponse(model, messages, options, request, stream, token);
  }

  private async processLLMResponse(
    model: vscode.LanguageModelChat,
    messages: vscode.LanguageModelChatMessage[],
    options: vscode.LanguageModelChatRequestOptions,
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<string> {
    const response = await model.sendRequest(messages, options, token);

    let responseText = '';
    const toolCalls: vscode.LanguageModelToolCallPart[] = [];

    for await (const part of response.stream) {
      if (part instanceof vscode.LanguageModelTextPart) {
        responseText += part.value;
        stream.markdown(part.value);
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        toolCalls.push(part);
      }
    }

    if (toolCalls.length === 0) {
      return responseText;
    }

    const assistantMsg = vscode.LanguageModelChatMessage.Assistant('');
    assistantMsg.content = [
      new vscode.LanguageModelTextPart(responseText),
      ...toolCalls
    ];
    messages.push(assistantMsg);
    console.log(`Executing ${toolCalls.length} tool calls...`);
    console.log('Tool Calls:', toolCalls.map(tc => tc.name).join(', '));
    const toolResults = await this.executeToolCalls(toolCalls, request, stream, token);

    const userMsg = vscode.LanguageModelChatMessage.User('');
    userMsg.content = toolResults;
    messages.push(userMsg);

    return await this.processLLMResponse(model, messages, options, request, stream, token);
  }

  private async executeToolCalls(
    toolCalls: vscode.LanguageModelToolCallPart[],
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResultPart[]> {
    const results: vscode.LanguageModelToolResultPart[] = [];

    for (const toolCall of toolCalls) {
      stream.progress(`Using tool: ${toolCall.name}...`);
      try {
        const result = await vscode.lm.invokeTool(toolCall.name, {
          input: toolCall.input,
          toolInvocationToken: request.toolInvocationToken
        }, token);

        results.push(new vscode.LanguageModelToolResultPart(toolCall.callId, result.content));
      } catch (toolError) {
        const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);
        stream.markdown(`\n⚠️ Tool ${toolCall.name} failed: ${errorMsg}\n`);
        results.push(new vscode.LanguageModelToolResultPart(
          toolCall.callId,
          [new vscode.LanguageModelTextPart(`Error: ${errorMsg}`)]
        ));
      }
    }

    return results;
  }
}
