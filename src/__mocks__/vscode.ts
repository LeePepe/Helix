// Minimal vscode mock for testing
// Only mocks what's absolutely necessary for tests to run

export namespace lm {
  export interface LanguageModelChatTool {
    name: string;
    description: string;
    inputSchema?: object;
  }

  export class LanguageModelTextPart {
    constructor(public value: string) {}
  }

  export interface LanguageModelToolResult {
    content: LanguageModelTextPart[];
  }

  export interface LanguageModelChatMessage {
    role: string;
    content: string;
  }

  export class LanguageModelChatMessage {
    static User(content: string): LanguageModelChatMessage {
      return { role: 'user', content };
    }
    static Assistant(content: string): LanguageModelChatMessage {
      return { role: 'assistant', content };
    }
  }

  // Tools array - will be populated by actual VS Code environment or mock
  export let tools: LanguageModelChatTool[] = [];

  // invokeTool - uses actual VS Code implementation or mock
  export let invokeTool: (
    toolName: string,
    options: any,
    token: any
  ) => Promise<LanguageModelToolResult> = async (toolName, options, token) => {
    // Mock implementation for testing - returns empty result
    throw new Error(`Mock: Tool ${toolName} not implemented in test environment`);
  };

  // selectChatModels - uses actual VS Code implementation
  export let selectChatModels: (options?: { family?: string }) => Promise<any[]>;
}

export class CancellationTokenSource {
  token: CancellationToken = new CancellationToken();
  cancel() {}
  dispose() {}
}

export class CancellationToken {
  isCancellationRequested = false;
  onCancellationRequested: any = () => {};
}

export interface ChatResponseStream {
  markdown(text: string): void;
  progress(message: string): void;
  button(options: any): void;
  anchor(uri: any, title: string): void;
  filetree(tree: any, baseUri: any): void;
  push(part: any): void;
}

export class Uri {
  static file(path: string): Uri {
    return new Uri(path);
  }
  static parse(value: string): Uri {
    return new Uri(value);
  }
  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    return new Uri(base.fsPath + '/' + pathSegments.join('/'));
  }
  constructor(public fsPath: string) {}
}

export namespace workspace {
  export let workspaceFolders: any[] | undefined = [];

  export function getConfiguration(section?: string) {
    return {
      get: (key: string, defaultValue?: any) => defaultValue
    };
  }
}

export namespace window {
  export function showInformationMessage(message: string, ...items: string[]) {
    return Promise.resolve(undefined);
  }
  export function showErrorMessage(message: string, ...items: string[]) {
    return Promise.resolve(undefined);
  }
}

export namespace commands {
  export function executeCommand(command: string, ...args: any[]) {
    return Promise.resolve(undefined);
  }
  export function registerCommand(
    command: string,
    callback: (...args: any[]) => any
  ) {
    return { dispose: () => {} };
  }
}

export namespace env {
  export function openExternal(uri: Uri) {
    return Promise.resolve(true);
  }
}

export interface ExtensionContext {
  subscriptions: any[];
  globalState: any;
  workspaceState: any;
  extensionPath: string;
  asAbsolutePath(relativePath: string): string;
}
