import { ExecutionContext } from '../runtime/ExecutionContext';
import { ToolRegistry } from '../runtime/ToolRegistry';
import { LLMService } from '../services/llmService';
import { FigmaService } from '../services/figmaService';
import { FileService } from '../services/fileService';
import { FigmaAnalyzerAgent } from '../agents/FigmaAnalyzerAgent';
import { DesignSystemAnalyzerAgent } from '../agents/DesignSystemAnalyzerAgent';
import { ComparerAgent } from '../agents/ComparerAgent';
import { PlannerAgent } from '../agents/PlannerAgent';
import { CodeGeneratorAgent } from '../agents/CodeGeneratorAgent';
import { CodeAnalyzerAgent } from '../agents/CodeAnalyzerAgent';

/**
 * Setup and register all tools including agents
 */
export function setupTools(): ToolRegistry {
  const registry = new ToolRegistry();

  const llmService = new LLMService();
  const figmaService = new FigmaService();
  const fileService = new FileService();

  // Initialize agents (inject services where needed)
  const figmaAnalyzer = new FigmaAnalyzerAgent(figmaService, llmService);
  const designSystemAnalyzer = new DesignSystemAnalyzerAgent();
  const comparer = new ComparerAgent();
  const planner = new PlannerAgent();
  const codeGenerator = new CodeGeneratorAgent();
  const codeAnalyzer = new CodeAnalyzerAgent(llmService);

  // Register LLM tools
  registry.register({
    id: 'llm.chat',
    name: 'LLM Chat',
    description: 'Send chat messages to LLM',
    execute: async (ctx: ExecutionContext, args: any) => {
      return await llmService.chat(ctx, args.messages, args.options);
    },
  });

  registry.register({
    id: 'llm.chatJSON',
    name: 'LLM Chat JSON',
    description: 'Send chat messages expecting JSON response',
    execute: async (ctx: ExecutionContext, args: any) => {
      // Ensure caller info is forwarded if provided by tools/agents
      const options = args.options || {};
      if (args.caller && !options.caller) {
        options.caller = args.caller;
      }
      return await llmService.chatJSON(ctx, args.messages, args.schema, options);
    },
  });

  // Register Figma tools
  registry.register({
    id: 'figma.checkMCP',
    name: 'Check Figma MCP',
    description: 'Check if Figma MCP is available',
    execute: async (ctx: ExecutionContext, args: any) => {
      return await figmaService.checkMCPAvailability(ctx);
    },
  });

  registry.register({
    id: 'figma.getDesignContext',
    name: 'Get Figma Design Context',
    description: 'Get design context from Figma',
    execute: async (ctx: ExecutionContext, args: any) => {
      return await figmaService.getDesignContext(ctx, args.nodeId, args.options);
    },
  });

  registry.register({
    id: 'figma.getMetadata',
    name: 'Get Figma Metadata',
    description: 'Get Figma metadata',
    execute: async (ctx: ExecutionContext, args: any) => {
      return await figmaService.getMetadata(ctx, args.nodeId);
    },
  });

  registry.register({
    id: 'figma.getScreenshot',
    name: 'Get Figma Screenshot',
    description: 'Get screenshot of Figma node',
    execute: async (ctx: ExecutionContext, args: any) => {
      return await figmaService.getScreenshot(ctx, args.nodeId);
    },
  });

  registry.register({
    id: 'figma.getVariables',
    name: 'Get Figma Variables',
    description: 'Get Figma variable definitions',
    execute: async (ctx: ExecutionContext, args: any) => {
      return await figmaService.getVariableDefinitions(ctx, args.nodeId);
    },
  });

  // Register workspace tools
  registry.register({
    id: 'workspace.readFile',
    name: 'Read File',
    description: 'Read file from workspace',
    execute: async (ctx: ExecutionContext, args: any) => {
      return await fileService.readFile(ctx, args.filePath);
    },
  });

  registry.register({
    id: 'workspace.writeFile',
    name: 'Write File',
    description: 'Write file to workspace',
    execute: async (ctx: ExecutionContext, args: any) => {
      return await fileService.writeFile(ctx, args.filePath, args.content);
    },
  });

  registry.register({
    id: 'workspace.findFiles',
    name: 'Find Files',
    description: 'Search for files in workspace',
    execute: async (ctx: ExecutionContext, args: any) => {
      return await fileService.findFiles(ctx, args.pattern, args.exclude);
    },
  });

  registry.register({
    id: 'workspace.openDocument',
    name: 'Open Document',
    description: 'Open document in editor',
    execute: async (ctx: ExecutionContext, args: any) => {
      return await fileService.openDocument(ctx, args.filePath);
    },
  });

  registry.register({
    id: 'workspace.listDirectory',
    name: 'List Directory',
    description: 'List directory contents',
    execute: async (ctx: ExecutionContext, args: any) => {
      return await fileService.listDirectory(ctx, args.dirPath);
    },
  });

  // Register agents as tools so they can be called by other agents
  registry.register({
    id: 'agent.figmaAnalyzer',
    name: 'Figma Analyzer Agent',
    description: 'Analyzes Figma design and extracts UI structure',
    execute: async (ctx: ExecutionContext, args: any) => {
      const result = await figmaAnalyzer.run(ctx, registry, args, args.stream);
      return { ok: true, data: result };
    },
  });

  registry.register({
    id: 'agent.designSystemAnalyzer',
    name: 'Design System Analyzer Agent',
    description: 'Maps Figma components to design system',
    execute: async (ctx: ExecutionContext, args: any) => {
      const result = await designSystemAnalyzer.run(ctx, registry, args, args.stream);
      return { ok: true, data: result };
    },
  });

  registry.register({
    id: 'agent.comparer',
    name: 'Comparer Agent',
    description: 'Compares design against implementation',
    execute: async (ctx: ExecutionContext, args: any) => {
      const result = await comparer.run(ctx, registry, args, args.stream);
      return { ok: true, data: result };
    },
  });

  registry.register({
    id: 'agent.planner',
    name: 'Planner Agent',
    description: 'Creates execution plans',
    execute: async (ctx: ExecutionContext, args: any) => {
      const result = await planner.run(ctx, registry, args, args.stream);
      return { ok: true, data: result };
    },
  });

  registry.register({
    id: 'agent.codeGenerator',
    name: 'Code Generator Agent',
    description: 'Generates code from specifications',
    execute: async (ctx: ExecutionContext, args: any) => {
      const result = await codeGenerator.run(ctx, registry, args, args.stream);
      return { ok: true, data: result };
    },
  });
  registry.register({
    id: 'agent.codeAnalyzer',
    name: 'Code Analyzer Agent',
    description: 'Analyzes existing code implementation',
    execute: async (ctx: ExecutionContext, args: any) => {
      const result = await codeAnalyzer.run(ctx, registry, args, args.stream);
      return { ok: true, data: result };
    },
  });
  return registry;
}
