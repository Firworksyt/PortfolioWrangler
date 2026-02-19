import { jest } from '@jest/globals';

const mockExecSync = jest.fn();

jest.unstable_mockModule('child_process', () => ({
    execSync: mockExecSync
}));

const { getAppVersion } = await import('../lib/version.js');

describe('getAppVersion', () => {
    beforeEach(() => {
        mockExecSync.mockReset();
    });

    it('should use COMMIT_HASH env var when provided', () => {
        const result = getAppVersion({ env: { COMMIT_HASH: 'abc1234' } });

        expect(result.commitHash).toBe('abc1234');
        expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should truncate long COMMIT_HASH env var to 7 chars', () => {
        const result = getAppVersion({ env: { COMMIT_HASH: 'abc1234def5678' } });

        expect(result.commitHash).toBe('abc1234');
    });

    it('should use BUILD_TIMESTAMP env var when provided', () => {
        const result = getAppVersion({
            env: { COMMIT_HASH: 'abc1234', BUILD_TIMESTAMP: '2026-01-15T10:00:00Z' }
        });

        expect(result.buildTimestamp).toBe('2026-01-15T10:00:00Z');
    });

    it('should fall back to git when no env var', () => {
        mockExecSync.mockReturnValue('f5dd9c0\n');

        const result = getAppVersion({ env: {} });

        expect(result.commitHash).toBe('f5dd9c0');
        expect(mockExecSync).toHaveBeenCalledWith(
            'git rev-parse --short HEAD',
            expect.objectContaining({ encoding: 'utf8' })
        );
    });

    it('should fall back to "unknown" when both git and env var unavailable', () => {
        mockExecSync.mockImplementation(() => { throw new Error('git not found'); });

        const result = getAppVersion({ env: {} });

        expect(result.commitHash).toBe('unknown');
    });

    it('should return an ISO timestamp when BUILD_TIMESTAMP env not set', () => {
        const result = getAppVersion({ env: { COMMIT_HASH: 'abc1234' } });

        // Should be a valid ISO date string
        expect(() => new Date(result.buildTimestamp)).not.toThrow();
        expect(new Date(result.buildTimestamp).toISOString()).toBe(result.buildTimestamp);
    });
});
