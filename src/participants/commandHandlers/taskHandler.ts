import * as vscode from 'vscode';
import * as chatUtils from '@vscode/chat-extension-utils';
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
 * Uses @vscode/chat-extension-utils for tool calling loop and response streaming
 */
export class TaskHandler {
    private fileService: FileService;
    private configService: ConfigService;
    private extensionMode: vscode.ExtensionMode;

    constructor(
        private designSystemService: DesignSystemService,
        private figmaService: FigmaService,
        private promptService: PromptService,
        extensionMode?: vscode.ExtensionMode
    ) {
        this.fileService = new FileService();
        this.configService = new ConfigService();
        this.extensionMode = extensionMode ?? vscode.ExtensionMode.Production;
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
    ): Promise<vscode.ChatResult> {
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

            // Use chat-extension-utils for tool calling and response streaming
            const tools = this.configService.filterTools(vscode.lm.tools);
            console.log('Using tools:', tools.map(t => t.name));
            const libResult = chatUtils.sendChatParticipantRequest(
                request,
                context,
                {
                    prompt: systemPrompt,
                    responseStreamOptions: {
                        stream,
                        references: true,
                        responseText: true
                    },
                    tools: tools.length > 0 ? tools : undefined,
                    extensionMode: this.extensionMode
                },
                token
            );

            return await libResult.result;

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
