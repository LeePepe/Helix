# Helix Design Workflows

I can help you with Figma design-to-code workflows:

## Available Commands

### /fit-finish
Compare Figma design with code implementation and identify differences.

**Usage**: `@helix /fit-finish [figma-url] <code-file-path>`

**Examples**:
```
# With Figma URL:
@helix /fit-finish https://figma.com/file/ABC?node-id=123:456 src/Button.swift

# With Desktop selection (no URL needed):
@helix /fit-finish src/Button.swift
```

### /gen-code
Generate production-ready code from Figma design.

**Usage**: `@helix /gen-code [figma-url]`

**Examples**:
```
# With Figma URL:
@helix /gen-code https://figma.com/file/ABC?node-id=789:012

# With Desktop selection (no URL needed):
@helix /gen-code
```

## Prerequisites
