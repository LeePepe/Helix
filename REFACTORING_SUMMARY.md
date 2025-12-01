# Helix Refactoring Summary

## Overview

Successfully refactored the Helix codebase to separate platform/language-agnostic orchestration code from project-specific prompts and configuration.

**Completion Date**: 2025-12-01
**Updated**: 2025-12-01 - Added URL support alongside Desktop selection

---

## Key Changes

### 1. New Services Created

#### PromptService (`src/services/promptService.ts`)
- Loads base prompts from `.github/prompts/*.prompt.md`
- Loads task-specific guides from `.github/ui-fit-finish/tasks/*/GUIDE.md`
- Composes prompts using simple string concatenation (no template variables)
- All platform/language information comes from Design System Guide

#### ConfigService (`src/services/configService.ts`)
- Manages workspace-level file path configuration
- Provides default paths for design system guide, prompts, and task guides
- Simple, focused service with no platform-specific logic

### 2. Enhanced Services

#### DesignSystemService
**New Features**:
- `checkDesignSystemExists()` - Checks if guide file exists
- `loadOrInitialize()` - Loads existing guide or creates new one
- `analyzeCodebase()` - Uses LLM to analyze codebase patterns
- `generateDesignSystemGuide()` - Generates comprehensive guide from analysis
- `saveDesignSystem()` - Saves guide to workspace

**Behavior**: Semi-automatic initialization with user approval

#### FigmaService
**Changes**:
- **Desktop-only support** - Remote Figma URL access disabled
- Only uses `mcp__figma-desktop__*` tools
- Updated error messages guide users to Figma Desktop
- No URL parameter required (uses current Desktop selection)

### 3. Refactored Handlers

#### GenCodeHandler
**Changes**:
- Added `PromptService` dependency
- Removed hardcoded 35-line SwiftUI-specific prompt
- Now loads prompts from external files
- Platform/language agnostic - all specifics come from Design System Guide
- No longer requires Figma URL (uses Desktop selection)

#### FitFinishHandler
**Changes**:
- Added `PromptService` dependency
- Removed hardcoded 48-line comparison prompt
- Now loads prompts from external files
- No longer requires Figma URL (uses Desktop selection)

### 4. Externalized Prompts

#### `.github/prompts/gen-code.prompt.md`
- **Before**: 118 lines with SwiftUI-specific instructions, navigation links, troubleshooting
- **After**: 30 lines, generic code generation instructions
- No platform-specific content
- References Design System Guide for all platform details

#### `.github/prompts/fit-finish.prompt.md`
- **Before**: 61 lines with prerequisites, workflow description, navigation
- **After**: 38 lines, generic comparison instructions
- Focus on analysis categories and output format
- No platform-specific content

### 5. Configuration

#### VSCode Settings (`package.json`)
**Added**:
- `helix.promptsPath` - Path to prompt files directory
- `helix.guidesPath` - Path to task guide files directory

**Existing** (unchanged):
- `helix.designSystemPath` - Path to design system guide
- `helix.reportsPath` - Path for saving reports

### 6. Documentation

#### Created:
- `docs/archive/figma-remote-setup.md` - Archived remote Figma setup docs
- `docs/archive/` directory for archived documentation

---

## Architecture Summary

### Before Refactoring
```
Handler → Hardcoded Prompt (with platform logic) → LLM
         ↓
    Figma URL required
```

### After Refactoring
```
Handler → PromptService → Load from files:
                           - Base Prompt (.prompt.md)
                           - Task Guide (GUIDE.md)
                           - Design System Guide (all platform info)
                         → Compose (simple concatenation)
                         → LLM
         ↓
    Figma Desktop selection (no URL needed)
```

---

## File Changes

### New Files (7)
1. `src/services/promptService.ts` - Prompt loading and composition
2. `src/services/configService.ts` - Configuration management
3. `src/types/config.ts` - TypeScript type definitions
4. `docs/archive/figma-remote-setup.md` - Archived documentation
5. `REFACTORING_SUMMARY.md` - This file

### Modified Files (8)
1. `src/services/designSystemService.ts` - Added initialization workflow
2. `src/services/figmaService.ts` - Desktop-only support
3. `src/participants/helixParticipant.ts` - Inject PromptService
4. `src/participants/commandHandlers/genCodeHandler.ts` - Use PromptService
5. `src/participants/commandHandlers/fitFinishHandler.ts` - Use PromptService
6. `package.json` - Added configuration settings
7. `.github/prompts/gen-code.prompt.md` - Generic prompt
8. `.github/prompts/fit-finish.prompt.md` - Generic prompt

### Unchanged Files (4)
- `src/services/fileService.ts`
- `src/services/reportService.ts`
- `src/extension.ts`
- All GUIDE.md files in `.github/ui-fit-finish/tasks/`

---

## Key Design Decisions

### 1. No Template Variables
**Decision**: Use simple string concatenation instead of template variable substitution
**Rationale**: Simpler implementation, all platform info comes from Design System Guide

### 2. Platform Info in Design System Guide
**Decision**: Store platform, language, and all project-specific info in the Design System Guide
**Rationale**: Single source of truth, generated during initialization

### 3. Semi-Automatic Initialization
**Decision**: Analyze codebase, show summary, request user approval before saving
**Rationale**: User has control but doesn't need to manually write guide

### 4. Figma Desktop Only
**Decision**: Disable remote Figma URL access, support only Desktop selection
**Rationale**: User preference to simplify initial implementation

### 5. Workspace-Level Configuration
**Decision**: All settings at workspace level (no user-level defaults)
**Rationale**: Configuration is project-specific

---

## Usage Changes

### Before Refactoring

**Gen-Code**:
```
@helix /gen-code https://figma.com/file/ABC?node-id=123:456
```

**Fit-Finish**:
```
@helix /fit-finish https://figma.com/file/ABC?node-id=123:456 src/Button.swift
```

### After Refactoring

**Gen-Code**:
```
1. Open Figma Desktop
2. Select component/frame
3. Enable MCP (Shift+D)
4. @helix /gen-code
```

**Fit-Finish**:
```
1. Open Figma Desktop
2. Select component/frame
3. Enable MCP (Shift+D)
4. @helix /fit-finish src/Button.swift
```

---

## Backwards Compatibility

### For End Users
✅ **Mostly compatible** with important changes:
- Existing design system guides load as before
- Commands work identically in flow
- **Breaking**: URL-based Figma access no longer works (must use Desktop)

### For Code (Internal)
⚠️ **Internal breaking changes only**:
- Handler constructors require `PromptService` parameter
- `FigmaService.getDesignContext()` no longer requires URL parameter
- These are internal implementation details
- Extension activation and public API unchanged

---

## Testing Completed

✅ TypeScript compilation successful (no errors)
✅ All new services created and integrated
✅ All handlers refactored successfully
✅ All prompts externalized
✅ Configuration updated

---

## Next Steps for Users

1. **First Time Setup**:
   - Run any Helix command (`@helix /gen-code` or `@helix /fit-finish`)
   - If no design system guide exists, it will be auto-generated
   - Review and approve the generated guide

2. **Figma Desktop Setup**:
   - Install Figma Desktop app
   - Enable Dev Mode (Shift+D)
   - Enable MCP in Dev Mode panel
   - Ensure running on `http://127.0.0.1:3845/mcp`

3. **Configuration** (Optional):
   - Open VSCode settings
   - Search for "Helix"
   - Customize file paths if needed

---

## Implementation Phases Completed

### ✅ Phase 1: Foundation (No Breaking Changes)
- Created PromptService and ConfigService
- Added VSCode configuration
- Created archive directory

### ✅ Phase 2: Design System Initialization
- Added semi-automatic initialization to DesignSystemService
- Implemented codebase analysis
- Added guide generation and saving

### ✅ Phase 3: Figma Service Simplification
- Disabled remote Figma access
- Updated to Desktop-only support
- Archived remote documentation

### ✅ Phase 4: Handler Refactoring
- Refactored GenCodeHandler to use PromptService
- Refactored FitFinishHandler to use PromptService
- Updated HelixParticipant to inject services

### ✅ Phase 5: Prompt Externalization
- Updated gen-code.prompt.md to be generic
- Updated fit-finish.prompt.md to be generic
- All prompts now platform-agnostic

---

## Success Metrics

- **Lines of hardcoded prompts removed**: 83 lines
- **New services created**: 2 (PromptService, ConfigService)
- **Handler constructors updated**: 2 (GenCodeHandler, FitFinishHandler)
- **Prompt files externalized**: 2 (gen-code, fit-finish)
- **Compilation status**: ✅ Success (0 errors)

---

## Conclusion

The refactoring successfully achieved all objectives:
- ✅ Platform/language-agnostic orchestration code
- ✅ Prompts externalized to files
- ✅ No platform-specific logic in code
- ✅ Simple configuration management
- ✅ Design system initialization workflow
- ✅ Figma Desktop-only access
- ✅ Clean separation of concerns

The codebase is now more maintainable, extensible, and follows the principle of keeping code generic while storing project-specific details in the Design System Guide.

---

## Update: URL Support Re-enabled (2025-12-01)

After the initial refactoring, URL support was added back alongside Desktop selection to provide flexibility.

### Changes Made

**FigmaService** ([src/services/figmaService.ts](src/services/figmaService.ts)):
- `getDesignContext(figmaUrl?)` now supports both:
  - URL-based access (remote MCP) when URL is provided
  - Desktop selection (local MCP) when no URL is provided
- `installMcpServers()` now installs both Desktop and Remote servers
- `getVariableDefinitions(fileKey?)` supports both methods
- `checkToolsAvailable()` returns status for both Desktop and Remote tools

**GenCodeHandler** ([src/participants/commandHandlers/genCodeHandler.ts](src/participants/commandHandlers/genCodeHandler.ts)):
- Added `parseFigmaUrl()` method to extract URL from input
- Updated to handle both URL and Desktop selection
- Usage: `@helix /gen-code [figma-url]` (URL optional)

**FitFinishHandler** ([src/participants/commandHandlers/fitFinishHandler.ts](src/participants/commandHandlers/fitFinishHandler.ts)):
- Updated `parseInput()` to extract both URL and file path
- Updated to handle both URL and Desktop selection
- Usage: `@helix /fit-finish [figma-url] <code-file-path>` (URL optional)

**HelixParticipant** ([src/participants/helixParticipant.ts](src/participants/helixParticipant.ts)):
- Updated help message to show both usage options
- Shows status of both Desktop and Remote MCP availability
- Provides setup instructions for both methods

### Usage Examples

**Gen-Code:**
```bash
# With URL (Remote MCP):
@helix /gen-code https://figma.com/file/ABC?node-id=123:456

# With Desktop selection (Desktop MCP):
@helix /gen-code
```

**Fit-Finish:**
```bash
# With URL (Remote MCP):
@helix /fit-finish https://figma.com/file/ABC?node-id=123:456 src/Button.swift

# With Desktop selection (Desktop MCP):
@helix /fit-finish src/Button.swift
```

### MCP Server Configuration

Both servers can be configured in `.vscode/mcp.json`:

```json
{
  "servers": {
    "figma-desktop": {
      "type": "http",
      "url": "http://127.0.0.1:3845/mcp"
    },
    "figma": {
      "type": "http",
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
```

### Benefits

- **Flexibility**: Users can choose their preferred method
- **Backwards Compatible**: Old URL-based workflows now work again
- **Modern Workflow**: Desktop selection still available for faster iteration
- **Graceful Fallback**: Clear error messages guide users to configure missing servers

---

## Update: Remote Figma Feature Flag (2025-12-01)

Added a configuration flag to control remote Figma MCP access, **disabled by default** for security and simplicity. Desktop MCP now supports URL-based access as the primary method.

### Changes Made

**Configuration** ([package.json](package.json)):
- Added `helix.enableRemoteFigma` setting (boolean, default: `false`)

**ConfigService** ([src/services/configService.ts](src/services/configService.ts)):
- Added `isRemoteFigmaEnabled()` method
- Updated `getConfig()` to include the flag

**HelixConfig Interface** ([src/types/config.ts](src/types/config.ts)):
- Added `enableRemoteFigma: boolean` property
- Set default to `false`

**FigmaService** ([src/services/figmaService.ts](src/services/figmaService.ts)):
- Injected `ConfigService` dependency
- `getDesignContext()` uses **Desktop MCP first for URLs**, then falls back to Remote MCP if enabled
- Desktop MCP supports both URL-based access and selection-based access
- Remote MCP only used as fallback when Desktop fails and flag is enabled
- `getVariableDefinitions()` only uses remote tool if flag is enabled
- `installMcpServers()` only installs remote server if flag is enabled

### Behavior

**With URL provided:**
1. **Try Desktop MCP first** (supports URLs via fileKey + nodeId)
2. If Desktop fails and `enableRemoteFigma` is `true` → Try Remote MCP
3. If both fail → Show helpful error with options

**Without URL (selection-based):**
- Uses Desktop MCP with current selection

**When `enableRemoteFigma` is `false` (default):**
- ✅ Desktop selection works (no URL needed)
- ✅ **Desktop with URL works** (primary method)
- ❌ Remote MCP not used (even as fallback)
- Only Desktop MCP server is installed

**When `enableRemoteFigma` is `true`:**
- ✅ Desktop selection works
- ✅ Desktop with URL works (tried first)
- ✅ Remote MCP works (fallback)
- Both Desktop and Remote MCP servers are installed

### Enabling Remote Figma (Optional)

Remote Figma is **only needed as a fallback** if Desktop MCP fails. Most users won't need to enable it.

To enable Remote Figma fallback:

1. Open VS Code Settings (⌘+,)
2. Search for "Helix: Enable Remote Figma"
3. Check the box
4. Configure remote MCP in `.vscode/mcp.json`
5. Restart VS Code

### Error Message Example

When URL access fails:

```
❌ Could not fetch Figma design from URL

Tried:
✓ Desktop MCP (failed)
✗ Remote MCP (disabled in settings)

Options:
1. Ensure Figma Desktop is running with MCP enabled (Shift+D)
2. Enable Remote Figma in settings: `helix.enableRemoteFigma`
3. Use Desktop selection instead (no URL required)
```

### Rationale

- **Desktop First**: Desktop MCP supports URLs, no remote access needed in most cases
- **Security**: Remote MCP requires network access; disabled by default
- **Fallback Only**: Remote MCP only used if Desktop fails and flag is enabled
- **Simplicity**: Single Desktop MCP server handles both URL and selection-based access
- **Clear Guidance**: Error messages guide users through troubleshooting

---

## Update: Design System Prompts Externalized (2025-12-01)

Completed the prompt externalization refactoring for the `DesignSystemService` to maintain consistency with the existing architecture pattern.

### Changes Made

**PromptService** ([src/services/promptService.ts](src/services/promptService.ts)):
- Added `loadPrompt(promptFileName)` method for loading any prompt file by name
- Complements existing `loadTaskPrompt()` for more generic use cases

**DesignSystemService** ([src/services/designSystemService.ts](src/services/designSystemService.ts)):
- Added `PromptService` dependency injection via constructor
- Refactored `analyzeCodebase()` method to load prompt from external file
- Refactored `generateDesignSystemGuide()` method to load prompt from external file
- Both methods now use `promptService.loadPrompt()` instead of hardcoded strings

**HelixParticipant** ([src/participants/helixParticipant.ts](src/participants/helixParticipant.ts)):
- Updated constructor to instantiate `PromptService` first
- Pass `PromptService` to `DesignSystemService` constructor

**New Prompt Files**:
1. `.github/prompts/analyze-codebase.prompt.md` - Codebase analysis instructions
2. `.github/prompts/generate-design-guide.prompt.md` - Design guide generation instructions

### Prompts Extracted

**analyze-codebase.prompt.md** (18 lines):
- Instructions for analyzing codebase structure
- JSON format specification for analysis results
- Platform, language, color tokens, typography, components detection

**generate-design-guide.prompt.md** (20 lines):
- Instructions for generating comprehensive design system guide
- Uses `{{ANALYSIS_JSON}}` placeholder for dynamic content
- Specifies 8 required sections for the guide

### Architecture Consistency

This change completes the prompt externalization pattern established in earlier refactoring:

**Before**:
```
DesignSystemService (no dependencies)
  └─ Hardcoded prompts in analyzeCodebase() and generateDesignSystemGuide()
```

**After**:
```
DesignSystemService (PromptService injected)
  └─ analyzeCodebase() → promptService.loadPrompt('analyze-codebase.prompt.md')
  └─ generateDesignSystemGuide() → promptService.loadPrompt('generate-design-guide.prompt.md')
```

### Benefits

- **No Hardcoded Prompts**: All LLM prompts now stored in `.github/prompts/` directory
- **Easy Maintenance**: Prompts can be updated without touching TypeScript code
- **Consistent Pattern**: Same architecture as GenCodeHandler and FitFinishHandler
- **Template Support**: `{{ANALYSIS_JSON}}` placeholder enables dynamic content injection
- **Clean Separation**: Orchestration code remains platform/language-agnostic

### Files Changed

**New Files** (2):
1. `.github/prompts/analyze-codebase.prompt.md`
2. `.github/prompts/generate-design-guide.prompt.md`

**Modified Files** (3):
1. `src/services/promptService.ts` - Added `loadPrompt()` method
2. `src/services/designSystemService.ts` - Injected PromptService, refactored methods
3. `src/participants/helixParticipant.ts` - Updated constructor order

### Success Metrics

- **Lines of hardcoded prompts removed**: 27 lines (from analyzeCodebase and generateDesignSystemGuide)
- **New prompt files created**: 2 (analyze-codebase, generate-design-guide)
- **Services updated**: 2 (PromptService, DesignSystemService)
- **Compilation status**: ✅ Success (0 errors)
- **Total prompts externalized**: 4 (gen-code, fit-finish, analyze-codebase, generate-design-guide)

---

## Final Architecture State

All prompts in the Helix extension are now externalized to `.github/prompts/`:

```
.github/prompts/
├── gen-code.prompt.md              (GenCodeHandler)
├── fit-finish.prompt.md            (FitFinishHandler)
├── analyze-codebase.prompt.md      (DesignSystemService.analyzeCodebase)
└── generate-design-guide.prompt.md (DesignSystemService.generateDesignSystemGuide)
```

**Zero hardcoded prompts remain in the TypeScript codebase.**
