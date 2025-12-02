import * as vscode from 'vscode';
import { DesignSystemService } from '../../services/designSystemService';
import { FigmaService } from '../../services/figmaService';
import { FileService } from '../../services/fileService';
import { PromptService } from '../../services/promptService';
import { ConfigService } from '../../services/configService';

/**
 * Supported task types for the TaskHandler
 */
export type TaskType = 'fit-finish' | 'gen-code';

/**
 * Task configuration for different task types
 */
interface TaskConfig {
    title: string;
    progressMessage: string;
    taskPromptName: TaskType;
}

const TASK_CONFIGS: Record<TaskType, TaskConfig> = {
    'fit-finish': {
        title: 'Fit & Finish Analysis',
        progressMessage: 'Analyzing design compliance...',
        taskPromptName: 'fit-finish'
    },
    'gen-code': {
        title: 'Generate Code from Figma',
        progressMessage: 'Generating production-ready code...',
        taskPromptName: 'gen-code'
    }
};

/**
 * Unified TaskHandler with consistent task flow:
 * 1. Display title
 * 2. Load design system guide
 * 3. Load task-specific prompt
 * 4. Execute LLM request with tools
 */
export class TaskHandler {
    private fileService: FileService;
    private configService: ConfigService;

    constructor(
        private designSystemService: DesignSystemService,
        private figmaService: FigmaService,
        private promptService: PromptService
    ) {
        this.fileService = new FileService();
        this.configService = new ConfigService();
    }

    /**
     * Main entry point - unified task flow
     */
    async handle(
        taskType: TaskType,
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<void> {
        const config = TASK_CONFIGS[taskType];
        if (!config) {
            throw new Error(`Unknown task type: ${taskType}`);
        }

        try {
            // Display task header
            stream.markdown(`\n## ${config.title}\n\n`);

            // Load Design System Guide
            stream.progress('Loading design system guide...');
            const designSystemGuide = this.designSystemService.getGuideContent();

            // Load Task Prompt
            stream.progress('Loading task prompt...');
            const taskPrompt = await this.promptService.loadTaskPrompt(config.taskPromptName);

            // Build system prompt with task instructions and design system
            stream.progress(config.progressMessage);
            const systemPrompt = this.buildSystemPrompt(taskPrompt, designSystemGuide);

            // Execute LLM request with tool support
            await this.sendLLMRequest(systemPrompt, request, stream, token);

        } catch (error) {
            throw new Error(`${config.title} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // ============================================
    // LLM Request with Tools
    // ============================================

    /**
     * Send request to LLM with tool support (entry point)
     */
    private async sendLLMRequest(
        systemPrompt: string,
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<void> {
        // Build initial messages
        const messages: vscode.LanguageModelChatMessage[] = [
            vscode.LanguageModelChatMessage.User(systemPrompt),
            vscode.LanguageModelChatMessage.User(request.prompt)
        ];

        // Get filtered tools
        const tools = this.configService.filterTools(vscode.lm.tools);
        console.log('Using tools:', tools.map(t => t.name));
        console.log('lm tools:', vscode.lm.tools.map(t => t.name));

        // Prepare request options with tools
        const options: vscode.LanguageModelChatRequestOptions = {
            tools: tools.length > 0 ? tools : undefined
        };
        

        // Start recursive tool calling
        await this.processLLMResponse(messages, options, request, stream, token);
    }

    /**
     * Process LLM response recursively
     * If tool calls are present, execute them and recurse with results
     */
    private async processLLMResponse(
        messages: vscode.LanguageModelChatMessage[],
        options: vscode.LanguageModelChatRequestOptions,
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<void> {
        // Send request to LLM
        const response = await request.model.sendRequest(messages, options, token);

        // Collect response text and tool calls
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

        // Base case: no tool calls, we're done
        if (toolCalls.length === 0) {
            return;
        }

        // Add assistant message with tool calls to history
        const assistantMsg = vscode.LanguageModelChatMessage.Assistant('');
        assistantMsg.content = [
            new vscode.LanguageModelTextPart(responseText),
            ...toolCalls
        ];
        messages.push(assistantMsg);

        // Execute tools and collect results
        const toolResults = await this.executeToolCalls(toolCalls, request, stream, token);

        // Add tool results to messages
        const userMsg = vscode.LanguageModelChatMessage.User('');
        userMsg.content = toolResults;
        messages.push(userMsg);

        // Recurse: send results back to LLM
        await this.processLLMResponse(messages, options, request, stream, token);
    }

    /**
     * Execute tool calls and return results
     */
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

    // ============================================
    // Shared Utilities
    // ============================================

    /**
     * Build system prompt with task instructions and design system guide
     */
    private buildSystemPrompt(
        taskPrompt: string,
        designSystemGuide: string
    ): string {
        return `# Task Instructions

${taskPrompt}

# Design System Guide

${designSystemGuide}`;
    }
}
