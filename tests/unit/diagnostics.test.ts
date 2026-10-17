import { describe, expect, it } from 'vitest';
import { buildDiagnosticsBundle, type DiagnosticsInputs } from '../../src/main/diagnostics.js';

const facts: DiagnosticsInputs['facts'] = {
  appVersion: '0.1.0', dataVersion: 83, protocol: 151, policySetVersion: 'v15', platform: 'win32',
  arch: 'x64', electron: '42.0.0', node: '24.18.1', locale: 'zh-CN', uptimeSeconds: 42, windowCount: 2,
};
describe('pure diagnostics bundle', () => {
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
  });
  it('removes secret-like preference keys recursively and redacts arbitrary strings', () => {
    const files = buildDiagnosticsBundle({ facts, crashes: [], preferences: { version: 1,
      values: { mySecret: 's', accessTOKEN: 't', apiKey: 'k', nested: { passwordSecret: 'p', enabled: true },
        name: 'synthetic-private-title', scale: 1.2, items: [{ refreshToken: 'r', active: false }] } } });
    expect(JSON.parse(files['summary.json']!).preferences).toEqual({ version: 1, values: {
      nested: { enabled: true }, name: '<redacted>', scale: 1.2, items: [{ active: false }],
    } });
  });
});
