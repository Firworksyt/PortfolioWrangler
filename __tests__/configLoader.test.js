import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseConfigFile, diffWatchlist } from '../lib/configLoader.js';

describe('diffWatchlist', () => {
    it('should return no changes when lists are identical', () => {
        const result = diffWatchlist(['AAPL', 'TSLA'], ['AAPL', 'TSLA']);

        expect(result.changed).toBe(false);
        expect(result.added).toEqual([]);
        expect(result.removed).toEqual([]);
    });

    it('should detect added symbols', () => {
        const result = diffWatchlist(['AAPL'], ['AAPL', 'TSLA']);

        expect(result.changed).toBe(true);
        expect(result.added).toEqual(['TSLA']);
        expect(result.removed).toEqual([]);
    });

    it('should detect removed symbols', () => {
        const result = diffWatchlist(['AAPL', 'TSLA'], ['AAPL']);

        expect(result.changed).toBe(true);
        expect(result.added).toEqual([]);
        expect(result.removed).toEqual(['TSLA']);
    });

    it('should detect both added and removed simultaneously', () => {
        const result = diffWatchlist(['AAPL', 'TSLA'], ['AAPL', 'MSFT']);

        expect(result.changed).toBe(true);
        expect(result.added).toEqual(['MSFT']);
        expect(result.removed).toEqual(['TSLA']);
    });

    it('should handle empty old list (all new)', () => {
        const result = diffWatchlist([], ['AAPL', 'TSLA']);

        expect(result.changed).toBe(true);
        expect(result.added).toEqual(['AAPL', 'TSLA']);
        expect(result.removed).toEqual([]);
    });

    it('should handle empty new list (all removed)', () => {
        const result = diffWatchlist(['AAPL', 'TSLA'], []);

        expect(result.changed).toBe(true);
        expect(result.added).toEqual([]);
        expect(result.removed).toEqual(['AAPL', 'TSLA']);
    });

    it('should handle both lists empty', () => {
        const result = diffWatchlist([], []);

        expect(result.changed).toBe(false);
        expect(result.added).toEqual([]);
        expect(result.removed).toEqual([]);
    });
});

describe('parseConfigFile', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'configtest-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function writeConfig(filename, content) {
        const filePath = path.join(tmpDir, filename);
        fs.writeFileSync(filePath, content, 'utf8');
        return filePath;
    }

    it('should parse a valid config file and return watchlist + config', () => {
        const filePath = writeConfig('config.yaml', `
watchlist:
  - AAPL
  - TSLA
  - MSFT
server:
  port: 8080
`);
        const result = parseConfigFile(filePath);

        expect(result.watchlist).toEqual(['AAPL', 'TSLA', 'MSFT']);
        expect(result.config.server.port).toBe(8080);
    });

    it('should throw on file not found', () => {
        expect(() => {
            parseConfigFile(path.join(tmpDir, 'nonexistent.yaml'));
        }).toThrow();
    });

    it('should throw on invalid YAML syntax', () => {
        const filePath = writeConfig('bad.yaml', `
watchlist:
  - AAPL
  invalid: [unterminated
`);
        expect(() => {
            parseConfigFile(filePath);
        }).toThrow();
    });

    it('should return empty watchlist when watchlist key is missing', () => {
        const filePath = writeConfig('config.yaml', `
server:
  port: 3000
`);
        const result = parseConfigFile(filePath);

        expect(result.watchlist).toEqual([]);
    });

    it('should handle config with only server settings (no watchlist)', () => {
        const filePath = writeConfig('config.yaml', `
server:
  port: 5000
`);
        const result = parseConfigFile(filePath);

        expect(result.watchlist).toEqual([]);
        expect(result.config.server.port).toBe(5000);
    });
});
