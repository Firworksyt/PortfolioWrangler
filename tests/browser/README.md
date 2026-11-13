# IVR browser-local timestamp checks

The `IVR browser timestamps` GitHub Actions workflow installs pinned Playwright in a temporary test-only directory on an isolated runner. It does not install a production dependency or use a persistent/shared browser profile.

The test serves only a minimal fixture and the real `lib/ivrRow.js`. Each Chromium context is configured using Playwright's documented `locale` and `timezoneId` options. Before checking formatting it asserts the browser's actual `Intl.DateTimeFormat().resolvedOptions()`, `navigator.language`, and winter/summer native `Date` offsets. The runner itself stays in UTC.

New York/en-US and Berlin/de-DE checks cover the same winter/summer instants, each zone's spring-forward and repeated fall-back hour, date rollover, equivalent ISO offsets, invalid inputs, actual DOM title values and unchanged frozen source payloads. This is a focused formatter/DOM check, not a full dashboard end-to-end test.

The workflow uploads an artifact named `ivr-browser-evidence-<tested-head-sha>` even on failure when evidence exists. `report.json` contains the tested SHA, module checksum, browser version, requested and actual settings, observed values, offsets and source-preservation results. Per-context JSON, PNGs and Playwright trace ZIPs allow independent review.
