import { describe, expect, it } from 'vitest';
import {
  LIBRARY_EMPTY,
  LIBRARY_HOUSE_CONSEQUENCE,
  eligibilityChoiceLabel,
  libraryAttributionLine,
  libraryBytes,
  libraryDecisionLine,
  libraryEligibilityLine,
  libraryPreviewFacts,
  libraryPreviewHeading,
  libraryReferenceLine,
  librarySourceLine,
  artifactLine,
  procedureLine,
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
  guidelineImported,
  guidelineOlderBooks,
  guidelinePreviewChanges,
  guidelinePreviewHeading,
  guidelineVersionLine,
  guidelineVersionPill,
} from '../../src/renderer/knowledge-base-labels.js';
import { MAX_GUIDELINE_CLAUSES, parseGuidelineClauses } from '../../src/service/review-guidelines.js';
import type { LibraryMaterialProjection, ReviewGuidelineVersionProjection } from '../../src/shared/protocol.js';

// Unit suite for 知识库's words (Issue #427, plan slice S79a; editor-surfaces §8.4, V2-UX-KB-001 to KB-010) and the reading
// of a guideline file's numbered clauses (KB-003).

describe('知识库', () => {
  it('names its seven classes in the specification\'s order, and says which arrive later', () => {
    expect(KNOWLEDGE_BASE_TAB_VIEWS.map((view) => view.label)).toEqual(['审阅规范文件', '评估方案', '工序与规则', '社级编辑记忆', '范例', '资料库', '外部来源留存']);
    expect(KNOWLEDGE_BASE_TAB_VIEWS.filter((view) => view.pending === null).map((view) => view.tab)).toEqual(['guidelines', 'rules', 'exemplars', 'library']);
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
    expect(guidelineOlderBooks({ olderVersionBooks: [], currentOrdinal: 2 })).toBeNull();
    expect(guidelineOlderBooks({ olderVersionBooks: [{ bookId: 'x', bookTitle: '甲书', ordinal: 1 }], currentOrdinal: 3 }))
      .toBe('还在用旧版：《甲书》第 1 版；这些书下次审阅会按第 3 版。');
    expect([guidelineCitations(0), guidelineCitations(4)]).toEqual(['未被引用', '被引用 4 次']);
    const version = (overrides: Partial<ReviewGuidelineVersionProjection>): ReviewGuidelineVersionProjection => ({
      ordinal: 1, issuer: 'AI7 内置默认', versionId: null, recordedAt: null, source: null, clauseCount: 4, digest: 'a'.repeat(64), usedBy: [], ...overrides,
    });
    expect(guidelineVersionLine(version({}), () => 'T')).toBe('第 1 版 · AI7 内置默认 · 内置 · 4 条 · 还没有审阅用过');
    expect(guidelineVersionLine(version({
      ordinal: 2, issuer: '本社', recordedAt: '2026-09-25T00:00:00.000Z', clauseCount: 5,
      source: { displayName: '本社文字规范.docx', format: 'docx', sha256: 'b'.repeat(64), bytes: 10 },
      usedBy: [{ bookId: 'x', bookTitle: '甲书', reviewRunId: 'r', reviewOrdinal: 2, createdAt: '2026-09-25T00:00:00.000Z' }],
    }), () => '9月25日 08:00')).toBe('第 2 版 · 本社 · 导入于 9月25日 08:00 · 本社文字规范.docx · 5 条 · 用于 《甲书》第 2 次审阅');
    expect(guidelinePreviewHeading({ ordinal: 2, title: '文字规范条款' })).toBe('将导入为《文字规范条款》第 2 版');
    expect(guidelinePreviewChanges({
      source: { displayName: '规范.txt', format: 'text', sha256: 'c'.repeat(64), bytes: 3 }, currentOrdinal: 1,
      changes: { changed: 2, added: 1, removed: 0 }, clauses: [{ clauseId: 'a/1', number: 1, text: '一' }],
    })).toBe('规范.txt · 1 条 · 与第 1 版相比：改动 2 条，新增 1 条，删去 0 条');
    expect(guidelineImported('文字规范条款', 2)).toBe('已导入《文字规范条款》第 2 版；之后的审阅按第 2 版。');
  });
});

describe('范例 (Issue #427, S79b)', () => {
  it('names a published Book\'s attribution and each exemplar with its version, delivery, arrival and eligibility', () => {
    expect(exemplarAttribution({ authors: ['作者甲', '作者丙'], editors: [] })).toBe('作者：作者甲、作者丙 · 责编：未填写');
    expect(exemplarDesignation({ designatedAt: 'x' }, () => '9月25日')).toBe('设为发稿版本于 9月25日');
    const exemplar = {
      documentId: 'd', typeId: 'news-release', typeLabel: '新闻稿', version: 3, revisionId: 'r', revisionDigest: 'a'.repeat(64),
      deliveredTo: '编辑部', deliveredAt: 't1', archivedAt: 't2', earlierVersions: [1, 2], eligibility: 'house-only' as const,
    };
    expect(exemplarLine(exemplar, (iso) => iso)).toBe('新闻稿 · 版本 3 · 交付给编辑部于 t1 · 归入于 t2 · 学习准入：仅本社 · 此前还交付过版本 1、2');
    expect(exemplarLine({ ...exemplar, earlierVersions: [] }, (iso) => iso)).toBe('新闻稿 · 版本 3 · 交付给编辑部于 t1 · 归入于 t2 · 学习准入：仅本社');
    expect(EXEMPLARS_LATER).toHaveLength(2);
  });
});

describe('工序与规则' + "'s expert 工序 (Issue #427, S79d)", () => {
  it('names each 工序 by what it does, its version, the category it serves and its use, and the artifact in its own words', () => {
    const procedure = { procedureId: 'p', title: '出版风险点标注', version: '1', categoryId: 'c', categoryLabel: '出版风险', state: 'enabled' as const, unavailableReason: null, reviewRuns: 0 };
    expect(procedureLine(procedure)).toBe('出版风险点标注 · 第 1 版 · 内置 · 用于「出版风险」 · 还没有审阅用过');
    expect(procedureLine({ ...procedure, reviewRuns: 3 })).toBe('出版风险点标注 · 第 1 版 · 内置 · 用于「出版风险」 · 已用于 3 次审阅');
    const artifact = { artifactId: 'a', title: '编辑工作区方案', version: '1.0.0', state: 'installed' as const, enabledBooks: 2 };
    expect(artifactLine(artifact)).toBe('编辑工作区方案 · 1.0.0 · 已安装 · 已为 2 本书启用');
    expect(artifactLine({ ...artifact, enabledBooks: 0 })).toBe('编辑工作区方案 · 1.0.0 · 已安装 · 还没有图书启用');
    expect(artifactLine({ ...artifact, version: null, state: 'not-installed' })).toBe('编辑工作区方案 · 尚未安装');
  });

  it('says a 资料库 item in the editor\'s words: what arrived, where it belongs, its eligibility, and whose Tasks may list it', () => {
    const instant = (iso: string): string => `〔${iso.slice(0, 10)}〕`;
    const source = { displayName: 'sample1.docx', format: 'DOCX' as const, bytes: 29_550, sha256: 'a'.repeat(64) };
    expect([libraryBytes(512), libraryBytes(29_550), libraryBytes(5 * 1024 * 1024), libraryBytes(3 * 1024 * 1024 * 1024)])
      .toEqual(['512 字节', '28.9 KB', '5.0 MB', '3.00 GB']);
    expect(libraryPreviewHeading({ source })).toBe('放入资料库：sample1.docx');
    expect(libraryPreviewFacts({ source })).toBe('Word · 28.9 KB · 原件原样保存在本机，不会改动');
    const pending: LibraryMaterialProjection = {
      materialId: 'm', title: '样书一', kind: 'book', source, recordedAt: '2026-09-25T01:00:00.000Z', digest: 'b'.repeat(64),
      attribution: null, eligibility: null, eligibilityReset: false, reference: { state: 'pending' }, decisions: [],
    };
    expect(librarySourceLine(pending, instant)).toBe('sample1.docx · Word · 28.9 KB · 放入于 〔2026-09-25〕');
    expect([libraryAttributionLine(pending), libraryEligibilityLine(pending), libraryReferenceLine(pending)])
      .toEqual(['尚未定归属', '尚未定', '定了归属与学习准入，任务才能把它列进「允许参考」。']);
    const book = { ...pending, attribution: { scope: 'book' as const, bookId: 'b', bookTitle: '甲书', decidedAt: '2026-09-25T02:00:00.000Z' } };
    const deferred = { ...book, eligibility: { choice: 'deferred' as const, bookTitle: null, reason: null, decidedAt: '2026-09-25T03:00:00.000Z' } };
    expect([libraryAttributionLine(book), libraryEligibilityLine(deferred), libraryReferenceLine(deferred)])
      .toEqual(['《甲书》', '稍后决定', '学习准入记为稍后决定：决定之前，任务还不能把它列进「允许参考」。']);
    const own = {
      ...book,
      eligibility: { choice: 'book' as const, bookTitle: '甲书', reason: '责编确认', decidedAt: '2026-09-25T03:00:00.000Z' },
      reference: { state: 'available' as const, scope: 'book' as const, bookTitle: '甲书' },
    };
    expect([libraryEligibilityLine(own), libraryReferenceLine(own)]).toEqual(['仅纳入《甲书》（说明：责编确认）', '《甲书》的任务可以把它列进「允许参考」。']);
    const house = {
      ...pending,
      attribution: { scope: 'house' as const, decidedAt: '2026-09-25T02:00:00.000Z' },
      eligibility: { choice: 'house' as const, bookTitle: null, reason: null, decidedAt: '2026-09-25T03:00:00.000Z' },
      reference: { state: 'available' as const, scope: 'house' as const },
    };
    expect([libraryAttributionLine(house), libraryEligibilityLine(house), libraryReferenceLine(house)])
      .toEqual(['社级', '纳入出版社经验', '每本书的任务都可以把它列进「允许参考」。']);
    // The choices as LEARN-004 to LEARN-006 name them, and the wider one's consequence said where it is chosen.
    expect((['book', 'house', 'excluded', 'deferred'] as const).map((choice) => eligibilityChoiceLabel(choice, '甲书')))
      .toEqual(['仅纳入《甲书》', '纳入出版社经验', '明确排除', '稍后决定']);
    expect(LIBRARY_HOUSE_CONSEQUENCE).toBe('纳入出版社经验：全社以后的图书都可能从它学习。');
    expect(LIBRARY_EMPTY).toContain('「允许参考」');
    // Each decision on record, by its ordinal, what it decided, who and when.
    expect(libraryDecisionLine({ ordinal: 1, recordedAt: '2026-09-25T02:00:00.000Z', decision: { kind: 'attribution', scope: 'book', bookId: 'b', bookTitle: '甲书' } }, instant))
      .toBe('第 1 条 · 归属：《甲书》 · 本机编辑 · 〔2026-09-25〕');
    expect(libraryDecisionLine({ ordinal: 2, recordedAt: '2026-09-25T03:00:00.000Z', decision: { kind: 'eligibility', choice: 'excluded', bookTitle: null, reason: '版权未清' } }, instant))
      .toBe('第 2 条 · 学习准入：明确排除（说明：版权未清） · 本机编辑 · 〔2026-09-25〕');
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
