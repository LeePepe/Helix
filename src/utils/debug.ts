/**
 * Utility to determine whether Helix is running in debug mode.
 * Checks for either an environment variable `HELIX_DEBUG=1` or the
 * presence of a `--helix-debug` CLI argument.
 */
export function isDebugMode(): boolean {
  try {
    if (process.env.HELIX_DEBUG === '1') return true;
    return process.argv.some(arg => arg === '--helix-debug' || arg === '--debug');
  } catch (e) {
    return false;
  }
}
