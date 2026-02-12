# Helix Skill Repository Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a standalone `helix` skill repository folder inside this project that mirrors the extension’s capabilities (fit-finish, gen-code, and design-system guide generation) using markdown references and intent routing.

**Architecture:** Single skill folder `helix-skill/helix/` with `SKILL.md` as the router and `references/` holding detailed task workflows copied from existing docs. No scripts; workflow uses Figma MCP and design system guide.

**Tech Stack:** Markdown skill format; existing project docs as references.

### Task 1: Create skill folder structure

**Files:**
- Create: `helix-skill/helix/SKILL.md`
- Create: `helix-skill/helix/references/`

**Step 1: Create directories**

Run: `mkdir -p helix-skill/helix/references`

**Step 2: Create SKILL.md placeholder**

Create `helix-skill/helix/SKILL.md` with YAML frontmatter and empty sections to be filled in Task 3.

**Step 3: Verify structure**

Run: `ls -la helix-skill/helix helix-skill/helix/references`

### Task 2: Populate references from existing docs

**Files:**
- Create: `helix-skill/helix/references/fit-finish.md`
- Create: `helix-skill/helix/references/gen-code.md`
- Create: `helix-skill/helix/references/design-system-rules-prompt.md`
- Create: `helix-skill/helix/references/figma-input.md`

**Step 1: Copy task references**

Run:
- `cp docs/tasks/fit-finish.md helix-skill/helix/references/fit-finish.md`
- `cp docs/tasks/gen-code.md helix-skill/helix/references/gen-code.md`

**Step 2: Copy design system prompt**

Run: `cp docs/initialization/design-system-rules-prompt.md helix-skill/helix/references/design-system-rules-prompt.md`

**Step 3: Add Figma input reference**

Create `helix-skill/helix/references/figma-input.md` with:
- Supported inputs (Figma Desktop selection, URL)
- Examples of URL format and node ID
- Note that Figma MCP is required

### Task 3: Write SKILL.md content with intent routing and subagent guidance

**Files:**
- Modify: `helix-skill/helix/SKILL.md`

**Step 1: Write YAML frontmatter**

Set:
- `name: helix`
- `description: Design-to-code workflows using Figma MCP and a project design system guide. Use for: (1) comparing Figma vs code (fit/finish), (2) generating code from Figma, (3) generating .github/design-system-guide.md when missing, or any request mentioning Helix workflows.`

**Step 2: Add skill workflow**

Include:
- Intent routing rules (fit-finish, gen-code, design-system)
- Required inputs and how to request them
- Design system guide precheck and initialization flow
- References to `references/*.md` for detailed steps
- Explicit rule: split major phases into subagents when available (Figma fetch, design system analysis, code analysis, comparison or codegen)
- Explicit rule: if subagents unavailable, do tasks sequentially but keep the same separation of concerns

### Task 4: Validate skill structure

**Files:**
- None

**Step 1: Run skill validator**

Run: `/Users/tianpli/.codex/skills/.system/skill-creator/scripts/quick_validate.py helix-skill/helix`

**Step 2: Fix validation issues if any**

Update `helix-skill/helix/SKILL.md` as needed and rerun validator.

### Task 5: Summarize and handoff

**Files:**
- None

**Step 1: Summarize changes**

Provide paths created and any decisions made.
