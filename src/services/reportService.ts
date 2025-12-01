import * as vscode from 'vscode';
import { FileService } from './fileService';

export interface ComparisonResult {
  componentName: string;
  matchRate: number;
  totalDifferences: number;
  criticalDifferences: number;
  minorDifferences: number;
  differences: Difference[];
  matches: string[];
  fixesApplied?: string[];
}

export interface Difference {
  category: 'color' | 'typography' | 'spacing' | 'dimension' | 'layout' | 'effect';
  severity: 'critical' | 'minor';
  property: string;
  figmaValue: string;
  codeValue: string;
  fix: string;
  filePath?: string;
  lineNumber?: number;
  status?: 'fixed' | 'manual' | 'pending';
}

export class ReportService {
  private fileService: FileService;

  constructor() {
    this.fileService = new FileService();
  }

  /**
   * Save a comparison report to the reports directory
   */
  async saveComparisonReport(
    comparison: ComparisonResult,
    figmaUrl: string,
    codeFilePath: string
  ): Promise<string> {
    const config = vscode.workspace.getConfiguration('helix');
    const reportsPath = config.get<string>('reportsPath', '.github/ui-fit-finish/reports');

    // Generate timestamp
    const timestamp = this.formatTimestamp(new Date());
    const componentName = comparison.componentName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const reportFileName = `report-${componentName}-${timestamp}.md`;
    const reportPath = `${reportsPath}/${reportFileName}`;

    // Generate report content
    const reportContent = this.generateReportContent(comparison, figmaUrl, codeFilePath);

    // Ensure reports directory exists
    await this.ensureDirectoryExists(reportsPath);

    // Write report
    await this.fileService.writeFile(reportPath, reportContent);

    return reportPath;
  }

  /**
   * Generate report content from comparison result
   */
  private generateReportContent(
    comparison: ComparisonResult,
    figmaUrl: string,
    codeFilePath: string
  ): string {
    const date = new Date().toISOString().replace('T', ' ').substring(0, 16);

    let report = `# ${comparison.componentName} - Design Review\n\n`;
    report += `**Date**: ${date}\n`;
    report += `**Figma**: ${figmaUrl}\n`;
    report += `**Code**: ${codeFilePath}\n\n`;

    // Summary
    report += `## Summary\n\n`;
    report += `**Match Rate**: ${comparison.matchRate}% | `;
    report += `**Differences**: ${comparison.totalDifferences} `;
    report += `(${comparison.criticalDifferences} critical, ${comparison.minorDifferences} minor)\n`;

    if (comparison.fixesApplied && comparison.fixesApplied.length > 0) {
      report += `**Fixes Applied**: ${comparison.fixesApplied.length}\n`;
    }

    report += `\n`;

    // Critical differences
    const criticalDiffs = comparison.differences.filter(d => d.severity === 'critical');
    if (criticalDiffs.length > 0) {
      report += `## ❌ Critical Differences\n\n`;
      criticalDiffs.forEach((diff, index) => {
        report += `${index + 1}. **${diff.property}** (${diff.category})\n`;
        report += `   - Figma: \`${diff.figmaValue}\`\n`;
        report += `   - Code: \`${diff.codeValue}\`\n`;
        report += `   - Fix: ${diff.fix}\n`;
        if (diff.filePath) {
          report += `   - File: ${diff.filePath}${diff.lineNumber ? `:${diff.lineNumber}` : ''}\n`;
        }
        if (diff.status) {
          const statusIcon = diff.status === 'fixed' ? '✓' : diff.status === 'manual' ? '⚠' : '○';
          report += `   - Status: ${statusIcon} ${diff.status === 'fixed' ? 'Fixed' : diff.status === 'manual' ? 'Manual fix required' : 'Pending'}\n`;
        }
        report += `\n`;
      });
    }

    // Minor differences
    const minorDiffs = comparison.differences.filter(d => d.severity === 'minor');
    if (minorDiffs.length > 0) {
      report += `## ⚠️  Minor Differences\n\n`;
      minorDiffs.forEach((diff, index) => {
        report += `${index + 1}. **${diff.property}** (${diff.category})\n`;
        report += `   - Figma: \`${diff.figmaValue}\`\n`;
        report += `   - Code: \`${diff.codeValue}\`\n`;
        report += `   - Fix: ${diff.fix}\n`;
        if (diff.filePath) {
          report += `   - File: ${diff.filePath}${diff.lineNumber ? `:${diff.lineNumber}` : ''}\n`;
        }
        report += `\n`;
      });
    }

    // Matches
    if (comparison.matches.length > 0) {
      report += `## ✅ Matches\n\n`;
      comparison.matches.forEach(match => {
        report += `- ${match}\n`;
      });
      report += `\n`;
    }

    // Next steps
    report += `## Next Steps\n\n`;
    if (comparison.fixesApplied && comparison.fixesApplied.length > 0) {
      report += `1. Review changes with \`git diff\`\n`;
      report += `2. Test in all theme modes (light/dark)\n`;
      report += `3. Run build and lint commands\n`;
      report += `4. Verify visual appearance\n`;
    } else if (comparison.criticalDifferences > 0) {
      report += `1. Apply critical fixes (ask Helix to auto-fix)\n`;
      report += `2. Review changes with \`git diff\`\n`;
      report += `3. Test in all theme modes\n`;
      report += `4. Run build and lint commands\n`;
    } else {
      report += `1. Review minor differences\n`;
      report += `2. Decide if changes are needed\n`;
      report += `3. Test component in all scenarios\n`;
    }

    return report;
  }

  /**
   * Format timestamp for filename
   */
  private formatTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}-${hour}${minute}${second}`;
  }

  /**
   * Ensure a directory exists
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }

    const dirUri = vscode.Uri.joinPath(workspaceFolder.uri, dirPath);

    try {
      await vscode.workspace.fs.createDirectory(dirUri);
    } catch (error) {
      // Directory may already exist, that's okay
      console.log(`Directory ${dirPath} may already exist`);
    }
  }
}
