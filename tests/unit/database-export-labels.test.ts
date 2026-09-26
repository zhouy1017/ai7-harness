import { describe, expect, it } from 'vitest';
import {
  DATABASE_EXPORT_ACTIONS,
  DATABASE_EXPORT_HEADING,
  DATABASE_EXPORT_LEDE,
  DATABASE_EXPORT_NO_RECORDS,
  DATABASE_EXPORT_STATUS_LINES,
  DATABASE_EXPORT_STEPS,
  databaseExportActivityLine,
  databaseExportContentsLine,
  databaseExportOutcomeLine,
  databaseExportPreparedRows,
  databaseExportRecordLine,
  databaseExportRecordsLabel,
} from '../../src/renderer/database-export-labels.js';
import type { DatabaseExportPreparationProjection, DatabaseExportReceiptProjection } from '../../src/shared/protocol.js';

// Unit suite for 导出数据库's words (Issue #434, plan slice S86a; V2-UX-DSTO-017; ADR 0079 §1.6, §1.7), byte for byte: what the
// package holds and never does, the prepared file, and what each export came to.

const preparation: DatabaseExportPreparationProjection = {
  preparationId: '00000000-0000-4000-8000-000000000001',
  fileName: 'AI7 数据库 2026-09-25.ai7db',
  destination: 'C:\\Users\\编辑\\Documents\\AI7 数据库 2026-09-25.ai7db',
  disposition: 'create',
  dispositionLabel: '新建文件',
  payloadBytes: 3 * 1024 * 1024,
  dataVersion: 1,
  softwareVersion: '0.1.0',
  contents: { books: 3, sourceVersions: 5, libraryMaterials: 2, series: 1 },
  preparedAt: '2026-09-25T13:00:00.000Z',
  receipt: null,
};

const receipt: DatabaseExportReceiptProjection = {
  preparationId: preparation.preparationId,
  fileName: preparation.fileName,
  destination: preparation.destination,
  approvedAt: '2026-09-25T13:01:00.000Z',
  outcome: 'created',
  outcomeLabel: '已导出到所选位置',
  detail: '已新建「AI7 数据库 2026-09-25.ai7db」。',
  byteLength: preparation.payloadBytes,
  recordedAt: '2026-09-25T13:01:02.000Z',
};

describe('导出数据库\'s words', () => {
  it('says what the one file holds and never does, and names the actions as every export does', () => {
    expect(DATABASE_EXPORT_HEADING).toBe('导出数据库');
    expect(DATABASE_EXPORT_LEDE).toBe('把全部图书、稿件与历史、知识库和设置打包成一个文件。文件不含模型服务凭据，也不加密；包里记录数据版本和导出时间。');
    expect(DATABASE_EXPORT_ACTIONS).toEqual({ choose: '导出数据库…', approve: '按上述方式导出', cancel: '取消', stop: '取消导出' });
    expect(DATABASE_EXPORT_STATUS_LINES.cancelled).toBe('已取消选择保存位置，没有写入任何文件。');
    expect(DATABASE_EXPORT_STATUS_LINES.closed).toBe('已取消这次导出，没有写入任何文件。');
    expect(DATABASE_EXPORT_NO_RECORDS).toBe('还没有导出过数据库。');
  });

  it('says how far an export under way has come, and never reads it done before it is (Issue #434 review, V2-UX-EXP-011)', () => {
    const at = (step: keyof typeof DATABASE_EXPORT_STEPS | null, completedBytes: number, totalBytes: number): string =>
      databaseExportActivityLine({ step, completedBytes, totalBytes });
    expect(at('packing', 0, 0)).toBe('正在打包数据库 · 0%');
    expect(at('packing', 421, 1000)).toBe('正在打包数据库 · 42%');
    expect(at('verifying', 1000, 1000)).toBe('正在核对准备好的文件 · 99%');
    expect(at('writing', 2000, 4000)).toBe('正在写入所选位置 · 50%');
    // Putting the file in place is the one step nothing stops, and it has no count.
    expect(at('committing', 3500, 4000)).toBe('正在把文件放到所选位置，已不能取消');
    expect(at(null, 4000, 4000)).toBe('');
    expect(DATABASE_EXPORT_STATUS_LINES.writingStopped).toBe('已取消导出，所选位置没有变化；准备好的文件还在，可以再次按上述方式导出。');
  });

  it('states the prepared file whole before it is written', () => {
    expect(databaseExportContentsLine(preparation.contents)).toBe('3 本图书 · 5 个来源版本 · 资料库 2 项 · 书系 1 个');
    expect(databaseExportPreparedRows(preparation)).toEqual([
      ['文件', '「AI7 数据库 2026-09-25.ai7db」 · 3.0 MB'],
      ['位置', 'C:\\Users\\编辑\\Documents\\AI7 数据库 2026-09-25.ai7db'],
      ['方式', '新建文件'],
      ['内容', '3 本图书 · 5 个来源版本 · 资料库 2 项 · 书系 1 个'],
      ['版本', '数据版本 1 · 软件 0.1.0'],
    ]);
  });

  it('says what each export came to, and how many there were', () => {
    expect(databaseExportOutcomeLine(receipt)).toBe('已导出到所选位置：已新建「AI7 数据库 2026-09-25.ai7db」。');
    expect(databaseExportRecordLine(receipt, (iso) => `〔${iso.slice(11, 16)}〕`)).toBe('〔13:01〕 · 「AI7 数据库 2026-09-25.ai7db」 · 已导出到所选位置');
    // An interrupted write has no receipt time: it is listed by its approval.
    expect(databaseExportRecordLine({ ...receipt, recordedAt: null, outcomeLabel: '结果待确认' }, (iso) => `〔${iso.slice(11, 16)}〕`))
      .toBe('〔13:01〕 · 「AI7 数据库 2026-09-25.ai7db」 · 结果待确认');
    expect([databaseExportRecordsLabel(0, 0), databaseExportRecordsLabel(2, 2), databaseExportRecordsLabel(20, 23)])
      .toEqual(['导出记录（0）', '导出记录（2）', '导出记录（最近 20 次，共 23 次）']);
  });
});
