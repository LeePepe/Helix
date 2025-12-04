import * as vscode from 'vscode';
import { DesignSystemService } from '../../services/designSystemService';
import { FigmaService } from '../../services/figmaService';
import { FileService } from '../../services/fileService';
import { PromptService } from '../../services/promptService';
import { ConfigService } from '../../services/configService';
import { ChatService } from '../../services/chatService';

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
    private chatService: ChatService;

    constructor(
        private designSystemService: DesignSystemService,
        private figmaService: FigmaService,
        private promptService: PromptService
    ) {
        this.fileService = new FileService();
        this.configService = new ConfigService();
        this.chatService = new ChatService(this.configService);
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
            const designSystemGuide = await this.designSystemService.loadGuideContent();

            // Load Task Prompt
            stream.progress('Loading task prompt...');
            const taskPrompt = await this.promptService.loadTaskPrompt(config.taskPromptName);

            // Build system prompt with task instructions and design system
            stream.progress(config.progressMessage);
            const systemPrompt = this.buildSystemPrompt(taskPrompt, designSystemGuide);

            // Build initial messages
            const messages: vscode.LanguageModelChatMessage[] = [
                vscode.LanguageModelChatMessage.User(systemPrompt),
                vscode.LanguageModelChatMessage.User(request.prompt)
            ];

            // Use ChatService to handle request with tools
            await this.chatService.sendRequest(messages, { request, stream, token });

        } catch (error) {
            throw new Error(`${config.title} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
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
