import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const configPath = path.join(projectRoot, 'config.yaml');
const exampleConfigPath = path.join(projectRoot, 'example.config.yaml');

describe('Server startup', () => {
    let serverProc = null;
    let createdConfig = false;

    beforeAll(() => {
        if (!fs.existsSync(configPath)) {
            fs.copyFileSync(exampleConfigPath, configPath);
            createdConfig = true;
        }
    });

    afterAll(() => {
        if (serverProc && !serverProc.killed) {
            serverProc.kill();
        }
        if (createdConfig && fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
    });

    it('should start without crashing', async () => {
        const port = 30000 + Math.floor(Math.random() * 10000);

        const result = await new Promise((resolve) => {
            let stdout = '';
            let stderr = '';

            serverProc = spawn('node', ['server.js'], {
                cwd: projectRoot,
                env: { ...process.env, PORT: String(port) },
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const timeout = setTimeout(() => {
                serverProc.kill();
                resolve({
                    started: false,
                    reason: 'timeout',
                    stdout,
                    stderr
                });
            }, 10000);

            serverProc.stdout.on('data', (data) => {
                stdout += data.toString();
                if (stdout.includes('Server running on')) {
                    clearTimeout(timeout);
                    serverProc.kill();
                    resolve({ started: true });
                }
            });

            serverProc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            serverProc.on('exit', (code) => {
                clearTimeout(timeout);
                resolve({
                    started: false,
                    reason: `process exited with code ${code}`,
                    stdout,
                    stderr
                });
            });
        });

        if (!result.started) {
            throw new Error(
                `Server failed to start (${result.reason}).\n` +
                `stdout: ${result.stdout}\n` +
                `stderr: ${result.stderr}`
            );
        }
    }, 15000);
});
