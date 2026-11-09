// Focused real-browser checks; Playwright is installed only in an isolated CI directory.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const evidenceDir = process.env.IVR_BROWSER_EVIDENCE;
assert.ok(evidenceDir, 'IVR_BROWSER_EVIDENCE must point to a test artifact directory');
await mkdir(evidenceDir, { recursive: true });
const source = await readFile(new URL('../../lib/ivrRow.js', import.meta.url), 'utf8');
const testedSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (process.env.TESTED_SHA) assert.equal(testedSha, process.env.TESTED_SHA);
// ICU versions may use a normal, non-breaking, or narrow non-breaking space.
const normalizeSpaces = value => value.replace(/[\u00a0\u202f]/g, ' ');
const winter = '2026-01-15T12:00:00Z';
const summer = '2026-07-15T12:00:00Z';
const scenarios = [
    {
        id: 'new-york', timeZone: 'America/New_York', locale: 'en-US',
        // Each row: source ISO, expected rendered value, native Date timezone offset in minutes.
        cases: [
            [winter, 'Jan 15, 2026, 7:00 AM GMT-5', 300],
            [summer, 'Jul 15, 2026, 8:00 AM GMT-4', 240],
            ['2026-03-08T06:59:00Z', 'Mar 8, 2026, 1:59 AM GMT-5', 300],
            ['2026-03-08T07:00:00Z', 'Mar 8, 2026, 3:00 AM GMT-4', 240],
            ['2026-11-01T05:30:00Z', 'Nov 1, 2026, 1:30 AM GMT-4', 240],
            ['2026-11-01T06:30:00Z', 'Nov 1, 2026, 1:30 AM GMT-5', 300],
            ['2026-11-07T03:30:00Z', 'Nov 6, 2026, 10:30 PM GMT-5', 300],
            ['2026-01-15T07:00:00-05:00', 'Jan 15, 2026, 7:00 AM GMT-5', 300],
        ],
    },
    {
        id: 'berlin', timeZone: 'Europe/Berlin', locale: 'de-DE',
        cases: [
            [winter, '15. Jan. 2026, 13:00 GMT+1', -60],
            [summer, '15. Juli 2026, 14:00 GMT+2', -120],
            ['2026-03-29T00:59:00Z', '29. März 2026, 01:59 GMT+1', -60],
            ['2026-03-29T01:00:00Z', '29. März 2026, 03:00 GMT+2', -120],
            ['2026-10-25T00:30:00Z', '25. Okt. 2026, 02:30 GMT+2', -120],
            ['2026-10-25T01:30:00Z', '25. Okt. 2026, 02:30 GMT+1', -60],
            ['2026-11-07T03:30:00Z', '7. Nov. 2026, 04:30 GMT+1', -60],
            ['2026-01-15T07:00:00-05:00', '15. Jan. 2026, 13:00 GMT+1', -60],
        ],
    },
];

const html = '<!doctype html><html><head><meta charset="utf-8"><title>IVR timestamp checks</title></head>' +
    '<body><h1>IVR timestamp checks</h1><pre id="environment"></pre><main id="rows"></main></body></html>';
const server = createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    } else if (req.url === '/lib/ivrRow.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(source);
    } else {
        res.writeHead(404);
        res.end();
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const report = {
    testedSha,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    runnerTimeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
    status: 'running', scenarios: [],
};
try {
    browser = await chromium.launch();
    report.browserVersion = browser.version();
    for (const scenario of scenarios) {
        const context = await browser.newContext({ locale: scenario.locale, timezoneId: scenario.timeZone });
        // The test fixture and actual production module are the only permitted network destinations.
        await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
        const page = await context.newPage();
        const evidence = { requested: { timeZone: scenario.timeZone, locale: scenario.locale } };
        report.scenarios.push(evidence);
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
        try {
            await page.goto(origin);
            evidence.actual = await page.evaluate(() => ({
                timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
                locale: new Intl.DateTimeFormat().resolvedOptions().locale,
                language: navigator.language,
                winterOffset: new Date('2026-01-15T12:00:00Z').getTimezoneOffset(),
                summerOffset: new Date('2026-07-15T12:00:00Z').getTimezoneOffset(),
            }));
            console.log(JSON.stringify({ scenario: scenario.id, actual: evidence.actual }));
            // Fail before formatting assertions if the browser did not apply the requested settings.
            assert.equal(evidence.actual.timeZone, scenario.timeZone);
            assert.equal(evidence.actual.locale, scenario.locale);
            assert.equal(evidence.actual.language, scenario.locale);
            assert.equal(evidence.actual.winterOffset, scenario.cases[0][2]);
            assert.equal(evidence.actual.summerOffset, scenario.cases[1][2]);
            evidence.rows = await page.evaluate(async ({ cases, actual }) => {
                const { formatIvrAsOf, formatIvrRow } = await import('/lib/ivrRow.js');
                document.querySelector('#environment').textContent = JSON.stringify(actual, null, 2);
                return cases.map(([iso]) => {
                    const entry = Object.freeze({ ivr: 40, asOf: iso });
                    const payload = Object.freeze({ available: true, bySymbol: Object.freeze({ X: entry }) });
                    const before = JSON.stringify(payload);
                    const view = formatIvrRow(payload, 'X');
                    const row = document.createElement('p');
                    row.title = view.title;
                    row.textContent = `${iso} — ${view.title}`;
                    document.querySelector('#rows').append(row);
                    return {
                        iso, sourceAfter: payload.bySymbol.X.asOf,
                        unchanged: before === JSON.stringify(payload),
                        timestamp: new Date(iso).getTime(), offset: new Date(iso).getTimezoneOffset(),
                        formatted: formatIvrAsOf(iso), title: row.title,
                    };
                });
            }, { cases: scenario.cases, actual: evidence.actual });
            for (const [index, [iso, expected, offset]] of scenario.cases.entries()) {
                const row = evidence.rows[index];
                assert.equal(normalizeSpaces(row.formatted), expected, iso);
                assert.equal(normalizeSpaces(row.title), `IV Rank 40.0\nSource: tastytrade\nAs of ${expected}`, iso);
                assert.equal(row.offset, offset, iso);
                assert.equal(row.sourceAfter, iso);
                assert.equal(row.timestamp, Date.parse(iso));
                assert.equal(row.unchanged, true);
            }
            evidence.invalid = await page.evaluate(async () => {
                const { formatIvrAsOf, formatIvrRow } = await import('/lib/ivrRow.js');
                return [undefined, null, '', 'not-a-date'].map(asOf => ({
                    formatted: formatIvrAsOf(asOf),
                    title: formatIvrRow({ available: true, bySymbol: { X: { ivr: 40, asOf } } }, 'X').title,
                }));
            });
            assert.deepEqual(evidence.invalid, Array(4).fill({ formatted: null, title: 'IV Rank 40.0\nSource: tastytrade' }));
            evidence.status = 'passed';
        } finally {
            await page.screenshot({ path: join(evidenceDir, `${scenario.id}.png`), fullPage: true });
            await context.tracing.stop({ path: join(evidenceDir, `${scenario.id}-trace.zip`) });
            await writeFile(join(evidenceDir, `${scenario.id}.json`), JSON.stringify(evidence, null, 2));
            await context.close();
        }
    }
    report.status = 'passed';
    console.log('PASS: both browser contexts report the expected settings; 16 timestamps and 8 invalid-input cases passed.');
} catch (error) {
    report.status = 'failed';
    report.error = error.stack;
    throw error;
} finally {
    await writeFile(join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2));
    await browser?.close();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
