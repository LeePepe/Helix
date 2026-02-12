# Fit/Finish Flow (Orchestrator)

Use separate subagents for each phase and load only the relevant reference:

1. Figma Context Collector → `references/figma-collector.md`
2. Design System Analyzer → `references/design-system-analyzer.md`
3. Code Analyzer → `references/code-analyzer.md`
4. Comparator → `references/comparer.md`

This flow must segment work by design system domains and report per-domain results.

If the environment supports focus areas or parallel groups, align domain-specific work accordingly (e.g., run colors/typography/spacing in parallel).
