# Helix: Design-to-Code Skills for Claude Code

AI-powered Claude Code skills for comparing Figma designs against your code and generating production-ready UI components — all from your terminal.

## Skills

| Skill | Command | Description |
|---|---|---|
| `helix` | `$helix` | Router — auto-detects intent and dispatches to the right sub-skill |
| `helix-fit-finish` | `$helix-fit-finish` | Compare a Figma node against code — color/typography/spacing/layout mismatches with prioritized fixes |
| `helix-gen-code` | `$helix-gen-code` | Generate production-ready code from a Figma node using your design system tokens |
| `helix-design-system-init` | `$helix-design-system-init` | Generate `.github/design-system-guide.md` from Figma + codebase analysis |

The fit-finish and gen-code workflows use a **parallel subagent architecture**: Phase 1 launches independent agents (design-system analysis + code analysis) simultaneously to cut runtime.

## Prerequisites

1. **Claude Code** — [install guide](https://claude.ai/code)
2. **Figma MCP server** — one of:
   - **Figma Desktop** (recommended): Figma → Preferences → enable "Allow MCP connections". Local server at `http://127.0.0.1:3845/mcp`.
   - **Figma Remote MCP**: no desktop app; uses `https://mcp.figma.com/mcp`.

   Add it to `.mcp.json` in your project root (legacy `.vscode/mcp.json` also works) — the skills walk you through this if missing:
   ```json
   { "mcpServers": { "figma-desktop": { "type": "http", "url": "http://127.0.0.1:3845/mcp" } } }
   ```
3. **Design system guide** — `.github/design-system-guide.md`. Required by fit-finish and gen-code. If missing, run `$helix-design-system-init` first.

## Installation

### Option A: Plugin (recommended)

```bash
claude plugin marketplace add LeePepe/Helix
claude plugin install helix@helix
```

Skills (`$helix`, `$helix-fit-finish`, …) and the six subagents are bundled and enabled automatically. To install from a local clone instead: `claude plugin marketplace add ./`.

### Option B: Manual copy

Skills depend on `helix/references/`, so all four must be installed as siblings.

```bash
# user-level (all repos) — drop the ~ for project-level (.claude/skills in this repo only)
cp -r skills/helix skills/helix-fit-finish skills/helix-gen-code skills/helix-design-system-init ~/.claude/skills/
cp agents/helix-*.md ~/.claude/agents/
```

## Usage

```bash
$helix-design-system-init          # first-time setup: generate the design system guide
$helix-fit-finish                  # compare Figma vs code, get a fix report
$helix-gen-code                    # generate code from Figma
$helix  <your request>             # router — picks the right sub-skill
```

**Ultracode mode**: say "ultracode" (or ask for a thorough pass) and fit-finish/gen-code run a Workflow-driven pipeline — per-UIPart fan-out with 3-lens adversarial diff verification, or a 3-plan judge panel before BUILD. Falls back to manual phases if Workflow is unavailable.

Each skill asks for a **Figma target** (Desktop selection or URL with `node-id`) and, where relevant, a file path. Append a focus hint to narrow scope: `$helix-fit-finish check only typography and spacing`.

## Project Structure

```
.claude-plugin/marketplace.json    # marketplace + plugin manifest
.claude-plugin/plugin.json         # plugin metadata
skills/
├── helix/                         # router + shared references/
├── helix-fit-finish/              # parallel orchestrator
├── helix-gen-code/                # sequential orchestrator
└── helix-design-system-init/      # design system guide generator
agents/                            # six subagents launched by the orchestrators
```

## Troubleshooting

- **Figma MCP not found**: ensure Figma Desktop has MCP enabled or `mcp.json` URL is correct. `$helix-design-system-init` includes setup help.
- **Design system guide missing**: run `$helix-design-system-init` first.
- **URL without node-id**: Figma URLs must include `?node-id=...`. Right-click a frame → "Copy link to selection".

## License

MIT
