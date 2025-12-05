import * as vscode from 'vscode';
import { HelixParticipant } from './participants/helixParticipant';
import { FigmaService } from './services/figmaService';

export function activate(context: vscode.ExtensionContext) {
  console.log('Helix Design Workflows extension is activating...');

  // Register chat participant
  const helixParticipant = new HelixParticipant(context);
  const participant = vscode.chat.createChatParticipant(
    'helix-design-workflows.helix',
    helixParticipant.handleRequest.bind(helixParticipant)
  );

  // Set participant properties
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.png');

  context.subscriptions.push(participant);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('helix.openDesignSystemGuide', () => {
      const config = vscode.workspace.getConfiguration('helix');
      const designSystemPath = config.get<string>('designSystemPath', '.github/design-system-guide.md');
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

      if (workspaceFolder) {
        const uri = vscode.Uri.joinPath(workspaceFolder.uri, designSystemPath);
        vscode.commands.executeCommand('vscode.open', uri);
      } else {
        vscode.window.showErrorMessage('No workspace folder open');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('helix.installMcpServer', async () => {
      const figmaService = new FigmaService();
      const result = await figmaService.installMcpServers();
      if (!result.success) {
        vscode.window.showErrorMessage(result.message);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('helix.openFigma', () => {
      vscode.env.openExternal(vscode.Uri.parse('figma://'));
    })
  );

  console.log('Helix Design Workflows extension activated successfully');
}

export function deactivate() {
  console.log('Helix Design Workflows extension is deactivating...');
}
