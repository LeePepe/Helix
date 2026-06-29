# Fit/Finish Flow (Orchestrator)

This workflow runs as a **4-phase pipeline** with strict dependency ordering.

Reference: `src/tasks/commandPresets.ts` (FIT_AND_FINISH_PIPELINE), `src/tasks/UnifiedFigmaTask.ts`

## Phase 1 (Parallel): Design System Analyzer + Code Analyzer

Two independent agents run in parallel:

### Agent A: Design System Analyzer

- Reference: `references/design-system-analyzer.md`
- Inputs: design system guide path, optional focusAreas
- Actions:
  1. Load `.github/design-system-guide.md`
  2. LLM dynamic domain discovery (NOT hardcoded)
  3. Extract framework info and component patterns
  4. Apply focusAreas filter if provided
- Output contract:
  - `domains[]` — dynamic array of `{ name, description, tokens }`
  - `componentPatterns[]`
  - `frameworkInfo`

### Agent B: Code Analyzer

- Reference: `references/code-analyzer.md`
- Inputs: user prompt, user references (file paths / IDE selection)
- Actions:
  1. Resolve file paths from prompt and references
  2. Read file content
  3. Extract UI properties and token usage
- Output contract:
  - `implementationContext` — `{ files: Record<path, sourceCode> }`

## Phase 2: Figma Collector

- Reference: `references/figma-collector.md`
- Dependencies: **Design System Analyzer** (needs domain list for focused analysis)
- Inputs: Figma node IDs or URLs, design system domains
- Actions:
  1. Parse and normalize node IDs from URLs
  2. For each node, call MCP tools in parallel:
     - `mcp__figma-desktop__get_metadata` — structure overview
     - `mcp__figma-desktop__get_design_context` — full design data
     - `mcp__figma-desktop__get_variable_defs` — token definitions
     - `mcp__figma-desktop__get_screenshot` — visual reference (optional)
  3. **Structure analysis** (LLM): decompose each node into logical UIParts
     - A single node may contain multiple sub-views, variants, or states
     - Each sub-component becomes an independent UIPart
  4. **Detailed analysis per part** (LLM): deep extraction of properties per UIPart
- Output contract:
  - `root` with `children[]` — array of UIParts (the row axis for comparison), with per-part `properties` and `screenshotPath`
  - `variableDefs` — token definitions only; raw metadata/design-context blobs are NOT inlined

**Important**: The Figma Collector does TWO levels of decomposition:

1. **Multi-node**: multiple Figma URLs → fetch each node independently
2. **Intra-node**: a single complex node → LLM-driven structure analysis splits it into logical UIParts (sub-views, variant states, repeated elements)

Both levels produce UIParts that feed into the Comparer's task matrix.

## Phase 3: Comparer

- Reference: `references/comparer.md`
- Dependencies: **ALL of Phase 1 + Phase 2** must complete first
- Inputs:
  - `figmaData` — from Figma Collector (UIParts)
  - `designSystem` — from Design System Analyzer (dynamic domains, already focusAreas-scoped)
  - `codeFiles` — file paths from Code Analyzer (re-read on demand)
- Actions:
  1. Build UIPart × Domain task matrix
  2. Execute all tasks in parallel (each task = 1 LLM call)
  3. Merge results, group by domain
  4. Generate report with severity breakdown
- Output contract:
  - `diffs[]` — per-domain mismatch list with severity
  - `summary` — overall comparison summary
  - `nextAction` — recommended next step

## Phase 4 (Optional): Code Generator (FIX mode)

- Reference: `references/code-generator.md`
- Dependencies: **Comparer** must complete first
- Inputs:
  - `compareResult` — from Comparer
  - `existingCode` — file paths from Code Analyzer
  - `figmaAnalysis` — from Figma Collector
  - `designSystem` — from Design System Analyzer
- Actions:
  1. Use compareResult diffs as the change list
  2. Apply minimal code fixes to match Figma + design system
  3. Avoid unrelated changes
- Output contract:
  - Modified code files
  - Token mapping notes

## Execution Rules

- Phase 1 agents MUST run in parallel — they have no dependencies on each other.
- Phase 2 depends on Phase 1 (Design System Analyzer) for domain-aware analysis.
- Phase 3 is a strict downstream aggregator — it MUST wait for Phase 1 + Phase 2.
- Phase 4 is optional — only execute if user wants auto-fix.
- Do NOT collapse phases into a single sequential run.
- Do NOT use hardcoded domain lists — always use domains from Design System Analyzer.
