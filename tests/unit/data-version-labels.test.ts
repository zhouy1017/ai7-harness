import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_VERSION_PROMISE, dataVersionRecordsLabel, dataVersionStateLine, dataVersionUpdateLine, storeVersionLine } from '../../src/renderer/data-version-labels.js';
import { DATA_VERSION, DATA_VERSION_FROZEN, latestSoftwareUpdate, readSoftwareVersion, type StoredVersion } from '../../src/service/data-version.js';

// Unit suite for 数据版本 (Issue #433, plan slice S85a; V2-UX-DSTO-016; ADR 0079 §1): the Data Version this software reads,
// not yet frozen before the first packaged release; the software version read from the package it ships in; the latest
// software update found in the store's version records; and every line 数据与存储 states.

const record = (ordinal: number, softwareVersion: string, dataVersion = 1): StoredVersion => ({
  recordId: `record-${ordinal}`, ordinal, softwareVersion, dataVersion, schemaRevision: 54, recordedAt: `2026-09-${String(ordinal).padStart(2, '0')}T00:00:00.000Z`,
});

describe('数据版本', () => {
  it('reads Data Version 1, not frozen before the first packaged release', () => {
    expect([DATA_VERSION, DATA_VERSION_FROZEN]).toEqual([1, false]);
  });

  it('reads the software version from the package it ships in, and refuses a package that names none', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ai7-data-version-'));
    try {
      for (const [version, expected] of [['0.1.0', '0.1.0'], ['1.2.3-beta.2', '1.2.3-beta.2']] as const) {
        writeFileSync(join(root, 'package.json'), JSON.stringify({ version }));
        await expect(readSoftwareVersion(root)).resolves.toBe(expected);
      }
      for (const content of [JSON.stringify({}), JSON.stringify({ version: 'latest' }), JSON.stringify({ version: 1 }), '{']) {
        writeFileSync(join(root, 'package.json'), content);
        await expect(readSoftwareVersion(root)).rejects.toMatchObject({ code: 'SOFTWARE_VERSION_UNAVAILABLE' });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('finds the latest software change in the records, and none while one software opened the store', () => {
    expect(latestSoftwareUpdate([])).toBeNull();
    expect(latestSoftwareUpdate([record(1, '0.1.0')])).toBeNull();
    expect(latestSoftwareUpdate([record(1, '0.0.9'), record(2, '0.1.0')])).toEqual({
      from: '0.0.9', to: '0.1.0', fromDataVersion: 1, toDataVersion: 1, recordedAt: '2026-09-02T00:00:00.000Z',
    });
    // A later record for the same software — a schema revision within the same Data Version — is not an update of it.
    expect(latestSoftwareUpdate([record(1, '0.0.9'), record(2, '0.1.0'), record(3, '0.1.0')])?.to).toBe('0.1.0');
    expect(latestSoftwareUpdate([record(1, '0.0.9'), record(2, '0.1.0'), record(3, '0.2.0', 2)])).toMatchObject({ from: '0.1.0', to: '0.2.0', fromDataVersion: 1, toDataVersion: 2 });
  });
});

describe('数据版本 words', () => {
  it('says what the Data Version promises and whether it is frozen', () => {
    expect(DATA_VERSION_PROMISE).toBe('数据版本只在旧版软件无法再读取这些数据时才会改变；普通的软件更新保持它不变。');
    expect(dataVersionStateLine({ frozen: false, dataVersion: 1 })).toBe('开发阶段：首个正式发布时冻结为数据版本 1；在那之前，开发中的数据可以重建。');
    expect(dataVersionStateLine({ frozen: true, dataVersion: 1 })).toBe('数据版本 1 已冻结。');
  });

  it('says what the latest software update did to the Data Version, and writes each record', () => {
    expect(dataVersionUpdateLine(null)).toBe('这份数据还没有经历过软件更新。');
    const kept = { from: '0.0.9', to: '0.1.0', fromDataVersion: 1, toDataVersion: 1, recordedAt: '2026-09-25T00:00:00.000Z' };
    expect(dataVersionUpdateLine(kept)).toBe('软件从 0.0.9 更新到 0.1.0；数据版本仍为 1，数据无需变更。');
    expect(dataVersionUpdateLine({ ...kept, to: '1.0.0', toDataVersion: 2 })).toBe('软件从 0.0.9 更新到 1.0.0；数据版本从 1 变为 2。');
    expect(storeVersionLine({ softwareVersion: '0.1.0', dataVersion: 1, recordedAt: '2026-09-25T00:00:00.000Z' }, (iso) => `〔${iso.slice(0, 10)}〕`))
      .toBe('〔2026-09-25〕 · 软件 0.1.0 · 数据版本 1');
    expect([dataVersionRecordsLabel(1, false), dataVersionRecordsLabel(20, true)]).toEqual(['版本记录（1）', '版本记录（最近 20 条）']);
  });
});
