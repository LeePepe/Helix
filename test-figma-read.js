// Test script to read Figma design data
const vscode = require('vscode');

async function testFigmaRead() {
  const figmaUrl = 'https://www.figma.com/design/uNhAcLyyP4e8vVd6GjpgGu/%F0%9F%96%A5%EF%B8%8F-Copilot-in-macOS-Component-Library?node-id=4533-137725&t=eU0YKfpJ05ufKDBo-4';
  
  // Parse URL
  const urlMatch = figmaUrl.match(/figma\.com\/design\/([^/?]+)/);
  const nodeMatch = figmaUrl.match(/node-id=([^&]+)/);
  
  if (!urlMatch || !nodeMatch) {
    console.error('Invalid Figma URL');
    return;
  }
  
  const fileKey = urlMatch[1];
  const nodeId = nodeMatch[1].replace('-', ':');
  
  console.log('FileKey:', fileKey);
  console.log('NodeId:', nodeId);
  console.log('\nAvailable tools:');
  
  const tools = vscode.lm.tools;
  const figmaTools = tools.filter(t => t.name.includes('figma'));
  
  if (figmaTools.length === 0) {
    console.log('❌ No Figma MCP tools found');
    console.log('Available tools:', tools.map(t => t.name).join(', '));
    return;
  }
  
  console.log('Found Figma tools:');
  figmaTools.forEach(tool => {
    console.log(`  - ${tool.name}: ${tool.description}`);
  });
  
  // Try Desktop MCP
  const desktopTool = tools.find(t => t.name === 'mcp_figma-desktop_get_design_context');
  
  if (desktopTool) {
    console.log('\n========== Calling Desktop MCP ==========');
    try {
      const token = new vscode.CancellationTokenSource().token;
      const result = await vscode.lm.invokeTool(
        desktopTool.name,
        {
          toolInvocationToken: undefined,
          input: {
            nodeId: nodeId,
            clientLanguages: 'typescript',
            clientFrameworks: 'react'
          }
        },
        token
      );
      
      console.log('✅ Success!');
      console.log('\nResult type:', typeof result);
      
      // Parse the result
      let content = '';
      for await (const chunk of result) {
        if (chunk instanceof vscode.LanguageModelTextPart) {
          content += chunk.value;
        }
      }
      
      console.log('\nContent length:', content.length);
      console.log('\nFirst 1000 characters:');
      console.log(content.substring(0, 1000));
      
      // Try to parse as JSON
      try {
        const parsed = JSON.parse(content);
        console.log('\n✅ Parsed as JSON');
        console.log('Keys:', Object.keys(parsed).slice(0, 20));
        
        // Show structure
        if (parsed.name) console.log('Name:', parsed.name);
        if (parsed.type) console.log('Type:', parsed.type);
        if (parsed.children) console.log('Children count:', parsed.children.length);
        if (parsed.absoluteBoundingBox) console.log('Bounding Box:', parsed.absoluteBoundingBox);
        
      } catch (e) {
        console.log('⚠️ Not JSON, possibly XML/HTML');
        console.log('Content preview:\n', content.substring(0, 500));
      }
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      console.error('Stack:', error.stack);
    }
  } else {
    console.log('❌ Desktop MCP tool not found');
  }
}

testFigmaRead().catch(console.error);
