import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DATA_VERSION,
  DATA_VERSION_BASELINE_REVISION,
  DATA_VERSION_FROZEN,
  DataVersionError,
  SCHEMA_REVISION_CLASSES,
  dataVersionAt,
  readDataVersionMarkerText,
  refuseNewerDataVersion,
  unclassifiedRevisions,
} from '../../src/service/data-version.js';
import { LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';

// Unit suite for the Data Version freeze (Issue #967; wave 14 decision 2; ADR 0079 §1.1–1.2; ADR 0023 "version marker"): Data
// Version 1 frozen at the 1.0.0 development milestone boundary at the terminal revision of this slice, every later schema
// revision classified before it ships, and the data root's version marker read whole or refused.

/** Every `*_SCHEMA_VERSION = N;` constant the service declares, as the diagnostics suite reads them. */
function serviceSchemaRevisions(): number[] {
  const root = new URL('../../src/service/', import.meta.url);
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts'))
    .flatMap((name) => [...readFileSync(new URL(name.replaceAll('\\', '/'), root), 'utf8').matchAll(/_SCHEMA_VERSION = (\d+);/gu)]
      .map((match) => Number(match[1])));
}

const codeOf = (action: () => unknown): unknown => {
  try {
    action();
    return null;
  } catch (error) {
    return error instanceof DataVersionError ? [error.code, error.message] : error;
  }
};

describe('Data Version 1 frozen at the 1.0.0 boundary', () => {
  it('keeps the frozen baseline while the additive terminal revision stays in Data Version 1', () => {
    expect(DATA_VERSION_FROZEN).toBe(true);
    // The baseline is a literal: when a later slice adds a revision, LATEST moves past it and the classification must follow.
    expect(DATA_VERSION_BASELINE_REVISION).toBe(83);
    expect(LATEST_SCHEMA_VERSION).toBe(101);
    expect(DATA_VERSION).toBe(1);
    expect(DATA_VERSION).toBe(dataVersionAt(LATEST_SCHEMA_VERSION));
  });

  it('classifies every schema revision the service declares after the baseline', () => {
    const revisions = serviceSchemaRevisions();
    expect(Math.max(...revisions)).toBe(LATEST_SCHEMA_VERSION);
    // A new `*_SCHEMA_VERSION` constant past the baseline without an entry in SCHEMA_REVISION_CLASSES fails here.
    expect(unclassifiedRevisions(revisions)).toEqual([]);
  });

  it('names an unclassified revision past the baseline, and only one past it (fixture list)', () => {
    // A later slice adds revisions 84 and 85 and classifies only 84: 85 is named, and nothing at or before the baseline is.
    const classes = [{ revision: 84, class: 'additive' as const }];
    expect(unclassifiedRevisions([54, 83, 84, 85, 85], 83, classes)).toEqual([85]);
    expect(unclassifiedRevisions([54, 83], 83, [])).toEqual([]);
    expect(unclassifiedRevisions([84, 86], 83, [...classes, { revision: 86, class: 'breaking' as const, change: '甲' }])).toEqual([]);
    // A breaking class raises the number only: Data Version 2 from revision 86 on.
    expect([85, 86].map((revision) => dataVersionAt(revision, [...classes, { revision: 86, class: 'breaking' as const, change: '甲' }]))).toEqual([1, 2]);
    expect(SCHEMA_REVISION_CLASSES).toEqual([{ revision: 84, class: 'additive' }, { revision: 85, class: 'additive' }, { revision: 86, class: 'additive' }, { revision: 87, class: 'additive' }, { revision: 88, class: 'additive' }, { revision: 89, class: 'additive' }, { revision: 90, class: 'additive' }, { revision: 91, class: 'additive' }, { revision: 92, class: 'additive' }, { revision: 93, class: 'additive' }, { revision: 94, class: 'additive' }, { revision: 95, class: 'additive' }, { revision: 96, class: 'additive' }, { revision: 97, class: 'additive' }, { revision: 98, class: 'additive' }, { revision: 99, class: 'additive' }, { revision: 100, class: 'additive' }, { revision: 101, class: 'additive' }]);
  });
});

describe('数据版本标记 (ADR 0023)', () => {
  const marker = { dataVersion: 1, schemaRevision: 83, softwareVersion: '1.0.0', writtenAt: '2026-10-18T00:00:00.000Z' };

  it('reads a marker as AI7 writes it, and refuses anything else as unreadable, never as none', () => {
    expect(readDataVersionMarkerText(JSON.stringify(marker))).toEqual(marker);
    const unreadable = ['DATA_VERSION_MARKER_UNREADABLE', '这份数据的数据版本标记无法读取：AI7 没有打开这份数据，也没有改动它。请使用写入这份数据的 AI7 打开，或从备份恢复。'];
    for (const text of [
      '', '{', 'null', '[]', JSON.stringify({ ...marker, path: 'C:/AI7' }), JSON.stringify({ ...marker, dataVersion: 0 }),
      JSON.stringify({ ...marker, schemaRevision: 1.5 }), JSON.stringify({ ...marker, softwareVersion: 'latest' }),
      JSON.stringify({ ...marker, writtenAt: 'yesterday' }), JSON.stringify({ dataVersion: 1, schemaRevision: 83, softwareVersion: '1.0.0' }),
      JSON.stringify({ ...marker, writtenAt: '2026-02-30T00:00:00.000Z' }),
    ]) {
      expect(codeOf(() => readDataVersionMarkerText(text))).toEqual(unreadable);
    }
  });

  it('refuses a newer Data Version or an unknown schema revision in the plain words, and opens the same or an earlier one', () => {
    const reader = { dataVersion: 1, schemaRevision: 83 };
    expect(codeOf(() => refuseNewerDataVersion(marker, reader))).toBeNull();
    expect(codeOf(() => refuseNewerDataVersion({ ...marker, schemaRevision: 60, softwareVersion: '0.1.0' }, reader))).toBeNull();
    expect(codeOf(() => refuseNewerDataVersion({ ...marker, dataVersion: 2, schemaRevision: 90 }, reader)))
      .toEqual(['DATA_VERSION_NEWER', '这份数据来自更新的 AI7（数据版本 2 / 数据库修订 90），请使用更新的 AI7 打开。']);
    expect(codeOf(() => refuseNewerDataVersion({ ...marker, schemaRevision: 84 }, reader)))
      .toEqual(['DATA_VERSION_NEWER', '这份数据来自更新的 AI7（数据版本 1 / 数据库修订 84），请使用更新的 AI7 打开。']);
  });
});
