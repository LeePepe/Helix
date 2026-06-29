# Gen-Code Flow (Orchestrator)

This workflow runs as a **4-phase pipeline** with strict dependency ordering, mirroring the Fit-Finish architecture with independent subflows.

Reference: `src/tasks/commandPresets.ts` (BUILD_FROM_FIGMA_PIPELINE), `src/tasks/UnifiedFigmaTask.ts`

## Phase 1: Design System Analyzer

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

## Phase 2: Figma Collector

- Reference: `references/figma-collector.md`
- Dependencies: **Design System Analyzer** (needs domain list and framework info)
- Inputs: Figma node IDs or URLs
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
  - `root` with `children[]` — array of UIParts with per-part `properties`
  - `variableDefs` — token definitions only; raw metadata/design-context blobs are NOT inlined

## Phase 3: Planner

- Reference: (inline — no separate reference file)
- Dependencies: **Figma Collector** + **Design System Analyzer**
- Inputs:
  - `figmaAnalysis` — UIParts from Figma Collector
  - `designSystemMapping` — domains and tokens from Design System Analyzer
  - `compareResult` (optional) — if in FIX mode from a prior Fit-Finish run
- Actions:
  1. Summarize combined context for planning
  2. Generate an implementation plan:
     - Component hierarchy structure
     - Per-domain token mapping decisions for each UIPart
     - File structure and naming recommendations
     - Accessibility and localization requirements
- Output contract:
  - Structured implementation plan
  - Per-UIPart × Domain mapping decisions

## Phase 4: Code Generator (BUILD mode)

- Reference: `references/code-generator.md`
- Dependencies: **Planner** (or directly Figma Collector + Design System if Planner is skipped)
- Inputs:
  - `figmaAnalysis` — from Figma Collector
  - `designSystem` — from Design System Analyzer
  - `plan` — from Planner (optional)
  - `focusAreas` — optional filter
- Actions:
  1. Identify UI type and layout strategy from Figma context
  2. Map tokens by domain — for each dynamic domain, resolve Figma values to design system tokens
  3. Generate structure and layout following design system patterns
  4. Add accessibility attributes and localization keys
  5. Ensure theme support via design system tokens
  6. Validate syntax and design system compliance
- Output contract:
  - Complete code implementation
  - Token mapping notes
  - Suggested file path (if not provided)

## Execution Rules

- Phase 1 MUST complete before Phase 2 (Figma Collector uses domain info).
- Phase 3 depends on Phase 1 + Phase 2.
- Phase 4 depends on Phase 3 (or Phase 1 + Phase 2 if Planner is skipped).
- Segment work by design system domains and report per-domain decisions.
- Do NOT use hardcoded domain lists — always use domains from Design System Analyzer.
- If the environment supports parallel groups, run domain-specific analysis accordingly.
