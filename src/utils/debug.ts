/**
 * Utility to determine whether Helix is running in debug mode.
 * Checks for either an environment variable `HELIX_DEBUG=1` or the
 * presence of a `--helix-debug` CLI argument.
 */
export function isDebugMode(): boolean {
  try {
    if (process.env.HELIX_DEBUG === '1') {
      console.log('DEBUG MODE: Enabled via HELIX_DEBUG env var');
      return true;
    }
    const isDebug = process.argv.some(arg => arg === '--helix-debug' || arg === '--debug');
    if (isDebug) {
      console.log('DEBUG MODE: Enabled via CLI argument');
    }
    return isDebug;
  } catch (e) {
    return false;
  }
}
