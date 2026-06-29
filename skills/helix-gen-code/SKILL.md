---
name: helix-gen-code
description: Use when generating production-ready code from Figma with project design-system constraints and codebase conventions.
---

# Helix Gen-Code (Orchestrator)

## Inputs

Collect before proceeding:

- **Figma target** (required): Figma Desktop selection, or one/more Figma URLs with `node-id`

Collect optional inputs when mentioned by the user:

- **Output file path**: where to write the generated code
- **Framework / platform hint**: e.g., `"SwiftUI"`, `"React"`, `"Flutter"`
- **Focus areas**: comma-separated design aspects to prioritize (e.g., `"colors, typography"`)

For Figma input details, see `../helix/references/figma-input.md`.

## Pre-flight Checks

### 1. MCP Gate

Run `../helix/references/mcp-precheck.md`. Do NOT proceed without a working Figma MCP connection.

### 2. Design System Guide

Search for `.github/design-system-guide.md` from the current directory up to the git root. Accept a user-specified path as override.

- **Missing**: run `helix-design-system-init` first, then return here.
- **Exists but looks incomplete**: ask whether to regenerate before continuing.

## Session Initialization

Create a scratch directory for this session:

```
/tmp/helix-{timestamp}/
```

Write `{session_dir}/session.json`:

```json
{
  "figmaTarget": "<figma URL(s) or 'desktop-selection'>",
  "outputPath": "<optional user-provided path>",
  "frameworkHint": "<optional framework>",
  "guidePath": "<resolved path to design-system-guide.md>",
  "focusAreas": "<from user prompt or empty string>",
  "timestamp": "<ISO timestamp>"
}
```

## Phase 1 — Design System Analysis

Launch Agent tool — `subagent_type: "helix-design-system-analyzer"`:

```
You are the helix-design-system-analyzer agent.
session_dir: {session_dir}
guide_path: {guidePath}
focusAreas: {focusAreas}
```

Wait for the subagent to complete.

**Error handling:** If it returns `{ "error": "design-system-guide not found" }` → stop, ask user to run `helix-design-system-init` first.

## Phase 2 — Figma Collection

Read `{session_dir}/phase1-design-system.json`. Extract the `domains` array and `frameworkInfo`.

Launch Agent tool — `subagent_type: "helix-figma-collector"`:

```
You are the helix-figma-collector agent.
session_dir: {session_dir}
figma_target: {figmaTarget}
domains: {domains_json}
```

Wait for the subagent to complete.

**Error handling:** If the subagent returns a Figma MCP error → re-run MCP precheck and guide the user to fix it before retrying.

## Phase 3 — Planning

Launch Agent tool — `subagent_type: "helix-planner"`:

```
You are the helix-planner agent.
session_dir: {session_dir}
output_path: {outputPath}
framework_hint: {frameworkHint}
focus_areas: {focusAreas}
```

Wait for the subagent to complete.

## Phase 4 — Code Generation

Launch Agent tool — `subagent_type: "helix-code-generator"`:

```
You are the helix-code-generator agent.
mode: BUILD
session_dir: {session_dir}
output_path: {outputPath}
```

Wait for the subagent to complete.

Show the user:
- The path of the generated file
- A brief token mapping summary
- Any `// TODO: add design token` items that need manual review

## Ultracode Mode (preferred when available)

If the **Workflow** tool is available, prefer it over the manual phases above — it runs the same `helix-*` agents as a deterministic pipeline and adds a judge panel before writing code. Trigger when the user says "ultracode", asks for production-grade/thorough output, or the component is complex. Reuse the same `session_dir`.

Call `Workflow` with `args: {session_dir, outputPath, frameworkHint, focusAreas}`:

- **Phase 1–2:** `helix-design-system-analyzer` → `helix-figma-collector` (sequential).
- **Phase 3 — judge panel:** generate N=3 independent plans via `helix-planner` from different angles (composition-first, token-fidelity-first, a11y-first), score with parallel judges, synthesize the winner grafting best ideas. Pick the strongest plan.
- **Phase 4:** `helix-code-generator` BUILD mode on the winning plan, then one verify agent: "does the code only use tokens from the guide, no invented names?" Regenerate flagged sections once.

Show file path, token-mapping summary, and `// TODO: add design token` items. A ready-to-run script is in `../helix/references/ultracode-workflows.md`. If Workflow is unavailable, use the manual phases above.

## Fallback (Agent tool unavailable)

If the Agent tool is not available in this environment, run all phases sequentially in the main conversation using the reference docs:

1. `../helix/references/design-system-analyzer.md`
2. `../helix/references/figma-collector.md`
3. `../helix/references/gen-code.md` (Phases 3–4)

## Cleanup

After the session, optionally remove `{session_dir}`. Ask the user if they want to keep it for debugging.
