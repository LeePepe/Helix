# Code Analyzer (Fit/Finish) — sequential fallback

Use only when the Agent tool is unavailable. Canonical spec: `agents/helix-code-analyzer.md`.

## Goal

Read implementation files, extract UI properties and design-system token usage, and write structured context for the Comparer — without inlining source.

## Steps

1. Resolve `code_paths` from git root. Read files explicitly named; do not crawl imports.
2. Interpret token APIs from the design-system guide; only open extra files when the guide doesn't cover an API.
3. Extract per file: colors, typography, layout, spacing, token usage, and hardcoded values tagged with line numbers.
4. Write `phase1-code-context.json` with `implementationContext.filePaths` (paths only) + `extractedProperties`. The Comparer re-reads source on demand. Record `missingFiles`.
