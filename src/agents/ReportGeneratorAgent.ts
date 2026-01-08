import * as path from 'path';
import { BaseAgent } from './base/Agent';
import { CompareResult } from '../contracts/compare';
import { ReportResult, ReportResultSchema } from '../contracts/report';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ToolRegistry } from '../runtime/ToolRegistry';

export interface ReportGeneratorInput {
  compareResult: CompareResult;
  componentName: string;
  figmaUrl?: string;
  codeFilePath?: string;
}

export class ReportGeneratorAgent extends BaseAgent<ReportGeneratorInput, ReportResult> {
  readonly name = 'ReportGenerator';
  readonly description = 'Generates markdown reports from comparison results';
  readonly outputSchema = ReportResultSchema;

  protected async execute(
    ctx: ExecutionContext,
    tools: ToolRegistry,
    input: ReportGeneratorInput,
    stream?: any
  ): Promise<ReportResult> {
    // Generate report content
    const content = this.generateReportContent(input);

    // Generate filename with timestamp
    const timestamp = this.formatTimestamp(new Date());
    const componentName = input.componentName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const reportFileName = `report-${componentName}-${timestamp}.md`;
    
    // Get reports path from settings
    const reportsPath = ctx.settings.reportsPath || 'reports';
    const reportPath = `${reportsPath}/${reportFileName}`;

    // Write report if not dry-run
    if (!ctx.settings.dryRun) {
      // Ensure directory exists
      const workspaceRoot = ctx.workspaceInfo.rootPath;
      const fullReportPath = path.join(workspaceRoot, reportPath);
      const reportDir = path.dirname(fullReportPath);

      // Create directory using workspace service
      await tools.invoke(ctx, 'workspace.writeFile', {
        filePath: fullReportPath,
        content,
      });

      ctx.trace('agent', 'report-saved', { 
        reportPath: fullReportPath,
        size: content.length 
      });
    }

    return {
      schemaVersion: '1.0',
      reportPath,
      content,
      metadata: {
        componentName: input.componentName,
        figmaUrl: input.figmaUrl,
        codeFilePath: input.codeFilePath,
        timestamp: new Date().toISOString(),
      },
      trace: ctx.getTraceEvents(),
    };
  }

  /**
   * Generate report content from comparison result
   */
  private generateReportContent(input: ReportGeneratorInput): string {
    const { compareResult, componentName, figmaUrl, codeFilePath } = input;
    const date = new Date().toISOString().replace('T', ' ').substring(0, 16);

    let report = `# ${componentName} - Design Review\n\n`;
    
    // Metadata
    report += `**Date**: ${date}\n`;
    if (figmaUrl) {
      report += `**Figma**: ${figmaUrl}\n`;
    }
    if (codeFilePath) {
      report += `**Code**: ${codeFilePath}\n`;
    }
    report += `\n`;

    // Summary
    report += `## Summary\n\n`;
    report += `**Match Score**: ${compareResult.score}%\n`;
    report += `**Total Issues**: ${compareResult.diffs.length}\n`;

    const highDiffs = compareResult.diffs.filter(d => d.severity === 'high');
    const mediumDiffs = compareResult.diffs.filter(d => d.severity === 'medium');
    const lowDiffs = compareResult.diffs.filter(d => d.severity === 'low');

    report += `- High: ${highDiffs.length}\n`;
    report += `- Medium: ${mediumDiffs.length}\n`;
    report += `- Low: ${lowDiffs.length}\n`;
    report += `\n`;

    // High severity issues
    if (highDiffs.length > 0) {
      report += `## ❌ High Severity Issues\n\n`;
      highDiffs.forEach((diff, index) => {
        report += `${index + 1}. **${diff.category}**\n`;
        report += `   ${diff.description}\n`;
        if (diff.filePaths && diff.filePaths.length > 0) {
          report += `   - Files: ${diff.filePaths.join(', ')}\n`;
        }
        if (diff.figmaRefs && diff.figmaRefs.length > 0) {
          report += `   - Figma: ${diff.figmaRefs.map(r => r.nodeName).join(', ')}\n`;
        }
        report += `\n`;
      });
    }

    // Medium severity issues
    if (mediumDiffs.length > 0) {
      report += `## ⚠️  Medium Severity Issues\n\n`;
      mediumDiffs.forEach((diff, index) => {
        report += `${index + 1}. **${diff.category}**\n`;
        report += `   ${diff.description}\n`;
        if (diff.filePaths && diff.filePaths.length > 0) {
          report += `   - Files: ${diff.filePaths.join(', ')}\n`;
        }
        report += `\n`;
      });
    }

    // Low severity issues
    if (lowDiffs.length > 0) {
      report += `## ℹ️  Low Severity Issues\n\n`;
      lowDiffs.forEach((diff, index) => {
        report += `${index + 1}. **${diff.category}**: ${diff.description}\n`;
      });
      report += `\n`;
    }

    // Next Actions
    if (compareResult.nextActions.length > 0) {
      report += `## 📋 Recommended Actions\n\n`;
      compareResult.nextActions.forEach((action, index) => {
        report += `### ${index + 1}. ${action.title}\n\n`;
        report += `${action.description}\n\n`;
        if (action.suggestedSubtasks && action.suggestedSubtasks.length > 0) {
          report += `**Subtasks:**\n`;
          action.suggestedSubtasks.forEach(subtask => {
            report += `- [ ] ${subtask}\n`;
          });
          report += `\n`;
        }
      });
    }

    // Footer
    report += `---\n\n`;
    report += `*Generated by Helix on ${date}*\n`;

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
}
