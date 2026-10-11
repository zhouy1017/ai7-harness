import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeRequest } from '../../src/service/request-frames.js';
import { exemplarDesignation, exemplarLine } from '../../src/renderer/knowledge-base-labels.js';
import type { ExemplarProjection, ServiceRequest } from '../../src/shared/protocol.js';

const request = (value: unknown) => decodeRequest(new TextEncoder().encode(JSON.stringify(value)));
describe('imported exemplar boundaries and editor words', () => {
  it('decodes exact picker/import/decision requests and refuses extra authority or malformed parameters', () => {
    const preview = { id: randomUUID(), op: 'previewImportedExemplar', input: { path: resolve('synthetic.txt') } } satisfies ServiceRequest;
    const imported = { id: randomUUID(), op: 'importEarlierExemplar', input: {
      previewId: randomUUID(), bookId: null, bookTitle: '测试图书', authors: ['测试作者'], editors: ['测试责编'], typeId: 'news-release', expectedVersion: 0,
    } } satisfies ServiceRequest;
    const decision = { id: randomUUID(), op: 'decideImportedExemplar', input: {
      revisionId: randomUUID(), revisionDigest: 'a'.repeat(64), expectedDecisions: 1, choice: 'excluded',
    } } satisfies ServiceRequest;
    for (const frame of [preview, imported, decision]) {
      expect(request(frame)).toEqual(frame);
      expect(() => request({ ...frame, input: { ...frame.input, autoPublish: true } })).toThrow();
    }
    expect(() => request({ ...preview, input: { path: 'relative.txt' } })).toThrow();
    expect(() => request({ ...imported, input: { ...imported.input, expectedVersion: -1 } })).toThrow();
    expect(() => request({ ...decision, input: { ...decision.input, choice: 'book' } })).toThrow();
  });
  it('calls an earlier Book imported and names its version, original and eligibility without inventing delivery', () => {
    expect(exemplarDesignation({ imported: true, publicationOrdinal: 0, designatedAt: 'T', withdrawn: false }, (instant) => instant))
      .toBe('以前出版的图书 · 导入于 T');
    const entry: ExemplarProjection = { documentId: 'd', revisionId: 'r', revisionDigest: 'a'.repeat(64), typeId: 'news-release', typeLabel: '新闻稿',
      version: 2, deliveredTo: '', deliveredAt: 'T', archivedAt: 'T', eligibility: 'excluded', earlierVersions: [1], earlierVersionCount: 1,
      imported: { sourceName: '测试.txt', decisions: 2 } };
    expect(exemplarLine(entry, (instant) => instant)).toBe('新闻稿 · 版本 2 · 导入于 T · 原件：测试.txt · 学习准入：明确排除 · 此前导入过 1 个版本');
    expect(exemplarLine({ ...entry, eligibility: 'deferred' }, (instant) => instant)).toContain('稍后决定');
  });
});
