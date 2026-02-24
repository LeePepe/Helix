# Comparer (Fit/Finish)

## Goal

Compare Figma design specs with code implementation using a **UIPart × Domain** task matrix. Each task is an independent LLM call that can run in parallel.

Reference: `src/agents/ComparerAgent.ts`

## Inputs

All inputs come from upstream agents — Comparer starts only after all three are available:

- `figmaData` — from Figma Collector: `FigmaAnalysisResult` with `root.children[]` (UIParts)
- `designSystem` — from Design System Analyzer: `{ domains[] }` (dynamic domain list)
- `codeFiles` — from Code Analyzer: `{ files: Record<path, sourceCode> }`
- `focusAreas` (optional) — comma-separated focus areas to filter domains

## Task Matrix Construction

### Step 1: Extract UIParts (row axis)

From `figmaData.root.children[]`:

- If `root.children` exists and has items → each child is a UIPart.
- Otherwise → use `root` itself as the single UIPart.

### Step 2: Extract Domains (column axis)

From `designSystem.domains[]`:

- Use the **dynamic** domain list discovered by the Design System Analyzer.
- Do NOT use a hardcoded domain list.
- If `designSystem.domains` is empty or null → use a single `{ domain: null, name: "general" }` fallback.

### Step 3: Apply focusAreas filter

If `focusAreas` is provided (e.g., `"typography, colors"`):

- Parse into a list: `["typography", "colors"]`
- Filter domains: keep only domains whose `name` contains any focus area keyword.
- This reduces the task count significantly.

### Step 4: Build cross-product

```text
tasks = []
for each uiPart in UIParts:
  for each domain in filteredDomains:
    tasks.append({ uiPart, domain, taskId: "{uiPart.id}-{domain.name}" })
```

Example: 8 UIParts × 6 Domains = 48 tasks. With focusAreas "typography, colors" → 8 × 2 = 16 tasks.

## Parallel Comparison Execution

Execute **all tasks in parallel** (Promise.all / ThreadPool):

Each task is an independent LLM call with this input:

1. **UI Component**: The UIPart's Figma properties (JSON)
2. **Design Domain**: The domain's tokens and rules (JSON)
3. **Implementation**: The code files content (JSON)
4. **Focus instruction**: "Compare the UI component specifically against the '{domain.name}' design domain."

Each task returns a `CompareResult` with:

- `diffs[]` — Array of differences, each with:
  - `category`: Which domain this diff belongs to
  - `description`: What's different
  - `severity`: high | medium | low
  - `figmaValue`: Expected value from Figma
  - `codeValue`: Actual value in code
  - `fix`: Suggested code change
- `summary`: Text summary of the comparison
- `nextAction`: Recommended next step

## Token Verification Workflow

For each diff, verify token usage:

1. Identify the Figma style or variable name.
2. Extract the leaf token name.
3. Look up in the design system guide (from `designSystem.domains[].tokens`).
4. Verify correct token usage in code.
5. If code uses a hardcoded value instead of a token → flag as high severity.

## Result Merging

After all parallel tasks complete, merge results:

- Concatenate all `diffs[]` from all tasks.
- Group diffs by domain for the report.
- Calculate severity breakdown: count of high / medium / low.
- Determine overall `nextAction`.

## Report

Save a markdown report under `reports/report-[component-name]-[timestamp].md` with:

- Match rate and severity breakdown
- Per-domain difference tables
- Concrete fix recommendations with file paths and line numbers
- "Apply fixes now?" handoff question

Honor the configured reports path when provided by the environment.
