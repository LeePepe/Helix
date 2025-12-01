/**
 * Configuration types for Helix extension
 */

/**
 * Helix workspace configuration
 */
export interface HelixConfig {
  /** Path to the design system guide markdown file */
  designSystemPath: string;

  /** Path to the prompts directory */
  promptsPath: string;

  /** Path to the task guides directory */
  guidesPath: string;

  /** Enable remote Figma MCP (URL-based access) */
  enableRemoteFigma: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: HelixConfig = {
  designSystemPath: 'docs/design-system-guide.md',
  promptsPath: 'docs/prompts',
  guidesPath: 'docs/tasks',
  enableRemoteFigma: false  // Disabled by default
};
