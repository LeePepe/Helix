import * as vscode from 'vscode';
import { HelixParticipant } from './participants/helixParticipant';
import { FigmaService } from './services/figmaService';
import { ConfigService } from './services/configService';

export function activate(context: vscode.ExtensionContext) {
  console.log('Helix Design Workflows extension is activating...');

  // Ensure debug mode detection works when running under F5 (extension development)
  try {
    if (context.extensionMode === vscode.ExtensionMode.Development || context.extensionMode === vscode.ExtensionMode.Test) {
      process.env.HELIX_DEBUG = process.env.HELIX_DEBUG || '1';
      if (!process.argv.includes('--helix-debug')) {
        process.argv.push('--helix-debug');
      }
      console.log('HELIX DEBUG: Enabled by extension.activate for Development/Test mode');
    }
  } catch (e) {
    // swallow errors so activation doesn't fail
  }

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
      const configService = new ConfigService();
      const designSystemPath = configService.getDesignSystemPath();
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
