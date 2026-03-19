# Helix Skill Pack — Architecture Overview

## Directory Structure

```
helix-skill/
├── helix/                          # Router skill + shared resources
│   ├── SKILL.md                    # Entry point: routes to the three sub-skills
│   ├── agents/                     # Subagent definitions (install to ~/.claude/agents/)
│   │   ├── openai.yaml             # Agent interface configuration
│   │   ├── helix-design-system-analyzer.md
│   │   ├── helix-code-analyzer.md
│   │   ├── helix-figma-collector.md
│   │   ├── helix-comparer.md
│   │   ├── helix-planner.md
│   │   └── helix-code-generator.md
│   └── references/                 # Detailed spec docs for agents and sub-workflows
│       ├── mcp-precheck.md         # Figma MCP availability gate
│       ├── figma-input.md          # Figma input format specification
│       ├── figma-collector.md      # Figma context, variables, and screenshot collector
│       ├── design-system-analyzer.md        # Design system guide loader + domain discovery
│       ├── design-system-figma-rules.md     # Fetch design system rules from Figma
│       ├── design-system-codebase-analysis.md # Detect design system patterns in codebase
│       ├── design-system-rules-prompt.md    # Design System Init orchestrator
│       ├── code-analyzer.md        # Extract UI properties from code
│       ├── code-generator.md       # Code generator (BUILD / FIX modes)
│       ├── comparer.md             # Figma ↔ Code comparer
│       ├── fit-finish.md           # Fit-Finish pipeline orchestrator
│       └── gen-code.md             # Gen-Code pipeline orchestrator
├── helix-design-system-init/       # Sub-skill: design system initialization
│   └── SKILL.md
├── helix-fit-finish/               # Sub-skill: fit-finish comparison
│   └── SKILL.md
└── helix-gen-code/                 # Sub-skill: code generation
    └── SKILL.md
```

---

## Overall Architecture

```
User Request
  │
  ▼
helix/SKILL.md  (router)
  │
  ├─ MCP precheck  (mcp-precheck.md)
  │
  ├──▶ helix-fit-finish         → Compare Figma vs code, generate mismatch report
  ├──▶ helix-gen-code            → Generate production-ready code from Figma
  └──▶ helix-design-system-init  → Generate .github/design-system-guide.md
```

The router skill dispatches to one of three specialized sub-skills based on user intent. All workflows depend on **Figma MCP** and a centralized **design system guide** at `.github/design-system-guide.md`.

---

## Mapping to the VSCode Extension (`src/`)

The skill pack is a translation of the `src/` Chat Extension architecture into the Claude Code skill environment:

| `src/` Component | Skill Pack Equivalent | Key Difference |
|---|---|---|
| `IntentAnalyzerAgent.ts` | `helix/SKILL.md` (router) | `src` uses LLM for intent analysis; skill uses keyword routing |
| `FigmaAnalyzerAgent.ts` | `helix-figma-collector` subagent | `src` calls `figmaService.ts` directly; skill calls MCP tools via subagent |
| `DesignSystemAnalyzerAgent.ts` | `helix-design-system-analyzer` subagent | Both dynamically discover domains via LLM |
| `CodeAnalyzerAgent.ts` | `helix-code-analyzer` subagent | Aligned |
| `ComparerAgent.ts` | `helix-comparer` subagent | `src` runs UIPart × Domain Cartesian product in parallel; skill processes by domain |
| `CodeGeneratorAgent.ts` | `helix-code-generator` subagent | Aligned (BUILD / FIX dual mode) |
| `PlannerAgent.ts` | `helix-planner` subagent | Now implemented; produces token mapping plan for code generator |
| `UnifiedFigmaTask.ts` | `helix-fit-finish/SKILL.md` / `helix-gen-code/SKILL.md` | `src` is a single unified orchestrator; skill uses two dedicated orchestrators |
| `commandPresets.ts` | Pipeline definitions in each SKILL.md | Aligned |

---

## Core Concepts

### 1. Design Domains — Dynamic Discovery

Domains are **never hardcoded**. The `DesignSystemAnalyzerAgent` (and `design-system-analyzer.md`) uses an LLM to read `.github/design-system-guide.md` and discover all domains present in the project:

```
.github/design-system-guide.md
         │
         ▼
  LLM: "Identify ALL design domains present in this documentation.
        Do NOT limit yourself to predefined domains."
         │
         ▼
  Dynamic domain list — examples:
  ┌────────────────────────────────────────┐
  │ colors, typography, spacing, layout,   │
  │ effects, iconography, motion, ...      │
  └────────────────────────────────────────┘
```

Each domain carries `{ name, description, tokens }`. The Comparer and Code Generator operate on this dynamic list, so the skill works with any design system without modification.

### 2. Intent Analysis and Focus Areas

1. The router extracts **focusAreas** from the user prompt (e.g., `"check the typography and colors"` → `"typography, colors"`).
2. `focusAreas` flows through the entire pipeline and is used to filter the dynamic domain list, reducing unnecessary work.
3. If the user does not specify, `focusAreas` is empty and all discovered domains are processed.

### 3. Design System Guide

Located at `.github/design-system-guide.md` (searched from the current directory up to the git root). This file is the central reference for all workflows:

- Generated / updated by `helix-design-system-init`
- Consumed by both Fit-Finish and Gen-Code
- Contains: token definitions, component specs, accessibility and localization patterns

---

## Workflow Details

### Workflow 1: Design System Init

**Goal**: Generate the design system guide from Figma rules + codebase analysis.

**Entry point**: `helix-design-system-init/SKILL.md`

```
┌─────────────────────┐    ┌──────────────────────────┐
│ Figma Rules Fetcher  │    │ Codebase Analyzer        │
│ (design-system-      │    │ (design-system-codebase- │
│  figma-rules.md)     │    │  analysis.md)            │
│                      │    │                          │
│ Calls MCP:           │    │ Scans code for tokens,   │
│ create_design_       │    │ themes, component        │
│ system_rules         │    │ patterns, and framework  │
└────────┬────────────┘    └────────┬─────────────────┘
         │                          │
         ▼                          ▼
    ┌────────────────────────────────────┐
    │          Synthesizer               │
    │  (design-system-rules-prompt.md)   │
    └────────────────┬───────────────────┘
                     ▼
        .github/design-system-guide.md
```

---

### Workflow 2: Fit-Finish

**Goal**: Compare Figma design against code implementation, identify visual/layout differences, and generate fix recommendations.

**Entry point**: `helix-fit-finish/SKILL.md`

**Required inputs**: Figma target (node ID or URL) + code file path

#### Pipeline (ref: `commandPresets.ts:52-92` in the VSCode extension)

```
  Phase 1 (parallel):
  ┌──────────────────────┐  ┌──────────────────────┐
  │ DesignSystemAnalyzer  │  │ CodeAnalyzer          │
  │                       │  │                       │
  │ Load guide →          │  │ Read code → extract   │
  │ LLM: dynamic domain   │  │ UI properties and     │
  │ discovery →           │  │ token usage           │
  │ outputs domains[]     │  │                       │
  └──────────┬────────────┘  └──────────┬────────────┘
             │                          │
             ▼                          │
  Phase 2:                              │
  ┌──────────────────────┐              │
  │ FigmaCollector        │              │
  │                       │              │
  │ For each node, call   │              │
  │ MCP: design_context + │              │
  │ variable_defs +       │              │
  │ screenshot            │              │
  └──────────┬────────────┘              │
             │  ┌────────────────────────┘
             ▼  ▼
  Phase 3:
  ┌──────────────────────────────────────────────┐
  │ Comparer                                     │
  │                                              │
  │ Build task matrix:                           │
  │   UIParts × Domains → ComparisonTask[]       │
  │                                              │
  │ Execute tasks (parallel if possible):         │
  │   each task = one LLM call                   │
  │ Merge and group results by domain            │
  └──────────┬───────────────────────────────────┘
             ▼
  Phase 4 (optional):
  ┌──────────────────────┐
  │ CodeGenerator (FIX)  │
  │                       │
  │ Apply minimal code    │
  │ fixes from diff list  │
  └──────────────────────┘
```

#### Example: 5 Nodes, 6 Domains → 48 Comparison Tasks

```
Inputs: 5 Figma nodes + 1 code file
  │
  ▼ Phase 1 (parallel)
  ┌─────────────────────────────┬──────────────────────────────┐
  │ DesignSystemAnalyzer        │ CodeAnalyzer                 │
  │                             │                              │
  │ 1. Load design-system-guide │ 1. Read code file            │
  │ 2. LLM → 6 domains:         │ 2. Extract UI properties     │
  │    colors, typography,      │ 3. Flag token usage vs       │
  │    spacing, layout,         │    hardcoded values          │
  │    effects, iconography     │                              │
  │ 3. Each domain with tokens  │ Output: implementationContext│
  │                             │   { files, tokenUsage }      │
  │ Output: { domains[] }       │                              │
  └──────────────┬──────────────┴──────────────┬───────────────┘
                 │                             │
                 ▼ Phase 2                     │
  ┌──────────────────────────────┐             │
  │ FigmaCollector               │             │
  │                              │             │
  │ For each of 5 nodes, call:   │             │
  │   get_design_context         │             │
  │   get_variable_defs          │             │
  │   get_screenshot             │             │
  │                              │             │
  │ Decompose into 8 UIParts     │             │
  │ Output: { root.children[8] } │             │
  └──────────────┬───────────────┘             │
                 │  ┌──────────────────────────┘
                 ▼  ▼ Phase 3
  ┌────────────────────────────────────────────────────┐
  │ Comparer                                           │
  │                                                    │
  │ 8 UIParts × 6 Domains = 48 ComparisonTasks        │
  │                                                    │
  │ ┌──────────────┬──────────────┬──────────────┐    │
  │ │ part1×colors │ part1×typo   │ part1×spacing│    │
  │ │ part1×layout │ part1×effects│ part1×icon   │    │
  │ │ part2×colors │ ...          │ part8×icon   │    │
  │ └──────────────┴──────────────┴──────────────┘    │
  │                                                    │
  │ Merge 48 results → grouped report                  │
  └────────────────────────────────────────────────────┘
                 ▼ Phase 4 (optional)
  ┌──────────────────────────────────────────────────┐
  │ CodeGenerator (FIX mode)                         │
  │ Minimal targeted fixes from compareResult.diffs[]│
  └──────────────────────────────────────────────────┘
```

---

### Workflow 3: Gen-Code

**Goal**: Generate production-ready code from Figma designs, following project design system constraints.

**Entry point**: `helix-gen-code/SKILL.md`

#### Pipeline (ref: `commandPresets.ts:14-45` in the VSCode extension)

```
  Phase 1:
  ┌──────────────────────┐
  │ DesignSystemAnalyzer  │
  │                       │
  │ Load guide →          │
  │ LLM: dynamic domain   │
  │ discovery →           │
  │ outputs domains[]     │
  └──────────┬────────────┘
             │
             ▼ Phase 2
  ┌──────────────────────┐
  │ FigmaCollector        │
  │                       │
  │ For each node, call   │
  │ MCP: design_context + │
  │ variable_defs         │
  │                       │
  │ Output: UIParts[]     │
  └──────────┬────────────┘
             │
             ▼ Phase 3
  ┌──────────────────────┐
  │ Planner               │
  │                       │
  │ Figma UIParts +       │
  │ Design System →       │
  │ Implementation plan   │
  └──────────┬────────────┘
             │
             ▼ Phase 4
  ┌──────────────────────────────────────────────┐
  │ CodeGenerator (BUILD mode)                   │
  │                                              │
  │ Per domain: map tokens → code references     │
  │ UIPart hierarchy → component structure       │
  │ Accessibility + localization + theme support │
  │                                              │
  │ Output: complete code file(s)                │
  └──────────────────────────────────────────────┘
```

**Code Generator modes**:
- **BUILD**: Generate new code from Figma + design system (Gen-Code Phase 4)
- **FIX**: Apply minimal targeted fixes from Comparer results (Fit-Finish Phase 4)

---

## Shared Reference Components

| Component | File | Role | MCP Tools Called |
|---|---|---|---|
| **MCP Precheck** | `mcp-precheck.md` | Verify Figma MCP is configured and reachable | Checks `.vscode/mcp.json` |
| **Figma Input** | `figma-input.md` | Define two input methods: Desktop selection / URL + node-id | — |
| **Figma Collector** | `figma-collector.md` | Collect design context, variables, screenshots | `get_design_context`, `get_variable_defs`, `get_metadata`, `get_screenshot` |
| **Design System Analyzer** | `design-system-analyzer.md` | Load and analyze design system guide | — |
| **Code Analyzer** | `code-analyzer.md` | Extract UI properties and token usage from code | — |
| **Comparer** | `comparer.md` | UIPart × Domain comparison, outputs diff report | — |
| **Code Generator** | `code-generator.md` | Generate or fix code (BUILD / FIX modes) | — |

---

## Data Flow Summary

```
Figma MCP ──▶ Figma Context + Variables
                     │
                     ▼
.github/design-system-guide.md ◀── Design System Init
         │
         │  LLM: dynamic domain discovery
         ▼
  ┌─ domains[] ─────────────────────────────────┐
  │  (extracted from guide content, not hardcoded)│
  │                                              │
  │     ┌──────────────┬──────────────┐          │
  │     ▼              ▼              ▼          │
  │  Fit-Finish    Gen-Code      focusAreas      │
  │  (UIPart×Dom)  (per-domain)  (optional filter)│
  │     │              │                         │
  │     ▼              ▼                         │
  │  reports/     output.(tsx|swift|...)         │
  └──────────────────────────────────────────────┘
```
