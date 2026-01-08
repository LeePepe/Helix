import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Global setup/teardown
    globals: true,

    // File patterns
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', 'out', '.vscode'],

    // Timeout for integration tests (real MCP and LLM calls can be slow)
    testTimeout: 60000,
    hookTimeout: 60000,

    // Coverage configuration
    coverage: {
      provider: 'c8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.{test,spec}.ts',
        'node_modules',
        'dist',
        'out'
      ]
    },

    // Run tests sequentially to avoid rate limits
    threads: false,
    maxConcurrency: 1
  },

  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'src/__mocks__/vscode.ts')
    }
  }
});
