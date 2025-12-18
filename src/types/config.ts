/**
 * Configuration types for Helix extension
 */

/**
 * Helix workspace configuration
 */
export interface HelixConfig {
  /** Path to the design system guide markdown file */
  designSystemPath: string;

  /** Path to save UI fit & finish reports */
  reportsPath: string;

  /** Enable remote Figma MCP (URL-based access) */
  enableRemoteFigma: boolean;

  /** Language model family to use for AI tasks */
  modelFamily: string;

  /** Allowed tools for LLM to use (supports wildcards like 'figma/*') */
  tools: string[];
}

/**
 * Default tools available for Helix tasks
 * Supports exact names and wildcard patterns (e.g., 'figma-desktop/*')
 */
export const DEFAULT_TOOLS: string[] = [
  'edit',
  'search', 
  'runCommands',
  'figma-desktop/*',
  'figma/*',
  'usages',
  'vscodeAPI',
  'problems',
  'changes',
  'openSimpleBrowser',
  'fetch'
];

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: HelixConfig = {
  designSystemPath: '.github/design-system-guide.md',
  reportsPath: '.github/ui-fit-finish/reports',
  enableRemoteFigma: false,
  modelFamily: 'claude-sonnet-4.5',
  tools: DEFAULT_TOOLS
};
