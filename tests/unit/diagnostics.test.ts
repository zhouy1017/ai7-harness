import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIAGNOSTICS_CHANNELS, buildDiagnosticsBundle, sanitizeCrashRecord, type DiagnosticsInputs } from '../../src/main/diagnostics.js';
import { DATA_VERSION } from '../../src/service/data-version.js';

const facts: DiagnosticsInputs['facts'] = {
  buildIdentity: { schema: 1, softwareVersion: '0.1.0', dataVersion: 1, buildNumber: 1234, sourceCommit: 'a'.repeat(40), dirty: true },
  appVersion: '0.1.0', dataVersion: 1, schemaRevision: 83, protocol: 161, policySetVersion: 'v15', platform: 'win32',
  arch: 'x64', electron: '42.0.0', node: '24.18.1', locale: 'zh-CN', uptimeSeconds: 42, windowCount: 2,
};
describe('pure diagnostics bundle', () => {
  it('preserves prerelease plus build metadata without inventing historical provenance', () => {
    const softwareVersion = '0.1.0-rc.1+source.7';
    const current = { ...facts, appVersion: softwareVersion, buildIdentity: { ...facts.buildIdentity!, softwareVersion } };
    const historical = { appVersion: '0.0.9', schemaRevision: 82 };
    const files = buildDiagnosticsBundle({ facts: current, crashes: [historical], preferences: {} });
    expect(JSON.parse(files['summary.json']!)).toMatchObject({ appVersion: softwareVersion, buildIdentity: current.buildIdentity });
    expect(JSON.parse(files['crashes/01-uncaughtException.json']!)).toMatchObject({ appVersion: '0.0.9', buildIdentity: null, schemaRevision: 82 });
    expect(sanitizeCrashRecord(current)).toMatchObject({ appVersion: softwareVersion, buildIdentity: current.buildIdentity });
    expect(sanitizeCrashRecord({ ...historical, buildIdentity: current.buildIdentity }).buildIdentity).toBeNull();
    const olderIdentity = { ...current.buildIdentity, softwareVersion: historical.appVersion, buildNumber: 1000, sourceCommit: 'b'.repeat(40) };
    expect(sanitizeCrashRecord({ ...historical, buildIdentity: olderIdentity }).buildIdentity).toEqual(olderIdentity);
  });
  it('excludes protected inputs and projects exactly the allowed files', () => {
    const manuscript = 'SYNTHETIC_MANUSCRIPT_BLOCK_DO_NOT_EXPORT';
    const files = buildDiagnosticsBundle({ facts, preferences: { version: 1, values: { collapsed: true } },
      crashes: [{ instant: '2026-10-17T00:00:00.000Z', kind: 'uncaughtException', reason: manuscript,
        stack: `Error: ${manuscript}\n${manuscript}\n    at ${manuscript} (D:/data-root/books/private/book.ts:12:3)\n    at C:\\Users\\Synthetic\\development.key.txt:7:4\n    at https://example.invalid/frame.js?token=synthetic-query:9:2` }],
      fixtureTree: { 'books/manuscript.txt': manuscript, 'development.key.txt': 'synthetic-secret',
        'database.sqlite': 'synthetic-database', 'provider-cache/entry': manuscript, 'export-staging/book.docx': manuscript },
    });
    expect(Object.keys(files).sort()).toEqual(['README.txt', 'crashes/01-uncaughtException.json', 'summary.json']);
    const output = JSON.stringify(files);
    for (const excluded of [manuscript, 'data-root', 'C:\\Users', 'Synthetic', 'development.key.txt', 'synthetic-query', 'example.invalid', 'synthetic-secret', 'synthetic-database']) {
      expect(output).not.toContain(excluded);
    }
    expect(output).toContain('<redacted-path>');
    expect(JSON.parse(files['summary.json']!)).toMatchObject({ ...facts, logs: '无日志文件' });
    // 数据版本 and 数据库修订 named apart (Issue #967); a crash record carries the schema revision under its own name.
    expect(files['README.txt']!.split('\n')[1]).toBe('数据版本 1 · 数据库修订 83');
    expect(JSON.parse(files['crashes/01-uncaughtException.json']!)).toHaveProperty('schemaRevision', 0);
    expect(JSON.parse(files['crashes/01-uncaughtException.json']!)).not.toHaveProperty('dataVersion');
  });
  it('removes secret-like preference keys recursively and redacts arbitrary strings', () => {
    const files = buildDiagnosticsBundle({ facts, crashes: [], preferences: { version: 1,
      values: { mySecret: 's', accessTOKEN: 't', apiKey: 'k', nested: { passwordSecret: 'p', enabled: true },
        name: 'synthetic-private-title', scale: 1.2, items: [{ refreshToken: 'r', active: false }] } } });
    expect(JSON.parse(files['summary.json']!).preferences).toEqual({ version: 1, values: {
      nested: { enabled: true }, name: '<redacted>', scale: 1.2, items: [{ active: false }],
    } });
  });
  it('keeps the main-process version facts and preload channels synchronized with their owners', () => {
    const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
    const application = source('src/main/application.ts');
    // The schema revision is the service's newest schema constant; a schema bump must move the crash/summary fact with it, and
    // the Data Version beside it is the service's own (Issue #967).
    const schemaVersions = readdirSync(new URL('../../src/service/', import.meta.url), { recursive: true, encoding: 'utf8' })
      .filter((name) => name.endsWith('.ts'))
      .flatMap((name) => [...source(`src/service/${name.replaceAll('\\', '/')}`).matchAll(/_SCHEMA_VERSION = (\d+);/gu)].map((match) => Number(match[1])));
    expect(application.match(/schemaRevision: (\d+), protocol: SERVICE_PROTOCOL_VERSION/u)?.[1]).toBe(String(Math.max(...schemaVersions)));
    expect(application).toContain('dataVersion: buildIdentity.dataVersion, schemaRevision: 93, protocol: SERVICE_PROTOCOL_VERSION');
    expect(facts.buildIdentity!.dataVersion).toBe(DATA_VERSION);
    // The summary reads the same built active policy set the service's launch policy verifies.
    const activeSet = source('src/service/launch-policy.ts').match(/const ACTIVE_SET_PATH = 'docs\/policies\/([^']+)';/u)?.[1];
    expect(activeSet).toBeDefined();
    expect(application).toContain(`resolve(__dirname, '..', 'docs', 'policies', '${activeSet}')`);
    // The sandboxed preload cannot import the main module at runtime, so its literals must match the handler channels.
    const preload = source('src/main/preload.ts');
    for (const [member, channel] of Object.entries(DIAGNOSTICS_CHANNELS)) {
      expect(preload.split(/\r?\n/u).find((line) => line.startsWith(`  ${member}: `))).toContain(`('${channel}')`);
    }
  });
});
