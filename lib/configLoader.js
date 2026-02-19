import yaml from 'js-yaml';
import fs from 'fs';

/**
 * Parse a YAML config file and return the parsed config object.
 *
 * @param {string} configPath - Absolute path to the YAML config file
 * @returns {Object} Parsed config object
 * @throws {Error} On file-not-found or YAML parse errors
 */
export function parseConfigFile(configPath) {
    const configFile = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(configFile);
    return {
        watchlist: config?.watchlist || [],
        config
    };
}

/**
 * Compare two watchlist arrays and return the diff.
 *
 * @param {string[]} oldList - Previous watchlist
 * @param {string[]} newList - New watchlist
 * @returns {{ added: string[], removed: string[], changed: boolean }}
 */
export function diffWatchlist(oldList, newList) {
    const oldSet = new Set(oldList);
    const newSet = new Set(newList);

    const added = newList.filter(s => !oldSet.has(s));
    const removed = oldList.filter(s => !newSet.has(s));

    return {
        added,
        removed,
        changed: added.length > 0 || removed.length > 0
    };
}
