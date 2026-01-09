import * as vscode from 'vscode';
import * as path from 'path';
import { PromptService } from './promptService';
import { ConfigService } from './configService';
import { ChatService } from './chatService';

/**
 * Service for managing design system detection, creation, and analysis
 */
export class DesignSystemService {
  private designSystemPath: string | null = null;
  private designSystemContent: string | null = null;
  private promptService: PromptService;
  private configService: ConfigService;
  private chatService: ChatService;
  private detectedFramework: string | null = null;

  constructor(promptService: PromptService, configService: ConfigService, chatService: ChatService) {
    this.promptService = promptService;
    this.configService = configService;
    this.chatService = chatService;
  }

  /**
   * Load the design system guide content from file
   */
  async loadGuideContent(): Promise<string> {
    const configPath = this.configService.getDesignSystemPath();
    console.log(`[Helix] [DesignSystemService] Loading design system guide from path: ${configPath}`);
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open. Please open a workspace to use Helix.');
    }

    const designSystemUri = vscode.Uri.joinPath(workspaceFolder.uri, configPath);
    this.designSystemPath = designSystemUri.fsPath;

    try {
      const fileContent = await vscode.workspace.fs.readFile(designSystemUri);
      const content = Buffer.from(fileContent).toString('utf8');
      console.log(`[Helix] [DesignSystemService] Design system guide loaded from: ${this.designSystemPath}`);
      console.log(`[Helix] [DesignSystemService] Content length: ${content.length}`);
      return content;
    } catch (error) {
      throw new Error(
        `Failed to load design system guide at "${configPath}". ` +
        `Please ensure the file exists or update the path in settings (helix.designSystemPath).`
      );
    }
  }

  /**
   * Check if the design system guide file exists
   */
  async checkDesignSystemExists(): Promise<boolean> {
    const configPath = this.configService.getDesignSystemPath();
    console.log(`[Helix]Checking for design system guide at path: ${configPath}`);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return false;
    }

    const designSystemUri = vscode.Uri.joinPath(workspaceFolder.uri, configPath);
    this.designSystemPath = designSystemUri.fsPath;

    try {
      await vscode.workspace.fs.stat(designSystemUri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure design system guide exists, initialize if it doesn't
   */
  async ensureInitialized(stream: vscode.ChatResponseStream, request: vscode.ChatRequest, token: vscode.CancellationToken): Promise<boolean> {
    const exists = await this.checkDesignSystemExists();

    if (exists) {
      return true;
    }

    // Guide doesn't exist - start initialization
    stream.markdown(`## Design System Guide Not Found\n\n`);
    stream.markdown(`I need to create a design system guide for your project.\n\n`);
    stream.markdown(`This will analyze your codebase to extract:\n`);
    stream.markdown(`- Platform/framework and programming language\n`);
    stream.markdown(`- Color tokens and naming patterns\n`);
    stream.markdown(`- Typography definitions\n`);
    stream.markdown(`- Spacing/sizing scales\n`);
    stream.markdown(`- Component patterns\n`);
    stream.markdown(`- Localization approach\n`);
    stream.markdown(`- Coding conventions\n\n`);

    stream.progress('Generating design system guide...');

    // Generate design system guide
    await this.generateDesignSystemGuide(request, stream, token);

    stream.markdown(`✅ **Design System Guide Created**\n\n`);
    stream.markdown(`Saved to: \`${this.designSystemPath}\`\n\n`);
    return false;
  }

  /**
   * Generate a design system guide from codebase analysis
   */
  private async generateDesignSystemGuide(request: vscode.ChatRequest, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<string> {
    // Load generation prompt from external file
    const promptFileContent = await this.promptService.loadInitializationPrompt('design-system-rules-prompt.md');

    const messages = [vscode.LanguageModelChatMessage.User(promptFileContent)];
    
    return await this.chatService.sendRequest(messages, { request, stream, token });
  }

  /**
   * Save the design system guide to the workspace
   */
  async saveDesignSystem(content: string): Promise<void> {
    const configPath = this.configService.getDesignSystemPath();

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }

    const designSystemUri = vscode.Uri.joinPath(workspaceFolder.uri, configPath);
    this.designSystemPath = designSystemUri.fsPath;

    // Create directory if it doesn't exist
    const dirUri = vscode.Uri.joinPath(workspaceFolder.uri, configPath.substring(0, configPath.lastIndexOf('/')));
    try {
      await vscode.workspace.fs.createDirectory(dirUri);
    } catch {
      // Directory might already exist, that's fine
    }

    // Write the file
    const fileContent = Buffer.from(content, 'utf8');
    await vscode.workspace.fs.writeFile(designSystemUri, fileContent);

    console.log(`[Helix]Design system guide saved to: ${this.designSystemPath}`);
  }

  /**
   * Get the path to the design system guide
   */
  getGuidePath(): string | null {
    return this.designSystemPath;
  }

  /**
   * Get the cached content of the design system guide
   * Loads it first if not already loaded
   */
  async getGuideContent(): Promise<string> {
    if (!this.designSystemContent) {
      this.designSystemContent = await this.loadGuideContent();
    }
    return this.designSystemContent;
  }

  /**
   * Auto-detect design system files in the project
   * Looks for common patterns in different frameworks
   */
  async detectDesignSystemFiles(): Promise<{
    foundFiles: string[];
    detectedDomains: {
      colors: boolean;
      typography: boolean;
      spacing: boolean;
      components: boolean;
    }
  }> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }
    
    // Common patterns for design tokens and systems across frameworks
    const patterns = [
      // Style dictionaries and design tokens
      '**/tokens/**/*.{json,js,ts}',
      '**/design-tokens/**/*.{json,js,ts}',
      '**/theme/**/*.{json,js,ts}',
      '**/styles/tokens/**/*.{json,js,ts}',
      
      // Common component libraries
      '**/components/theme.{js,ts,jsx,tsx}',
      '**/styles/theme.{js,ts,jsx,tsx}',
      '**/theme/index.{js,ts,jsx,tsx}',
      
      // Tailwind config
      '**/tailwind.config.{js,ts}',
      
      // Styled components / emotion
      '**/styles/theme.{js,ts}',
      '**/theme/tokens.{js,ts}',
      
      // Material UI / Chakra UI themes
      '**/theme/index.{js,ts}',
      '**/theme/provider.{js,ts,jsx,tsx}',
      
      // CSS variables
      '**/styles/variables.{css,scss,less}',
      '**/styles/tokens.{css,scss,less}'
    ];
    
    const foundFiles: string[] = [];
    
    // Search for files matching patterns
    for (const pattern of patterns) {
      const files = await vscode.workspace.findFiles(pattern);
      foundFiles.push(...files.map(file => file.fsPath));
    }
    
    // Detect which domains are covered
    const domains = {
      colors: false,
      typography: false,
      spacing: false,
      components: false
    };
    
    // Basic analysis of found files
    for (const file of foundFiles) {
      try {
        const fileUri = vscode.Uri.file(file);
        const fileContent = await vscode.workspace.fs.readFile(fileUri);
        const content = Buffer.from(fileContent).toString('utf8');
        
        // Check for color definitions
        if (
          /colou?r|palette|brand|background|primary|secondary|accent/i.test(content) ||
          /#[0-9A-Fa-f]{3,8}|rgba?\(|hsla?\(/i.test(content)
        ) {
          domains.colors = true;
        }
        
        // Check for typography
        if (
          /font|typography|text|heading|body|family|size|weight|line-height/i.test(content)
        ) {
          domains.typography = true;
        }
        
        // Check for spacing
        if (
          /spacing|margin|padding|gap|grid|layout|space-[xy]|size/i.test(content)
        ) {
          domains.spacing = true;
        }
        
        // Check for components
        if (
          /component|button|input|card|modal|dialog|nav|menu|form|select|checkbox/i.test(content)
        ) {
          domains.components = true;
        }
      } catch (error) {
        console.log(`[Helix]Error reading design system file: ${file}`, error);
      }
    }
    
    return { foundFiles, detectedDomains: domains };
  }
  
  /**
   * Detect and analyze the project framework
   */
  async detectFramework(): Promise<string> {
    if (this.detectedFramework) {
      return this.detectedFramework;
    }
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }
    
    try {
      // Check package.json for dependencies
      const packageJsonUri = vscode.Uri.joinPath(workspaceFolder.uri, 'package.json');
      const packageJsonContent = await vscode.workspace.fs.readFile(packageJsonUri);
      const packageJson = JSON.parse(Buffer.from(packageJsonContent).toString('utf8'));
      
      const allDependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };
      
      // Check for common frameworks
      if (allDependencies.react) {
        if (allDependencies['@chakra-ui/react']) {
          this.detectedFramework = 'react-chakra-ui';
        } else if (allDependencies['@mui/material']) {
          this.detectedFramework = 'react-material-ui';
        } else if (allDependencies['styled-components']) {
          this.detectedFramework = 'react-styled-components';
        } else if (allDependencies['@emotion/react']) {
          this.detectedFramework = 'react-emotion';
        } else if (allDependencies.tailwindcss) {
          this.detectedFramework = 'react-tailwind';
        } else {
          this.detectedFramework = 'react';
        }
      } else if (allDependencies.vue) {
        if (allDependencies['vuetify']) {
          this.detectedFramework = 'vue-vuetify';
        } else if (allDependencies['tailwindcss']) {
          this.detectedFramework = 'vue-tailwind';
        } else {
          this.detectedFramework = 'vue';
        }
      } else if (allDependencies.angular) {
        if (allDependencies['@angular/material']) {
          this.detectedFramework = 'angular-material';
        } else {
          this.detectedFramework = 'angular';
        }
      } else if (allDependencies.svelte) {
        this.detectedFramework = 'svelte';
      } else if (allDependencies.tailwindcss) {
        this.detectedFramework = 'tailwind';
      } else {
        this.detectedFramework = 'unknown';
      }
      
      return this.detectedFramework;
    } catch (error) {
      console.log('[Helix]Error detecting framework:', error);
      this.detectedFramework = 'unknown';
      return this.detectedFramework;
    }
  }

  /**
   * Analyze design system tokens from detected files
   * Uses the LLM to extract and structure token information
   */
  async analyzeDesignSystem(request: vscode.ChatRequest, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<{
    colors: Record<string, string>;
    typography: Record<string, any>;
    spacing: Record<string, string>;
    components: string[];
    framework: string;
  }> {
    const { foundFiles, detectedDomains } = await this.detectDesignSystemFiles();
    const framework = await this.detectFramework();
    
    const result = {
      colors: {} as Record<string, string>,
      typography: {} as Record<string, any>,
      spacing: {} as Record<string, string>,
      components: [] as string[],
      framework
    };
    
    // If no design files found, return empty results
    if (foundFiles.length === 0) {
      return result;
    }
    
    // Generate prompt for LLM to extract tokens
    const filesContent: Record<string, string> = {};
    for (const file of foundFiles.slice(0, 5)) { // Limit to first 5 files to avoid token overflow
      try {
        const fileUri = vscode.Uri.file(file);
        const fileContent = await vscode.workspace.fs.readFile(fileUri);
        filesContent[file] = Buffer.from(fileContent).toString('utf8');
      } catch (error) {
        console.log(`[Helix]Error reading file ${file}:`, error);
      }
    }
    
    const promptContent = `
    Analyze these design system files and extract the design tokens.
    For each category, provide a structured output of the tokens.
    
    Files to analyze:
    ${Object.entries(filesContent).map(([file, content]) => {
      return `---\nFile: ${path.basename(file)}\n\n${content.slice(0, 1000)}...\n---\n`;
    }).join('\n')}
    
    Extract:
    1. Color tokens (name -> value)
    2. Typography tokens (name -> properties like size, weight, family)
    3. Spacing tokens (name -> value)
    4. Component names
    
    Format the response as JSON with these exact keys:
    {
      "colors": { "tokenName": "value" },
      "typography": { "tokenName": { "size": "value", "weight": "value", "family": "value" } },
      "spacing": { "tokenName": "value" },
      "components": ["ComponentName1", "ComponentName2"]
    }
    `;
    
    try {
      // Use the LLM to analyze the files
      const messages = [vscode.LanguageModelChatMessage.User(promptContent)];
      const analysisResponse = await this.chatService.sendRequest(messages, { request, stream, token });
      
      // Try to parse the JSON response
      try {
        const jsonMatch = analysisResponse.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || 
                         analysisResponse.match(/({[\s\S]*})/) || 
                         [null, analysisResponse];
                         
        const jsonStr = jsonMatch ? jsonMatch[1] : analysisResponse;
        const parsedResponse = JSON.parse(jsonStr);
        
        if (typeof parsedResponse === 'object') {
          result.colors = parsedResponse.colors || {};
          result.typography = parsedResponse.typography || {};
          result.spacing = parsedResponse.spacing || {};
          result.components = parsedResponse.components || [];
        }
      } catch (parseError) {
        console.log('[Helix]Error parsing design system analysis:', parseError);
      }
    } catch (error) {
      console.log('[Helix]Error analyzing design system:', error);
    }
    
    return result;
  }
}