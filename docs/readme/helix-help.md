# Helix Design Workflows

I can help you with Figma design-to-code workflows:

## Available Commands

### /fit-finish
Compare Figma design with code implementation and identify differences.

**Usage**: `@helix /fit-finish [figma-url] <code-file-path>`

**Provide Figma Context**:
- **Selection**: Select element in Figma Desktop (no URL needed)
- **URL**: Provide full Figma URL as argument

**Examples**:
```
# With Desktop selection:
@helix /fit-finish compare selected figma node with src/Button.swift

# With Figma URL:
@helix /fit-finish https://figma.com/file/ABC?node-id=123:456 src/Button.swift
```

### /gen-code
Generate production-ready code from Figma design.

**Usage**: `@helix /gen-code [figma-url]`

**Provide Figma Context**:
- **Selection**: Select element in Figma Desktop (no URL needed)
- **URL**: Provide full Figma URL as argument

**Examples**:
```
# With Desktop selection:
@helix /gen-code implement selected Figma UI

# With Figma URL:
@helix /gen-code https://figma.com/file/ABC?node-id=789:012
```
