# Design System Init: Codebase Analysis

## Goal

Analyze the codebase to extract design system implementation patterns and requirements.

## Required Focus Areas

- Localization: string formats, keys, and usage patterns
- Accessibility: labels, traits, keyboard navigation, screen reader support
- Token usage: colors, typography, spacing, sizing
- Component patterns and file paths
- Framework detection: React/Vue/Angular/Svelte/Tailwind or platform-specific stacks

## Detection Hints

Auto-detect design system sources by scanning common paths:

- `**/tokens/**/*.{json,js,ts}`
- `**/design-tokens/**/*.{json,js,ts}`
- `**/theme/**/*.{json,js,ts}`
- `**/styles/tokens/**/*.{json,js,ts}`
- `**/tailwind.config.{js,ts}`
- `**/styles/variables.{css,scss,less}`

If `package.json` exists, infer framework from dependencies.

## Output

- Implementation patterns and examples
- File paths and conventions
- Notes for guide sections: Quick Reference, Token Mapping, Code Examples, Best Practices
- Detected framework/platform summary
