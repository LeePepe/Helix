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

            // Get Context
            stream.progress('Analyzing context...');
            const contextData = await this.getContextFromRequest(request);

            // Build system prompt with task instructions and design system
            stream.progress(config.progressMessage);
            const systemPrompt = this.buildSystemPrompt(taskPrompt, designSystemGuide);

            // Build initial messages
            // Merge system prompt, context, and user prompt to avoid sending multiple User messages
            // which can cause 400 Bad Request errors with some providers
            let fullPrompt = systemPrompt;

            if (contextData) {
                fullPrompt += `\n\n# Context\n${contextData}`;
            }

            if (request.prompt) {
                fullPrompt += `\n\nUser Request:\n${request.prompt}`;
            }

            const messages: vscode.LanguageModelChatMessage[] = [
                vscode.LanguageModelChatMessage.User(fullPrompt)
            ];

            // Use ChatService to handle request with tools
            await this.chatService.sendRequest(messages, { request, stream, token });

        } catch (error) {
            throw new Error(`${config.title} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Extract context from request references or active editor
     */
    private async getContextFromRequest(request: vscode.ChatRequest): Promise<string> {
        let contextMsg = '';
        
        // 1. Check explicit references (user attached files)
        if (request.references && request.references.length > 0) {
            for (const ref of request.references) {
                if (ref.value instanceof vscode.Uri) {
                    const uri = ref.value as vscode.Uri;
                    try {
                        // Try to find if document is open to get unsaved changes
                        const openDoc = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
                        let content = '';
                        if (openDoc) {
                            content = openDoc.getText();
                        } else {
                            content = await this.fileService.readFile(uri.fsPath);
                        }
                        contextMsg += `\n\nFile: ${uri.fsPath}\n\`\`\`\n${content}\n\`\`\``;
                    } catch (e) {
                        console.warn(`Failed to read reference file ${uri.fsPath}`, e);
                    }
                }
            }
        }
        
        // 2. If no explicit references, check active editor
        if (!contextMsg) {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const content = activeEditor.document.getText();
                contextMsg += `\n\nActive File: ${activeEditor.document.uri.fsPath}\n\`\`\`\n${content}\n\`\`\``;
            }
        }
        
        return contextMsg;
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
