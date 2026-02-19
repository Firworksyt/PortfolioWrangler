import { execSync } from 'child_process';

/**
 * Get the application version info (commit hash + build timestamp).
 *
 * Resolution order for commit hash:
 *   1. env.COMMIT_HASH (set in Docker via build arg)
 *   2. git rev-parse --short HEAD (native / npm start)
 *   3. "unknown" fallback
 *
 * @param {{ dirname?: string, env?: Object }} options
 * @returns {{ commitHash: string, buildTimestamp: string }}
 */
export function getAppVersion({ dirname, env = {} } = {}) {
    let commitHash = env.COMMIT_HASH || '';

    if (commitHash) {
        // Truncate to 7 chars if longer
        commitHash = commitHash.slice(0, 7);
    } else {
        try {
            commitHash = execSync('git rev-parse --short HEAD', {
                cwd: dirname,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe']
            }).trim();
        } catch {
            commitHash = 'unknown';
        }
    }

    const buildTimestamp = env.BUILD_TIMESTAMP || new Date().toISOString();

    return { commitHash, buildTimestamp };
}
