import { BaseAgent } from '../base/BaseAgent';
import { AgentInput, AgentOutput, DimensionTask } from '../base/types';
import { ExecutionPlan, ExecutionPlanBuilder, PlannerInput } from './ExecutionPlan';

/**
 * Planner Agent
 * 分析用户请求和设计系统，生成动态执行计划
 */
export class PlannerAgent extends BaseAgent {
	name = 'planner';
	description = 'Analyze design system and generate execution plan';
	executionMode: 'llm' | 'tool' = 'llm';

	async execute(input: AgentInput<PlannerInput>): Promise<AgentOutput<ExecutionPlan>> {
		try {
			const { userRequest, designSystemGuide, availableAgents } = input.data;

			this.streamProgress('Analyzing design system and generating execution plan...', input.context);

			// 构建 Planner 提示词
			const prompt = this.buildPlannerPrompt(
				userRequest,
				designSystemGuide,
				availableAgents
			);

			// 调用 LLM
			const llmResponse = await this.callLLM(prompt, input.context);

			// 解析执行计划
			const planData = this.parseExecutionPlan(llmResponse);

			// 构建完整的执行计划（包含依赖图和并行组）
			const builder = new ExecutionPlanBuilder();
			for (const dimension of planData.dimensions) {
				builder.addDimension(dimension);
			}
			const executionPlan = builder.build();

			return {
				success: true,
				data: executionPlan,
				metadata: {
					executionMode: 'llm',
					agentName: this.name
				}
			};
		} catch (error: any) {
			return this.handleError(error);
		}
	}

	/**
	 * 构建 Planner 提示词
	 */
	private buildPlannerPrompt(
		userRequest: string,
		designSystemGuide: string,
		availableAgents: string[]
	): string {
		return `You are a task planner for design system consistency checking.

# User Request
${userRequest}

# Design System Guide
${designSystemGuide}

# Available Agents
${availableAgents.join(', ')}

# Your Task
Analyze the design system guide and generate an execution plan to check design consistency.

## Decision Rules:

1. **Identify Dimensions to Check**:
   Look for these common dimensions in the design system:
   - color: Color palette and usage
   - typography: Font families, sizes, weights
   - spacing: Margins, padding, gaps
   - borderRadius: Corner radius values
   - shadow: Box shadows and elevation
   - semantic: Semantic meaning (e.g., "primary" vs "secondary")
   - layout: Layout structure and alignment
   - accessibility: WCAG compliance

2. **Choose Execution Mode for Each Dimension**:

   **Use "tool" mode when**:
   - Design system has structured tokens (e.g., \`tokens.color\`, \`tokens.spacing\`)
   - Values can be extracted and compared programmatically
   - Examples: color, typography, spacing, borderRadius, shadow

   **Use "llm" mode when**:
   - Requires understanding context or semantics
   - Values need interpretation
   - Examples: semantic, layout, accessibility

3. **Determine Dependencies**:
   - Semantic and layout checks usually depend on basic checks (color, typography)
   - Accessibility checks should run after all other checks

4. **Dynamic Agent Creation**:
   - If the design system mentions concepts not in available agents (e.g., "motion", "icons"), create a new dynamic agent
   - Provide the agent definition with appropriate prompt template

## Output Format

Return a JSON object with this structure:

\`\`\`json
{
  "dimensions": [
    {
      "id": "color-consistency",
      "name": "Color Consistency Check",
      "agentType": "ColorConsistencyAgent",
      "executionMode": "tool",
      "config": {
        "tokenPath": "tokens.color",
        "tolerance": 0.01
      },
      "priority": 1,
      "dependencies": []
    },
    {
      "id": "semantic-consistency",
      "name": "Semantic Consistency Check",
      "agentType": "SemanticConsistencyAgent",
      "executionMode": "llm",
      "config": {},
      "priority": 2,
      "dependencies": ["color-consistency", "typography-consistency"]
    }
  ]
}
\`\`\`

## Important Notes:

- **If design system has tokens** (e.g., "Use \`color.primary\` token"), use "tool" mode
- **If design system describes intent** (e.g., "Primary actions should stand out"), use "llm" mode
- **Set tokenPath** in config when design system explicitly mentions token structure
- **Create new dynamic agents** if design system has unique concepts (return agentType: "DynamicAgent" with a dynamicDefinition in config)
- **Priority**: Lower numbers run first (1 = highest priority)
- **Dependencies**: List dimension IDs that must complete first

Return ONLY the JSON object, no additional text or markdown code blocks.`;
	}

	/**
	 * 解析 LLM 返回的执行计划
	 */
	private parseExecutionPlan(llmResponse: string): { dimensions: DimensionTask[] } {
		try {
			// 移除可能的 markdown 代码块标记
			let cleanedResponse = llmResponse.trim();

			if (cleanedResponse.startsWith('```')) {
				// 移除 ```json 或 ```
				cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*\n?/, '');
				cleanedResponse = cleanedResponse.replace(/\n?```\s*$/, '');
			}

			const parsed = JSON.parse(cleanedResponse);

			if (!parsed.dimensions || !Array.isArray(parsed.dimensions)) {
				throw new Error('Invalid execution plan: missing dimensions array');
			}

			// 验证每个维度任务
			for (const dimension of parsed.dimensions) {
				this.validateDimensionTask(dimension);
			}

			return {
				dimensions: parsed.dimensions
			};
		} catch (error: any) {
			throw new Error(`Failed to parse execution plan: ${error.message}\n\nLLM Response:\n${llmResponse}`);
		}
	}

	/**
	 * 验证维度任务
	 */
	private validateDimensionTask(task: any): void {
		const required = ['id', 'name', 'agentType', 'executionMode'];

		for (const field of required) {
			if (!task[field]) {
				throw new Error(`Invalid dimension task: missing required field "${field}"`);
			}
		}

		if (!['llm', 'tool'].includes(task.executionMode)) {
			throw new Error(`Invalid executionMode: ${task.executionMode} (must be "llm" or "tool")`);
		}

		if (!task.dependencies) {
			task.dependencies = [];
		}

		if (!task.priority) {
			task.priority = 1;
		}

		if (!task.config) {
			task.config = {};
		}
	}
}
