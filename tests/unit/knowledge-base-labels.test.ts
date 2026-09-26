import { describe, expect, it } from 'vitest';
import {
  EXEMPLARS_LATER,
  exemplarAttribution,
  exemplarDesignation,
  exemplarLine,
  GUIDELINE_CANCEL,
  GUIDELINE_CONFIRM,
  GUIDELINE_IMPORT,
  KNOWLEDGE_BASE_TAB_VIEWS,
  guidelineAppliedBy,
  guidelineCitations,
  guidelineFixedStatement,
  guidelineImported,
  guidelineOlderBooks,
  guidelinePreviewChanges,
  guidelinePreviewHeading,
  guidelineVersionLine,
  guidelineVersionPill,
} from '../../src/renderer/knowledge-base-labels.js';
import { MAX_GUIDELINE_CLAUSES, parseGuidelineClauses } from '../../src/service/review-guidelines.js';
import type { ReviewGuidelineVersionProjection } from '../../src/shared/protocol.js';

// Unit suite for 知识库's words (Issue #427, plan slice S79a; editor-surfaces §8.4, V2-UX-KB-001 to KB-010) and the reading
// of a guideline file's numbered clauses (KB-003).

describe('知识库', () => {
  it('names its seven classes in the specification\'s order, and says which arrive later', () => {
    expect(KNOWLEDGE_BASE_TAB_VIEWS.map((view) => view.label)).toEqual(['审阅规范文件', '评估方案', '工序与规则', '社级编辑记忆', '范例', '资料库', '外部来源留存']);
    expect(KNOWLEDGE_BASE_TAB_VIEWS.filter((view) => view.pending === null).map((view) => view.tab)).toEqual(['guidelines', 'rules', 'exemplars']);
    for (const view of KNOWLEDGE_BASE_TAB_VIEWS) {
      expect(view.holds.length).toBeGreaterThan(0);
      if (view.pending !== null) expect(view.pending.startsWith('尚未提供')).toBe(true);
    }
    // 范例 keeps the Owner's default and 资料库 its gate, as the specification states them.
    expect(KNOWLEDGE_BASE_TAB_VIEWS.find((view) => view.tab === 'exemplars')!.holds).toContain('学习准入默认「仅本社」');
    expect(KNOWLEDGE_BASE_TAB_VIEWS.find((view) => view.tab === 'library')!.holds).toContain('「允许参考」');
  });

  it('says 审阅规范文件 in the editor\'s words: the version and issuer, its use, the Books on an older one, and each version', () => {
    expect([GUIDELINE_IMPORT, GUIDELINE_CONFIRM, GUIDELINE_CANCEL]).toEqual(['导入新版本…', '确认导入', '取消']);
    expect(guidelineVersionPill({ currentOrdinal: 2, issuer: '本社' })).toBe('第 2 版 · 本社');
    expect(guidelineAppliedBy({ appliedBy: [{ categoryId: 'a', label: '错别字与规范用语' }, { categoryId: 'b', label: '体例与格式' }] })).toBe('用于：错别字与规范用语、体例与格式');
    expect(guidelineOlderBooks({ olderVersionBooks: [], olderVersionBookCount: 0, currentOrdinal: 2 })).toBeNull();
    expect(guidelineOlderBooks({ olderVersionBooks: [{ bookId: 'x', bookTitle: '甲书', ordinal: 1 }], olderVersionBookCount: 1, currentOrdinal: 3 }))
      .toBe('还在用旧版：《甲书》第 1 版；这些书新准备的审阅会按第 3 版；已准备的审阅仍用原版本。');
    // Past the Books it names, the line says how many there are.
    expect(guidelineOlderBooks({ olderVersionBooks: [{ bookId: 'x', bookTitle: '甲书', ordinal: 1 }, { bookId: 'y', bookTitle: '乙书', ordinal: 2 }], olderVersionBookCount: 14, currentOrdinal: 3 }))
      .toBe('还在用旧版：《甲书》第 1 版、《乙书》第 2 版 等 14 本书；这些书新准备的审阅会按第 3 版；已准备的审阅仍用原版本。');
    // A document AI7 fixes says why it takes no house version; one whose clauses the categories read says nothing.
    expect(guidelineFixedStatement({ use: 'clauses', appliedBy: [{ categoryId: 'a', label: '错别字与规范用语' }] })).toBeNull();
    expect(guidelineFixedStatement({ use: 'leads', appliedBy: [{ categoryId: 'p', label: '情节逻辑与前后一致' }] }))
      .toBe('「情节逻辑与前后一致」把基线分析里的线索变成批注，不按这里的条款找问题。这是 AI7 的固定说明，不能导入新版本。');
    expect(guidelineFixedStatement({ use: 'factual-kind', appliedBy: [{ categoryId: 'f', label: '事实核查' }] }))
      .toBe('「事实核查」按 AI7 固定的事实核查契约执行，不读取这里的条款。这是 AI7 的固定说明，不能导入新版本。');
    expect([guidelineCitations(0), guidelineCitations(4)]).toEqual(['未被引用', '被引用 4 次']);
    const version = (overrides: Partial<ReviewGuidelineVersionProjection>): ReviewGuidelineVersionProjection => ({
      ordinal: 1, issuer: 'AI7 内置默认', versionId: null, recordedAt: null, source: null, clauseCount: 4, digest: 'a'.repeat(64), usedByCount: 0, usedBy: [], ...overrides,
    });
    expect(guidelineVersionLine(version({}), () => 'T')).toBe('第 1 版 · AI7 内置默认 · 内置 · 4 条 · 还没有审阅用过');
    expect(guidelineVersionLine(version({
      ordinal: 2, issuer: '本社', recordedAt: '2026-09-25T00:00:00.000Z', clauseCount: 5,
      source: { displayName: '本社文字规范.docx', format: 'docx', sha256: 'b'.repeat(64), bytes: 10 },
      usedByCount: 1, usedBy: [{ bookId: 'x', bookTitle: '甲书', reviewRunId: 'r', reviewOrdinal: 2, createdAt: '2026-09-25T00:00:00.000Z' }],
    }), () => '9月25日 08:00')).toBe('第 2 版 · 本社 · 导入于 9月25日 08:00 · 本社文字规范.docx · 5 条 · 用于 《甲书》第 2 次审阅');
    // Past the reviews it names, the line says how many used the version and names the latest.
    expect(guidelineVersionLine(version({
      usedByCount: 12, usedBy: [
        { bookId: 'x', bookTitle: '甲书', reviewRunId: 'r2', reviewOrdinal: 7, createdAt: '2026-09-25T00:00:00.000Z' },
        { bookId: 'y', bookTitle: '乙书', reviewRunId: 'r1', reviewOrdinal: 3, createdAt: '2026-09-24T00:00:00.000Z' },
      ],
    }), () => 'T')).toBe('第 1 版 · AI7 内置默认 · 内置 · 4 条 · 用于 12 次审阅，最近：《甲书》第 7 次审阅、《乙书》第 3 次审阅');
    expect(guidelinePreviewHeading({ ordinal: 2, title: '文字规范条款' })).toBe('将导入为《文字规范条款》第 2 版');
    expect(guidelinePreviewChanges({
      source: { displayName: '规范.txt', format: 'text', sha256: 'c'.repeat(64), bytes: 3 }, currentOrdinal: 1,
      changes: { changed: 2, added: 1, removed: 0 }, clauseCount: 1,
    })).toBe('规范.txt · 1 条 · 与第 1 版相比：改动 2 条，新增 1 条，删去 0 条');
    expect(guidelineImported('文字规范条款', 2)).toBe('已导入《文字规范条款》第 2 版；新准备的审阅按第 2 版；已准备的审阅仍用原版本。');
  });
});

describe('范例 (Issue #427, S79b)', () => {
  it('names a published Book\'s attribution and each exemplar with its version, delivery, arrival and eligibility', () => {
    expect(exemplarAttribution({ authors: ['作者甲', '作者丙'], editors: [] })).toBe('作者：作者甲、作者丙 · 责编：未填写');
    // Which designation the time is — a Book set as a 发稿版本 twice reads its second — and a 撤回 that holds it.
    expect(exemplarDesignation({ designatedAt: 'x', publicationOrdinal: 2, withdrawn: false }, () => '9月25日')).toBe('第 2 次设为发稿版本于 9月25日');
    expect(exemplarDesignation({ designatedAt: 'x', publicationOrdinal: 1, withdrawn: true }, () => '9月25日'))
      .toBe('第 1 次设为发稿版本于 9月25日 · 已在 AI7 内撤回；之后交付的文档，另设发稿版本后才归入');
    const exemplar = {
      documentId: 'd', typeId: 'news-release', typeLabel: '新闻稿', version: 3, revisionId: 'r', revisionDigest: 'a'.repeat(64),
      deliveredTo: '编辑部', deliveredAt: 't1', archivedAt: 't2', earlierVersionCount: 2, earlierVersions: [1, 2], eligibility: 'house-only' as const,
    };
    expect(exemplarLine(exemplar, (iso) => iso)).toBe('新闻稿 · 版本 3 · 交付给编辑部于 t1 · 归入于 t2 · 学习准入：仅本社 · 此前还交付过版本 1、2');
    expect(exemplarLine({ ...exemplar, earlierVersionCount: 0, earlierVersions: [] }, (iso) => iso)).toBe('新闻稿 · 版本 3 · 交付给编辑部于 t1 · 归入于 t2 · 学习准入：仅本社');
    // Past the versions it names, the line says how many there were.
    expect(exemplarLine({ ...exemplar, version: 14, earlierVersionCount: 12, earlierVersions: [12, 13] }, (iso) => iso))
      .toBe('新闻稿 · 版本 14 · 交付给编辑部于 t1 · 归入于 t2 · 学习准入：仅本社 · 此前还交付过 12 个版本，最近的是版本 12、13');
    expect(EXEMPLARS_LATER).toHaveLength(2);
  });
});

describe('a guideline file\'s numbered clauses', () => {
  it('reads Arabic and Chinese numbering, continues a clause over its next paragraphs, and skips what comes before the first', () => {
    expect(parseGuidelineClauses(['本社规范', '', '1. 第一条。', '2、第二条，', '  接着写。', '3）第三条。'], 'p')).toEqual([
      { clauseId: 'p/1', text: '第一条。' },
      { clauseId: 'p/2', text: '第二条， 接着写。' },
      { clauseId: 'p/3', text: '第三条。' },
    ]);
    expect(parseGuidelineClauses(['第一条 甲。', '第二条：乙。', '以上两条自发布之日起施行。'], 'q').map((clause) => clause.clauseId)).toEqual(['q/1', 'q/2']);
    expect(parseGuidelineClauses(Array.from({ length: 12 }, (_, index) => `第${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][index]}条 条款。`), 'r').map((clause) => clause.clauseId).at(-1)).toBe('r/12');
    // Full-width digits number a clause as the half-width ones do.
    expect(parseGuidelineClauses(['１．甲。', '２、乙。', '３）丙。'], 's')).toEqual([
      { clauseId: 's/1', text: '甲。' },
      { clauseId: 's/2', text: '乙。' },
      { clauseId: 's/3', text: '丙。' },
    ]);
    expect(parseGuidelineClauses(['第１条 甲。', '第２条：乙。'], 't').map((clause) => clause.clauseId)).toEqual(['t/1', 't/2']);
  });

  it('refuses a file that is no numbered list of short clauses, naming what is wrong', () => {
    const code = (paragraphs: string[]): string => {
      try {
        parseGuidelineClauses(paragraphs, 'p');
      } catch (error) {
        return (error as { code: string }).code;
      }
      return 'no-error';
    };
    expect(code(['没有编号。'])).toBe('REVIEW_GUIDELINE_NO_CLAUSES');
    expect(code(['1. 一。', '3. 三。'])).toBe('REVIEW_GUIDELINE_NUMBERING');
    expect(code(['2. 二。'])).toBe('REVIEW_GUIDELINE_NUMBERING');
    expect(code(['1.', '2. 二。'])).toBe('REVIEW_GUIDELINE_EMPTY_CLAUSE');
    expect(code([`1. ${'字'.repeat(301)}`])).toBe('REVIEW_GUIDELINE_CLAUSE_TOO_LONG');
    expect(code(Array.from({ length: MAX_GUIDELINE_CLAUSES + 1 }, (_, index) => `${index + 1}. 条。`))).toBe('REVIEW_GUIDELINE_TOO_MANY');
    expect(code(Array.from({ length: MAX_GUIDELINE_CLAUSES }, (_, index) => `${index + 1}. 条。`))).toBe('no-error');
  });
});
