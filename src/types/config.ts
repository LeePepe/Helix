/**
 * Configuration types for Helix extension
 */

/**
 * Helix workspace configuration
 */
export interface HelixConfig {
  /** Path to the design system guide markdown file */
  designSystemPath: string;

  /** Enable remote Figma MCP (URL-based access) */
  enableRemoteFigma: boolean;

  /** Language model family to use for AI tasks */
  modelFamily: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: HelixConfig = {
  designSystemPath: '.github/design-system-guide.md',
  enableRemoteFigma: false,  // Disabled by default
  modelFamily: 'claude-sonnet-4.5'  // Default model
};
