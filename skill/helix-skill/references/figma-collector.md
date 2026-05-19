# Figma Collector

## Goal

Fetch Figma design context, variables, and (optional) screenshots for each input node via MCP tool calls. Produce a structured result containing UIParts for downstream analysis.

Reference: `src/agents/FigmaAnalyzerAgent.ts`, `src/services/figmaService.ts`

## Inputs

- Figma Desktop selection, or
- One or more Figma URLs with node-id, or
- One or more direct node IDs

See `references/figma-input.md` for input formats.

## Precheck

Before fetching, validate MCP availability per `references/mcp-precheck.md`. If Desktop MCP is not connected, show setup steps and allow the user to retry.

## Actions

### 1. Parse and collect node IDs

- If input is a Figma URL, extract `node-id` from query parameter.
- If input contains multiple URLs (space/comma/newline separated), parse each.
- Normalize all node IDs: convert `123-456` or `123_456` to `123:456`.
- Deduplicate, preserving order.

### 2. Fetch data for each node (parallel when possible)

For **each** node ID, call the following MCP tools:

**a) Get metadata** (lightweight structure overview):

```text
mcp__figma-desktop__get_metadata(nodeId: "123:456")
```

- Returns XML structure with layer names, types, positions, sizes.
- Use this for structure analysis (identifying UIParts).

**b) Get design context** (full design data):

```text
mcp__figma-desktop__get_design_context(nodeId: "123:456")
```

- Returns complete design information: layout, styles, components, variants.
- This is the primary data source for comparison and code generation.

**c) Get variable definitions** (design tokens):

```text
mcp__figma-desktop__get_variable_defs(nodeId: "123:456")
```

- Returns color, typography, spacing, and other token definitions.
- Links Figma styles to design system tokens.

**d) Get screenshot** (optional, for visual reference):

```text
mcp__figma-desktop__get_screenshot(nodeId: "123:456")
```

- Provides a visual reference for the component.
- Optional — skip if not needed or if MCP call fails.

### 3. Handle multiple nodes

When multiple node IDs are provided:

- Fetch data for each node independently.
- Combine metadata from all nodes, annotating which data belongs to which node:

  ```xml
  <!-- Node 1: 123:456 -->
  {metadata for node 1}

  <!-- Node 2: 789:012 -->
  {metadata for node 2}
  ```

- Combine design context similarly.

### 4. Structure analysis (LLM call)

After collecting raw Figma data, use the LLM to identify the logical structure.

The goal is **format normalization**: regardless of node complexity, always produce a `parts[]` array so downstream phases consume a uniform `UIPart[]` interface.

- **Input**: Combined metadata from all nodes.
- **Output**: Structure analysis identifying:
  - `type`: single | composite | variants
  - `rootName`: Name of the root element
  - `rootRole`: Role (e.g., "Page", "Component Set")
  - `parts[]`: Array of UIParts, each with:
    - `id`: Figma node ID
    - `name`: Human-readable name
    - `description`: What this part represents
    - `type`: container | component | variant | single

**Decomposition rules**:

- `type: single` — the node itself is the only UIPart. `parts[]` contains exactly one entry representing the node directly.
- `type: composite` — the node contains multiple distinct sub-components. Each becomes an independent UIPart in `parts[]`.
- `type: variants` — the node is a component set with multiple variant states. Each variant becomes an independent UIPart in `parts[]`.

This decomposition determines the UIPart axis for the downstream UIPart × Domain task matrix.

### 5. Detailed analysis per part (LLM call)

For each identified UIPart, perform deep analysis using the design context:

- Extract component properties, styles, layout rules.
- Identify auto-layout configuration, constraints.
- Extract variant/state information.
- Map Figma styles to variable references.

### 6. Error handling

- Retry once on transient MCP failures (network timeout, connection reset).
- If a node fails after retry, log warning and continue with remaining nodes.
- If ALL nodes fail, stop and report the error.

## Output

The output feeds into Comparer, CodeGenerator, and other downstream agents:

- `root`: Root UIPart with `children[]` array containing all identified UIParts
- `metadata`: Combined metadata string from all nodes
- `designContext`: Combined design context string from all nodes
- `schemaVersion`: "1.0"

**Critical**: The `root.children[]` array defines the UIPart axis for the UIPart × Domain task matrix. Each child is independently compared against each design domain.
