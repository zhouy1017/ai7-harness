import { describe, expect, it } from 'vitest';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { checkVersionConsistency, parseLedger } from '../../tools/check-version.mjs';

// ADR 0098: package.json, the version ledger, PROGRESS and the development plan name one version.
const ledger = [
  '# Software, data and build identity', '', 'prose', '', '## Version ledger', '',
  '| Version | Status | Wave or scope | Integrated dev commit | Tag / release |',
  '| --- | --- | --- | --- | --- |',
  '| 0.1.0 | integrated | Waves 1–20 and the governance wave | `a40bf0b8` | none |',
  '| 0.2.0 | planned | Wave 21 — the core completes | — | — |',
  '| 0.3.0 | planned | Wave 22 — desk work | — | — |',
  '| 1.0.0 | planned | Wave 23 — acceptance (`1.0.0-rc.N` before) | — | — |',
  '', '## Canonical inputs', '', '| Version | Status |', '| 9.9.9 | planned |',
].join('\n');
const progress = 'Checkpoint.\n\nVersion: integrated **0.1.0**, next **0.2.0** (Wave 21), under ADR 0098.\n';
const plan = [
  '3. **Wave 21 → 0.2.0 — the core completes:** …',
  '4. **Wave 22 → 0.3.0 — desk work:** …',
  '5. **Wave 23 → 1.0.0 — acceptance and closure:** …',
].join('\n');
const agreeing = { packageJson: { version: '0.1.0' }, ledgerMarkdown: ledger, progressMarkdown: progress, planMarkdown: plan };

describe('one x.y.z version across package.json, the ledger, PROGRESS and the plan (ADR 0098)', () => {
  it('reads only the ledger section and keeps its row order', () => {
    const parsed = parseLedger(ledger);
    expect(parsed.findings).toEqual([]);
    expect(parsed.rows.map((row: { version: string; status: string }) => `${row.version}:${row.status}`))
      .toEqual(['0.1.0:integrated', '0.2.0:planned', '0.3.0:planned', '1.0.0:planned']);
    expect(parseLedger('# no ledger here').findings).toEqual(['ledger-section-missing']);
  });

  it('passes when every record names the same integrated and next versions', () => {
    expect(checkVersionConsistency(agreeing)).toEqual([]);
    const released = { ...agreeing, ledgerMarkdown: ledger.replace('| 0.1.0 | integrated |', '| 0.1.0 | released |') };
    expect(checkVersionConsistency(released)).toEqual([]);
    // Windows working trees check out CRLF; the records still agree.
    const crlf = (text: string) => text.replace(/\n/gu, '\r\n');
    expect(checkVersionConsistency({ ...agreeing, ledgerMarkdown: crlf(ledger), progressMarkdown: crlf(progress), planMarkdown: crlf(plan) })).toEqual([]);
  });

  it('names each disagreement instead of guessing', () => {
    expect(checkVersionConsistency({ ...agreeing, packageJson: { version: '0.2.0' } })).toContain('package-ledger-mismatch:0.2.0!=0.1.0');
    expect(checkVersionConsistency({ ...agreeing, packageJson: { version: 'v0.1.0' } })).toContain('package-version-invalid');
    expect(checkVersionConsistency({ ...agreeing, progressMarkdown: 'no version line' })).toContain('progress-version-line-missing');
    expect(checkVersionConsistency({ ...agreeing, progressMarkdown: progress.replace('**0.1.0**', '**0.0.9**') })).toContain('progress-integrated-mismatch:0.0.9');
    expect(checkVersionConsistency({ ...agreeing, progressMarkdown: progress.replace('**0.2.0**', '**0.3.0**') })).toContain('progress-next-mismatch:0.3.0');
    expect(checkVersionConsistency({ ...agreeing, planMarkdown: plan.replace('Wave 22 → 0.3.0', 'Wave 22 — desk work') })).toContain('plan-pair-missing:Wave 22 → 0.3.0');
    const disordered = ledger.replace('| 0.3.0 | planned | Wave 22', '| 0.1.5 | planned | Wave 22');
    expect(checkVersionConsistency({ ...agreeing, ledgerMarkdown: disordered })).toContain('ledger-order:0.1.5');
    const duplicate = ledger.replace('| 0.3.0 | planned | Wave 22', '| 0.2.0 | planned | Wave 22');
    expect(checkVersionConsistency({ ...agreeing, ledgerMarkdown: duplicate })).toContain('ledger-version-duplicate:0.2.0');
    const noWave = ledger.replace('Wave 22 — desk work', 'desk work');
    expect(checkVersionConsistency({ ...agreeing, ledgerMarkdown: noWave })).toContain('ledger-planned-without-wave:0.3.0');
    const badStatus = ledger.replace('| 0.2.0 | planned |', '| 0.2.0 | someday |');
    expect(checkVersionConsistency({ ...agreeing, ledgerMarkdown: badStatus })).toContain('ledger-status-invalid:0.2.0');
    const onlyPlanned = ledger.replace('| 0.1.0 | integrated |', '| 0.1.0 | planned |');
    expect(checkVersionConsistency({ ...agreeing, ledgerMarkdown: onlyPlanned })).toContain('ledger-no-integrated-row');
    const badVersion = ledger.replace('| 0.2.0 | planned |', '| v0.2.0 | planned |');
    expect(checkVersionConsistency({ ...agreeing, ledgerMarkdown: badVersion })).toContain('ledger-version-invalid:v0.2.0');
    const empty = ledger.split('\n').filter((line) => !/^[|] [0-9]/u.test(line)).join('\n');
    expect(checkVersionConsistency({ ...agreeing, ledgerMarkdown: empty })).toContain('ledger-empty');
    const plannedBehind = ledger.replace('| 0.1.0 | integrated |', '| 0.1.0 | planned |').replace('| 0.2.0 | planned |', '| 0.2.0 | integrated |');
    expect(checkVersionConsistency({ ...agreeing, ledgerMarkdown: plannedBehind })).toContain('ledger-planned-not-after-integrated');
    const nothingPlanned = ledger.split('\n').filter((line) => !line.includes('| planned |')).join('\n');
    expect(checkVersionConsistency({ ...agreeing, ledgerMarkdown: nothingPlanned })).toContain('progress-next-without-planned-row');
  });
});
