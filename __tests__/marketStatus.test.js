import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { fetch } from 'undici';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const configPath = path.join(projectRoot, 'config.yaml');
const exampleConfigPath = path.join(projectRoot, 'example.config.yaml');

describe('Market Status Endpoint', () => {
    let serverProc = null;
    let serverPort = null;
    let createdConfig = false;

    beforeAll(async () => {
        if (!fs.existsSync(configPath)) {
            fs.copyFileSync(exampleConfigPath, configPath);
            createdConfig = true;
        }

        serverPort = 31000 + Math.floor(Math.random() * 10000);

        await new Promise((resolve, reject) => {
            serverProc = spawn('node', ['server.js'], {
                cwd: projectRoot,
                env: { ...process.env, PORT: String(serverPort) },
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const timeout = setTimeout(() => {
                reject(new Error('Server did not start within 10s'));
            }, 10000);

            serverProc.stdout.on('data', (data) => {
                if (data.toString().includes('Server running on')) {
                    clearTimeout(timeout);
                    resolve();
                }
            });

            serverProc.on('exit', (code) => {
                clearTimeout(timeout);
                reject(new Error(`Server exited early with code ${code}`));
            });
        });
    }, 15000);

    afterAll(() => {
        if (serverProc && !serverProc.killed) {
            serverProc.kill();
        }
        if (createdConfig && fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
    });

    it('should respond to GET /api/market-status', async () => {
        const res = await fetch(`http://localhost:${serverPort}/api/market-status`);
        expect(res.status).toBe(200);
    });

    it('should return JSON with markets array and asOf fields', async () => {
        const res = await fetch(`http://localhost:${serverPort}/api/market-status`);
        const data = await res.json();

        expect(data).toHaveProperty('markets');
        expect(data).toHaveProperty('asOf');
        expect(Array.isArray(data.markets)).toBe(true);
    });

    it('should return asOf as a valid ISO date string', async () => {
        const res = await fetch(`http://localhost:${serverPort}/api/market-status`);
        const data = await res.json();

        expect(() => new Date(data.asOf)).not.toThrow();
        expect(new Date(data.asOf).toISOString()).toBe(data.asOf);
    });

    it('each market entry should have displayName and marketState', async () => {
        // Wait briefly for the first poll to complete before checking
        await new Promise(r => setTimeout(r, 12000));
        const res = await fetch(`http://localhost:${serverPort}/api/market-status`);
        const { markets } = await res.json();

        // After first poll there should be at least one entry
        expect(markets.length).toBeGreaterThan(0);
        for (const m of markets) {
            expect(typeof m.displayName).toBe('string');
            expect(typeof m.marketState).toBe('string');
            const validStates = ['REGULAR', 'PRE', 'POST', 'CLOSED', 'PREPRE', 'POSTPOST'];
            expect(validStates).toContain(m.marketState);
        }
    }, 20000);
});
