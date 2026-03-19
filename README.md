# Helix: Design-to-Code Workflows

AI-powered workflows for comparing Figma designs against code and generating production-ready UI components. Available as a **VSCode extension** and a **Claude Code skill pack**.

## What It Does

| Command | Description |
|---|---|
| `/fit-finish` | Compare a Figma node against your code — find color, typography, spacing, and layout mismatches, get a prioritized report with fix suggestions |
| `/gen-code` | Generate production-ready code from a Figma node using your project's design system tokens and conventions |

Both workflows require a **Figma MCP connection** and a **design system guide** (`.github/design-system-guide.md`). If the guide is missing, run the design system init workflow first.

---

## Option A: VSCode Extension

Use Helix directly inside VSCode Chat with the `@helix` participant.

### Quick Start

1. Select a frame in **Figma Desktop** (or copy a Figma URL with `node-id`)
2. Open VSCode Chat and type `@helix`
3. Run a command:

```
@helix /fit-finish src/components/Button.tsx
@helix /gen-code https://figma.com/file/ABC?node-id=123:456
```

### Installation

**From source:**

```bash
git clone https://github.com/your-org/helix
cd helix
npm install
npm run esbuild
# Press F5 in VSCode to launch Extension Development Host
```

**Package as .vsix:**

```bash
npm run package
```

### Prerequisites

- **Figma MCP Server** — configure in `.vscode/mcp.json`:

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

  Then open Figma Desktop → Preferences → enable "Allow MCP connections".

- **AI Provider** — GitHub Copilot or a compatible language model

- **Design System Guide** — `.github/design-system-guide.md` (see [design system init](#design-system-guide))

### Configuration

```json
{
  "helix.designSystemPath": ".github/design-system-guide.md",
  "helix.reportsPath": ".github/helix/reports",
  "helix.modelFamily": "claude-sonnet-4.5",
  "helix.enableRemoteFigma": false
}
```

### Commands

```bash
npm run esbuild          # Build
npm run esbuild-watch    # Build and watch
npm run lint             # ESLint
npm run test             # Run tests (vitest)
npm run test:coverage    # Tests with coverage report
npm run package          # Create .vsix
```

---

## Option B: Claude Code Skill Pack

Use the same workflows from your terminal via Claude Code — no VSCode required.

```bash
$helix           # Router: auto-detect intent and dispatch
$helix-fit-finish
$helix-gen-code
$helix-design-system-init
```

The skill pack uses a **parallel subagent architecture**: fit-finish Phase 1 launches two independent agents simultaneously (design system analysis + code analysis), reducing total runtime.

### Installation

```bash
# 1. Copy skills
cp -r skill/helix-skill/helix                    ~/.claude/skills/
cp -r skill/helix-skill/helix-fit-finish         ~/.claude/skills/
cp -r skill/helix-skill/helix-gen-code           ~/.claude/skills/
cp -r skill/helix-skill/helix-design-system-init ~/.claude/skills/

# 2. Copy subagents
cp skill/helix-skill/helix/agents/*.md ~/.claude/agents/
```

See [skill/helix-skill/README.md](skill/helix-skill/README.md) for full usage details and troubleshooting.

---

## Design System Guide

Both the VSCode extension and the skill pack require `.github/design-system-guide.md`. Generate it with:

- **VSCode**: `@helix` then ask to initialize the design system guide
- **Claude Code**: `$helix-design-system-init`

This fetches design system rules from Figma and scans your codebase to produce a token mapping reference that all downstream workflows use.

---

## Project Structure

```
helix/
├── src/                             # VSCode extension source
│   ├── extension.ts                 # Activation entry point
│   ├── participants/                # VSCode chat participant
│   │   ├── helixParticipant.ts     # Command routing
│   │   └── TaskOrchestrator.ts     # Pipeline orchestration
│   ├── agents/                      # Domain intelligence
│   │   ├── base/                   # BaseAgent<I,O> class
│   │   ├── prompts/                # Agent system prompts (markdown)
│   │   ├── FigmaAnalyzerAgent.ts
│   │   ├── DesignSystemAnalyzerAgent.ts
│   │   ├── CodeAnalyzerAgent.ts
│   │   ├── ComparerAgent.ts
│   │   ├── PlannerAgent.ts
│   │   └── CodeGeneratorAgent.ts
│   ├── tasks/                       # Pipeline orchestration
│   │   ├── UnifiedFigmaTask.ts
│   │   └── commandPresets.ts       # fit-finish and gen-code pipelines
│   ├── contracts/                   # Zod schemas + TypeScript types
│   ├── runtime/                     # ExecutionContext, ArtifactStore, ToolRegistry
│   └── services/                    # LLM, Figma MCP, file I/O, cache
│
├── skill/helix-skill/               # Claude Code skill pack
│   ├── README.md                    # Skill pack usage guide
│   ├── ARCHITECTURE.md             # Pipeline and data flow docs
│   ├── helix/                       # Router skill + shared resources
│   │   ├── SKILL.md
│   │   ├── agents/                 # Subagent definitions (~/.claude/agents/)
│   │   └── references/             # Detailed spec docs for each phase
│   ├── helix-fit-finish/SKILL.md   # Parallel orchestrator
│   ├── helix-gen-code/SKILL.md     # Sequential orchestrator
│   └── helix-design-system-init/SKILL.md
│
└── .github/
    └── design-system-guide.md      # Generated token reference (gitignored by default)
```

---

## Troubleshooting

**"Figma MCP tools not found"**
Open Figma Desktop → Preferences → enable "Allow MCP connections". Then reload VSCode / Claude Code to pick up the `.vscode/mcp.json` config.

**"Design system guide not found"**
Run the design system init workflow first. The guide is required by both fit-finish and gen-code.

**"No language model available" (VSCode)**
Install GitHub Copilot or a compatible AI provider and ensure it is authenticated.

---

## License

MIT
