# Helix Skill Pack for Claude Code

A set of Claude Code skills that bring [Helix](../../README.md) workflows into your terminal — compare Figma designs against your code and generate production-ready UI components, all without leaving the CLI.

## Skills

| Skill | Command | Description |
|---|---|---|
| `helix` | `$helix` | Router — dispatches to the right sub-skill based on your request |
| `helix-fit-finish` | `$helix-fit-finish` | Compare a Figma node against code, get a mismatch report with fix suggestions |
| `helix-gen-code` | `$helix-gen-code` | Generate production-ready code from a Figma node using your design system |
| `helix-design-system-init` | `$helix-design-system-init` | Generate `.github/design-system-guide.md` from Figma + codebase analysis |

## Prerequisites

1. **Claude Code** — [install guide](https://claude.ai/code)
2. **Figma MCP server** — one of:
   - **Figma Desktop** (recommended): Figma app → Preferences → enable "Allow MCP connections". Exposes a local server at `http://127.0.0.1:3845/mcp`.
   - **Figma Remote MCP**: No desktop app required. Uses `https://mcp.figma.com/mcp`.

## Installation

### 1. Install skills

Copy the skill directories into your project or your global Claude Code skills directory:

```bash
# Option A: project-level (skills available only in this repo)
cp -r helix-skill/helix                    .claude/skills/
cp -r helix-skill/helix-fit-finish         .claude/skills/
cp -r helix-skill/helix-gen-code           .claude/skills/
cp -r helix-skill/helix-design-system-init .claude/skills/

# Option B: user-level (skills available in all repos)
cp -r helix-skill/helix                    ~/.claude/skills/
cp -r helix-skill/helix-fit-finish         ~/.claude/skills/
cp -r helix-skill/helix-gen-code           ~/.claude/skills/
cp -r helix-skill/helix-design-system-init ~/.claude/skills/
```

### 2. Install subagents

The fit-finish and gen-code workflows use parallel subagents. Install them to `~/.claude/agents/` so they can be launched by the orchestrators:

```bash
cp helix-skill/helix/agents/helix-design-system-analyzer.md ~/.claude/agents/
cp helix-skill/helix/agents/helix-code-analyzer.md          ~/.claude/agents/
cp helix-skill/helix/agents/helix-figma-collector.md        ~/.claude/agents/
cp helix-skill/helix/agents/helix-comparer.md               ~/.claude/agents/
cp helix-skill/helix/agents/helix-planner.md                ~/.claude/agents/
cp helix-skill/helix/agents/helix-code-generator.md         ~/.claude/agents/
```

Or install everything in one command:

```bash
cp helix-skill/helix/agents/*.md ~/.claude/agents/
```

Then add the Figma MCP server to `.vscode/mcp.json` in your project root (the skills will guide you through this if the file is missing):

```json
{
  "servers": {
    "figma-desktop": {
      "type": "http",
      "url": "http://127.0.0.1:3845/mcp"
    }
  }
}
```

For the Remote MCP variant:

```json
{
  "servers": {
    "figma": {
      "type": "http",
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
```

## Usage

### First-time setup

Run the design system init skill to generate the guide that all other workflows depend on:

```
$helix-design-system-init
```

This fetches your Figma design system rules and scans your codebase to produce `.github/design-system-guide.md`. Re-run it whenever your design system changes significantly.

### Compare Figma vs code (fit-finish)

```
$helix-fit-finish

# Or via the router:
$helix  compare this Figma component to my Button.tsx
```

You will be asked for:
- **Figma target**: select in Figma Desktop, or paste a Figma URL with `node-id`
- **Code file path**: relative or absolute path to the file to compare

The skill runs a 4-phase pipeline and delivers a report grouped by design domain (colors, typography, spacing, …) with prioritized fixes. Optionally applies fixes automatically.

### Generate code from Figma

```
$helix-gen-code

# Or via the router:
$helix  generate a SwiftUI card component from this Figma frame
```

You will be asked for:
- **Figma target**: Desktop selection or URL with `node-id`
- *(optional)* Output file path, framework hint, focus areas

The skill analyzes your design system, collects Figma context, plans the implementation, and generates complete code using your project's actual tokens and conventions.

### Use the router

```
$helix  <your request>
```

The `helix` skill reads your intent and delegates to the right sub-skill. Use it when you are not sure which sub-skill applies, or when you want a single entry point.

### Focus areas

Any skill accepts a `focusAreas` hint to narrow the analysis to specific design domains:

```
$helix-fit-finish  check only typography and spacing
$helix-gen-code    focus on colors and accessibility
```

This reduces the number of LLM calls when you know what aspect you care about.

## How It Works

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a detailed breakdown of the pipeline, data flow, and mapping to the VSCode extension source.

**Short version**: each workflow is a sequential pipeline of shared reference agents (`references/` directory). The design system guide is the central data source — it is generated once by `helix-design-system-init` and read by every subsequent workflow. Design domains are **never hardcoded**; they are discovered dynamically from the guide, so the skills adapt to any design system.

## File Structure

```
helix-skill/
├── README.md                        # This file
├── ARCHITECTURE.md                  # Full pipeline and architecture docs
├── helix/                           # Router skill + shared resources
│   ├── SKILL.md                     # Router entry point
│   ├── agents/                      # Subagent definitions (install to ~/.claude/agents/)
│   │   ├── openai.yaml              # Agent interface config
│   │   ├── helix-design-system-analyzer.md
│   │   ├── helix-code-analyzer.md
│   │   ├── helix-figma-collector.md
│   │   ├── helix-comparer.md
│   │   ├── helix-planner.md
│   │   └── helix-code-generator.md
│   └── references/                  # Detailed spec docs for agents
│       ├── mcp-precheck.md
│       ├── figma-input.md
│       ├── figma-collector.md
│       ├── design-system-analyzer.md
│       ├── design-system-figma-rules.md
│       ├── design-system-codebase-analysis.md
│       ├── design-system-rules-prompt.md
│       ├── code-analyzer.md
│       ├── code-generator.md
│       ├── comparer.md
│       ├── fit-finish.md
│       └── gen-code.md
├── helix-design-system-init/SKILL.md
├── helix-fit-finish/SKILL.md        # Orchestrator: parallel Phase 1 subagents
└── helix-gen-code/SKILL.md          # Orchestrator: sequential pipeline subagents
```

## Troubleshooting

**MCP tools not found**: Make sure Figma Desktop is running with MCP enabled, or that your `mcp.json` points to the correct URL. Run `$helix-design-system-init` — it includes an interactive MCP setup flow.

**Design system guide missing**: Run `$helix-design-system-init` first. The guide is required by `helix-fit-finish` and `helix-gen-code`.

**Figma URL without node-id**: The URL must include `?node-id=...`. In Figma Desktop, right-click a frame → "Copy link to selection" to get a URL with the correct node ID.
