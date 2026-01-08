import { ExecutionContext } from '../runtime/ExecutionContext';
import { ToolRegistry } from '../runtime/ToolRegistry';

/**
 * Agent metadata for intent analysis
 */
export interface AgentMetadata {
  name: string;
  description: string;
  capabilities: string[];
  inputRequirements: string[];
  outputProvides: string[];
  estimatedDuration?: number; // seconds
}

/**
 * Agent execution plan item
 */
export interface AgentExecutionPlan {
  agentName: string;
  executionOrder: number;
  parallelGroup: number; // agents with same parallelGroup can run in parallel
  inputs: Record<string, any>;
  dependencies: string[]; // agent names that must complete first
}

/**
 * Intent analysis result
 */
export interface IntentAnalysisResult {
  intent: string;
  selectedAgents: AgentExecutionPlan[];
  reasoning: string;
  estimatedTotalDuration: number;
}

/**
 * IntentAnalyzerAgent
 * Analyzes user intent and determines which agents to execute and in what order
 */
export class IntentAnalyzerAgent {
  readonly name = 'IntentAnalyzer';
  
  private availableAgents: Map<string, AgentMetadata> = new Map([
    ['FigmaAnalyzer', {
      name: 'FigmaAnalyzer',
      description: 'Analyzes Figma design nodes and extracts component structure, styles, and variants',
      capabilities: ['figma-analysis', 'design-extraction'],
      inputRequirements: ['nodeId or current selection'],
      outputProvides: ['figmaAnalysis'],
      estimatedDuration: 5,
    }],
    ['DesignSystemAnalyzer', {
      name: 'DesignSystemAnalyzer',
      description: 'Maps Figma components to existing design system components and tokens',
      capabilities: ['design-system-mapping', 'token-mapping'],
      inputRequirements: ['figmaAnalysis'],
      outputProvides: ['designSystemMapping'],
      estimatedDuration: 3,
    }],
    ['Planner', {
      name: 'Planner',
      description: 'Creates execution plan with subtasks for implementation',
      capabilities: ['planning', 'task-breakdown'],
      inputRequirements: ['goal', 'context'],
      outputProvides: ['plan'],
      estimatedDuration: 2,
    }],
    ['CodeGenerator', {
      name: 'CodeGenerator',
      description: 'Generates code based on design analysis and plan',
      capabilities: ['code-generation', 'file-creation'],
      inputRequirements: ['figmaAnalysis or plan'],
      outputProvides: ['codegenResults'],
      estimatedDuration: 10,
    }],
    ['Comparer', {
      name: 'Comparer',
      description: 'Compares implementation against Figma design and identifies differences',
      capabilities: ['comparison', 'diff-analysis'],
      inputRequirements: ['figmaAnalysis', 'implementationContext'],
      outputProvides: ['compareResult'],
      estimatedDuration: 5,
    }],
  ]);

  /**
   * Analyze user intent and create execution plan
   */
  async run(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: {
      userPrompt: string;
      taskInput: Record<string, any>;
      predefinedAgents?: AgentExecutionPlan[]; // Optional predefined agent order from command
    }
  ): Promise<IntentAnalysisResult> {
    ctx.trace('agent', 'IntentAnalyzer-start', { input });

    // If predefined agents provided, use them with optional LLM refinement
    if (input.predefinedAgents && input.predefinedAgents.length > 0) {
      return this.refineWithUserPrompt(ctx, tools, input.predefinedAgents, input.userPrompt, input.taskInput);
    }

    // Build context about available agents
    const agentsDescription = Array.from(this.availableAgents.values())
      .map(agent => `- ${agent.name}: ${agent.description}
  Capabilities: ${agent.capabilities.join(', ')}
  Requires: ${agent.inputRequirements.join(', ')}
  Provides: ${agent.outputProvides.join(', ')}`)
      .join('\n');

    // Use LLM to analyze intent
    const analysisPrompt = `You are an expert system that analyzes user intent for UI development tasks.

Available Agents:
${agentsDescription}

User Intent: ${input.userPrompt}

Task Input: ${JSON.stringify(input.taskInput, null, 2)}

Analyze the user's intent and determine:
1. What is the user trying to accomplish?
2. Which agents should be executed?
3. What is the optimal execution order?
4. Which agents can run in parallel (same parallelGroup number)?
5. What inputs does each agent need?
6. What are the dependencies between agents?

Consider:
- FigmaAnalyzer should run first if Figma data is needed
- DesignSystemAnalyzer depends on FigmaAnalyzer output
- Planner can run after design analysis
- CodeGenerator needs either FigmaAnalyzer or Planner output
- Comparer is for iterative refinement, needs FigmaAnalyzer and implementation

Respond in JSON format:
{
  "intent": "brief description of what user wants",
  "reasoning": "explanation of why these agents were selected",
  "agents": [
    {
      "agentName": "AgentName",
      "executionOrder": 1,
      "parallelGroup": 1,
      "inputs": { "key": "value" },
      "dependencies": ["AgentName"]
    }
  ]
}`;

    try {
      const response = await tools.invoke(ctx, 'llm.chat', {
        messages: [{ role: 'user', content: analysisPrompt }],
        options: { temperature: 0.3 },
      });

      // Parse LLM response
      const responseText = typeof response === 'string' ? response : JSON.stringify(response);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from LLM response');
      }

      const analysis = JSON.parse(jsonMatch[0]);
      
      // Calculate total duration
      const estimatedTotalDuration = analysis.agents.reduce((total: number, agent: any) => {
        const metadata = this.availableAgents.get(agent.agentName);
        return total + (metadata?.estimatedDuration || 5);
      }, 0);

      // Build execution plan
      const selectedAgents: AgentExecutionPlan[] = analysis.agents.map((agent: any) => ({
        agentName: agent.agentName,
        executionOrder: agent.executionOrder || 1,
        parallelGroup: agent.parallelGroup || 1,
        inputs: agent.inputs || {},
        dependencies: agent.dependencies || [],
      }));

      const result: IntentAnalysisResult = {
        intent: analysis.intent,
        selectedAgents,
        reasoning: analysis.reasoning,
        estimatedTotalDuration,
      };

      ctx.trace('agent', 'IntentAnalyzer-complete', { result });
      return result;

    } catch (error) {
      ctx.trace('agent', 'IntentAnalyzer-error', { error });
      
      // Fallback: default to full pipeline
      return this.getDefaultPipeline(input.userPrompt, input.taskInput);
    }
  }

  /**
   * Get default execution pipeline when LLM analysis fails
   */
  private getDefaultPipeline(userPrompt: string, taskInput: Record<string, any>): IntentAnalysisResult {
    const isRefinement = userPrompt.toLowerCase().includes('refine') || 
                         userPrompt.toLowerCase().includes('fit') ||
                         taskInput.maxIterations !== undefined;

    if (isRefinement) {
      // Fit and finish pipeline
      return {
        intent: 'Iterative refinement of implementation',
        reasoning: 'User wants to refine existing implementation',
        selectedAgents: [
          {
            agentName: 'FigmaAnalyzer',
            executionOrder: 1,
            parallelGroup: 1,
            inputs: { nodeId: taskInput.nodeId },
            dependencies: [],
          },
          {
            agentName: 'Comparer',
            executionOrder: 2,
            parallelGroup: 2,
            inputs: {},
            dependencies: ['FigmaAnalyzer'],
          },
          {
            agentName: 'Planner',
            executionOrder: 3,
            parallelGroup: 3,
            inputs: {},
            dependencies: ['Comparer'],
          },
          {
            agentName: 'CodeGenerator',
            executionOrder: 4,
            parallelGroup: 4,
            inputs: {},
            dependencies: ['Planner'],
          },
        ],
        estimatedTotalDuration: 25,
      };
    } else {
      // Build from Figma pipeline
      return {
        intent: 'Build UI components from Figma design',
        reasoning: 'User wants to generate new implementation from Figma',
        selectedAgents: [
          {
            agentName: 'FigmaAnalyzer',
            executionOrder: 1,
            parallelGroup: 1,
            inputs: { nodeId: taskInput.nodeId, forceCode: taskInput.forceCode },
            dependencies: [],
          },
          {
            agentName: 'DesignSystemAnalyzer',
            executionOrder: 2,
            parallelGroup: 2,
            inputs: { designSystemPath: taskInput.designSystemPath },
            dependencies: ['FigmaAnalyzer'],
          },
          {
            agentName: 'Planner',
            executionOrder: 3,
            parallelGroup: 3,
            inputs: {},
            dependencies: ['DesignSystemAnalyzer'],
          },
          {
            agentName: 'CodeGenerator',
            executionOrder: 4,
            parallelGroup: 4,
            inputs: {},
            dependencies: ['Planner'],
          },
        ],
        estimatedTotalDuration: 20,
      };
    }
  }

  /**
   * Register a new agent for intent analysis
   */
  registerAgent(metadata: AgentMetadata): void {
    this.availableAgents.set(metadata.name, metadata);
  }

  /**
   * Get all available agents
   */
  getAvailableAgents(): AgentMetadata[] {
    return Array.from(this.availableAgents.values());
  }

  /**
   * Refine predefined agents order based on user prompt
   * This allows commands to provide a default agent sequence that can be optimized
   */
  private async refineWithUserPrompt(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    predefinedAgents: AgentExecutionPlan[],
    userPrompt: string,
    taskInput: Record<string, any>
  ): Promise<IntentAnalysisResult> {
    // If user prompt is generic or empty, use predefined order as-is
    if (!userPrompt || userPrompt.trim().length < 10) {
      return {
        intent: 'Execute predefined agent pipeline',
        selectedAgents: predefinedAgents,
        reasoning: 'Using predefined agent order from command',
        estimatedTotalDuration: this.estimateDuration(predefinedAgents),
      };
    }

    // Use LLM to refine the agent order based on user prompt
    const agentsList = predefinedAgents.map(a => a.agentName).join(', ');
    const refinementPrompt = `You have a predefined agent execution pipeline: ${agentsList}

User prompt: ${userPrompt}

Task input: ${JSON.stringify(taskInput, null, 2)}

Analyze if the predefined pipeline needs adjustment based on user's specific request.
You can:
1. Keep the order as-is
2. Skip agents that aren't needed
3. Adjust parallel execution groups
4. Modify agent inputs based on user prompt

Respond in JSON format:
{
  "intent": "what user wants to accomplish",
  "reasoning": "why you kept/modified the pipeline",
  "agents": [
    {
      "agentName": "AgentName",
      "executionOrder": 1,
      "parallelGroup": 1,
      "inputs": {},
      "dependencies": []
    }
  ]
}`;

    try {
      const response = await tools.invoke(ctx, 'llm.chat', {
        messages: [{ role: 'user', content: refinementPrompt }],
        options: { temperature: 0.2 },
      });

      console.log('[HELIX][IntentAnalyzer] Raw LLM Response:', JSON.stringify(response, null, 2));

      // Handle wrapped response format: {ok: true, data: {content: "..."}}
      let contentText: string;
      if (typeof response === 'object' && response !== null && 'ok' in response && 'data' in response) {
        const wrappedResponse = response as { ok: boolean; data: { content: string } };
        if (wrappedResponse.ok && wrappedResponse.data?.content) {
          contentText = wrappedResponse.data.content;
          console.log('[HELIX][IntentAnalyzer] Extracted from wrapped response:', contentText);
        } else {
          throw new Error(`LLM response indicated failure: ${JSON.stringify(response)}`);
        }
      } else if (typeof response === 'string') {
        contentText = response;
      } else {
        contentText = JSON.stringify(response);
      }

      // Extract JSON from markdown code block if present
      const codeBlockMatch = contentText.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
      const jsonText = codeBlockMatch ? codeBlockMatch[1] : contentText;

      console.log('[HELIX][IntentAnalyzer] JSON text to parse:', jsonText);

      // Parse the actual agent plan JSON
      const analysis = JSON.parse(jsonText.trim());
      console.log('[HELIX][IntentAnalyzer] Parsed analysis:', JSON.stringify(analysis, null, 2));

      // Validate that analysis has the expected structure
      if (!analysis || !analysis.agents || !Array.isArray(analysis.agents)) {
        throw new Error(`Invalid LLM response structure. Expected {agents: []}, got: ${JSON.stringify(analysis)}`);
      }

      const selectedAgents: AgentExecutionPlan[] = analysis.agents.map((agent: any) => ({
        agentName: agent.agentName,
        executionOrder: agent.executionOrder || 1,
        parallelGroup: agent.parallelGroup || 1,
        inputs: agent.inputs || {},
        dependencies: agent.dependencies || [],
      }));
      console.log('Refined agent execution plan:', selectedAgents);
      return {
        intent: analysis.intent,
        selectedAgents,
        reasoning: analysis.reasoning,
        estimatedTotalDuration: this.estimateDuration(selectedAgents),
      };
    } catch (error) {
      ctx.trace('agent', 'IntentAnalyzer-refinement-error', { error });
      console.error('Agent refinement failed, using predefined order:', error);
      // Fallback: use predefined order
      return {
        intent: 'Execute predefined agent pipeline',
        selectedAgents: predefinedAgents,
        reasoning: 'Using predefined order (refinement failed)',
        estimatedTotalDuration: this.estimateDuration(predefinedAgents),
      };
    }
  }

  /**
   * Estimate total duration for agent execution plan
   */
  private estimateDuration(agents: AgentExecutionPlan[]): number {
    return agents.reduce((total, agent) => {
      const metadata = this.availableAgents.get(agent.agentName);
      return total + (metadata?.estimatedDuration || 5);
    }, 0);
  }
}
