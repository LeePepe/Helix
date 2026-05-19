---
name: helix-fit-finish
description: Use when comparing Figma design against implemented code to find mismatches, generate a fit-finish report, and propose concrete fixes.
---

# Helix Fit-Finish (Orchestrator)

## Inputs

Collect before proceeding:

- **Figma target** (required): Figma Desktop selection, or one/more Figma URLs with `node-id`
- **Code file path(s)** (required): absolute or repo-relative path(s) to the code to compare

If code path is missing, ask for it. For Figma input details, see `./references/figma-input.md`.

## Pre-flight Checks

### 1. MCP Gate

Run `./references/mcp-precheck.md`. Do NOT proceed without a working Figma MCP connection.

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
  "codePaths": ["<path1>", "<path2>"],
  "guidePath": "<resolved path to design-system-guide.md>",
  "focusAreas": "<from user prompt or empty string>",
  "reportDir": ".github/helix/reports",
  "componentName": "<inferred from Figma or code file name>",
  "timestamp": "<ISO timestamp>"
}
```

## Phase 1 — Parallel Subagents

**CRITICAL: Invoke BOTH Agent tool calls in the same response to achieve true parallel execution. Do not await one before starting the other.**

**Agent tool call A** — `subagent_type: "helix-design-system-analyzer"`:

```
You are the helix-design-system-analyzer agent.
session_dir: {session_dir}
guide_path: {guidePath}
focusAreas: {focusAreas}
```

**Agent tool call B** — `subagent_type: "helix-code-analyzer"`:

```
You are the helix-code-analyzer agent.
session_dir: {session_dir}
code_paths: {codePaths}
guide_path: {guidePath}
```

Wait for both Agent tool calls to complete before proceeding.

**Error handling:**
- If Design System Analyzer returns `{ "error": "design-system-guide not found" }` → stop, ask user to run `helix-design-system-init` first.
- If Code Analyzer returns all missing files → stop, ask user to verify the code paths.

## Phase 2 — Figma Collection

Read `{session_dir}/phase1-design-system.json`. Extract the `domains` array.

Launch Agent tool — `subagent_type: "helix-figma-collector"`:

```
You are the helix-figma-collector agent.
session_dir: {session_dir}
figma_target: {figmaTarget}
domains: {domains_json}
```

Wait for the subagent to complete.

**Error handling:** If the subagent returns a Figma MCP error → re-run MCP precheck and guide the user to fix it before retrying.

## Phase 3 — Comparison

Read `{session_dir}/phase1-design-system.json` for `domains`.

Launch Agent tool — `subagent_type: "helix-comparer"`:

```
You are the helix-comparer agent.
session_dir: {session_dir}
focus_areas: {focusAreas}
report_dir: .github/helix/reports
component_name: {componentName}
```

Wait for the subagent to complete.

Read `{session_dir}/phase3-compare.json`. Display the match rate and high-severity count to the user. Tell the user where the full report was saved.

## Phase 4 — Optional Fix

Ask the user: **"Apply fixes to the code now? (yes / no)"**

If yes, launch Agent tool — `subagent_type: "helix-code-generator"`:

```
You are the helix-code-generator agent.
mode: FIX
session_dir: {session_dir}
```

Display which files were modified.

## Fallback (Agent tool unavailable)

If the Agent tool is not available in this environment, run all phases sequentially in the main conversation using the reference docs:

1. `./references/design-system-analyzer.md` + `./references/code-analyzer.md`
2. `./references/figma-collector.md`
3. `./references/fit-finish.md` (Phase 3 Comparer)

## Cleanup

After the session, optionally remove `{session_dir}` to free disk space. Ask the user if they want to keep it for debugging.
