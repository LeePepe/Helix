---
description: 'Quick Fit & Finish: Compare Figma design with code implementation'
agent: 'DesignDev'
tools: ['edit', 'search', 'figma-desktop/*', 'figma/*', 'runCommands', 'vscodeAPI', 'problems', 'changes']
---

# Fit & Finish: Design vs Code Comparison

Compare Figma design with code implementation, identify differences, and offer automated fixes.

## Prerequisites

**Before starting**: Run health check as defined in [prerequisites.md](../ui-fit-finish/prerequisites.md)

Required:
- ✅ Figma MCP tools available
- ✅ Context files valid (project-info.md, memory.json)

If prerequisites fail, follow initialization guides before proceeding.

---

## Input Required

1. **Figma Target**: ${input:figmaUrl:Figma URL or node ID (e.g., https://figma.com/file/...?node-id=123:456)}
2. **Code File Path**: ${input:codePath:Code file path (absolute or relative from project root)}

**Tip**: If component exists in memory, say "Compare [component name] from memory"

---

## Workflow

This task will:

1. Load context (project-info.md, memory.json)
2. Fetch Figma design specs using MCP tools
3. Read and parse code implementation
4. Compare properties: colors, typography, spacing, dimensions, layout, effects
5. Identify discrepancies (critical vs minor)
6. Offer automated fixes
7. Generate detailed report
8. Update memory with mappings

**Detailed workflow**: [tasks/fit-finish/GUIDE.md](../ui-fit-finish/tasks/fit-finish/GUIDE.md)

---

## Output

- **Console**: Concise summary with match rate and difference count
- **Report**: Detailed markdown saved to `reports/report-[component]-[timestamp].md`
- **Memory**: Updated component mappings in `context/memory.json`

**Report includes**:
- Summary (match rate, differences found, fixes applied)
- Critical differences with fix recommendations
- Minor differences
- Matched properties
- Next steps (review changes, test themes, run build)
