import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import {
  CAPTURED_PROCEDURE_SCHEMA_SQL,
  CAPTURED_PROCEDURE_TRIGGER_SQL,
  CAPTURE_CONTINUABLE,
  CAPTURE_NOT_STARTED,
  CAPTURE_NOTHING_ELIGIBLE,
  CAPTURE_NOTHING_SETTLED,
  CAPTURE_RUNNING,
  CapturedProcedures,
  capturedProcedureDocument,
  capturedStepProblem,
  ceilingWiderThanSource,
  developerProposalFileText,
  isCapturedProcedureDocument,
  procedureCaptureSource,
  procedurePinRefusal,
  readCapturedProcedureDocument,
  readReviewRunProcedurePin,
  recordReviewRunProcedurePin,
  validCapturedProcedureTitle,
} from '../../src/service/captured-procedures.js';
import {
  BUILTIN_REVIEW_CATEGORY_CONFIGURATION,
  reviewCategoryEntry,
  type ReviewCategoryConfiguration,
  type ReviewCategoryConfigurationEntry,
} from '../../src/service/review/category-configuration.js';
import { developerProposalFileName } from '../../src/shared/developer-proposal.js';

// Unit suite (L1) for the Captured Procedure's document, validation and ledger (Issue #65, plan slice S30; ADR 0087): what a
// version may hold, what makes a capture or a step ineligible, what 验证并启用… checks, and that the ledger appends only — a
// stopped version takes no state again — over an in-memory database with the two relations it refers to.

const entry = (categoryId: string): ReviewCategoryConfigurationEntry => reviewCategoryEntry(categoryId)!;
const STYLE = entry('style-and-format');
const PLOT = entry('plot-consistency');
const LITERARY = entry('literary-expression');
const FACTUAL = entry('factual-review');
const SERIES = entry('series-consistency');

function configurationWith(categoryId: string, change: Partial<ReviewCategoryConfigurationEntry>): ReviewCategoryConfiguration {
  return {
    ...BUILTIN_REVIEW_CATEGORY_CONFIGURATION,
    categories: BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.map((candidate) => candidate.categoryId === categoryId ? { ...candidate, ...change } : candidate),
  };
}

describe('the Captured Procedure document (ADR 0087 §1)', () => {
  it('holds exactly its title, runAs, steps, scope slot and Authority Ceiling', () => {
    const document = capturedProcedureDocument('体例与线索', [STYLE, PLOT, FACTUAL], 'chapters');
    expect(document).toEqual({
      schema: 'ai7.captured-procedure/1',
      title: '体例与线索',
      runAs: 'review-run',
      steps: [
        { categoryId: 'style-and-format', procedure: { procedureId: 'ai7-review-procedure/style-and-format', version: '1' }, output: 'annotation', model: true, searchEngine: false },
        { categoryId: 'plot-consistency', procedure: { procedureId: 'ai7-review-procedure/plot-consistency-leads', version: '1' }, output: 'annotation', model: false, searchEngine: false },
        { categoryId: 'factual-review', procedure: { procedureId: 'ai7-review-procedure/factual-review', version: '1' }, output: 'annotation', model: true, searchEngine: true },
      ],
      parameters: { scope: 'chapters' },
      authorityCeiling: {
        runSourceScope: 'current-book',
        steps: [
          { categoryId: 'style-and-format', executor: 'review-category-contract' },
          { categoryId: 'plot-consistency', executor: 'baseline-leads' },
          { categoryId: 'factual-review', executor: 'factual-review-kind' },
        ],
        outputs: ['annotation'],
        model: true,
        searchEngine: true,
      },
    });
    expect(isCapturedProcedureDocument(document)).toBe(true);
    // No clause, guideline version, Book or Series is anywhere in it.
    expect(canonicalJson(document).replace('current-book', '')).not.toMatch(/clause|guideline|book|series|manuscript/iu);
  });

  it('names 书系一致性 by the house executor, whatever one Book resolved it to', () => {
    const resolved: ReviewCategoryConfigurationEntry = { ...SERIES, executor: 'review-category-contract', seriesKnowledge: { series: [], revisions: [] } };
    expect(capturedProcedureDocument('书系', [resolved], 'whole').authorityCeiling.steps).toEqual([{ categoryId: 'series-consistency', executor: 'series-knowledge' }]);
  });

  it('is refused when a key is added or missing, a step repeats, or the ceiling is not exactly its steps\' sum', () => {
    const document = capturedProcedureDocument('体例', [STYLE, LITERARY], 'whole');
    expect(isCapturedProcedureDocument({ ...document, book: 'x' })).toBe(false);
    const { title: _title, ...untitled } = document;
    expect(isCapturedProcedureDocument(untitled)).toBe(false);
    expect(isCapturedProcedureDocument({ ...document, runAs: 'skill' })).toBe(false);
    expect(isCapturedProcedureDocument({ ...document, parameters: { scope: 'selection' } })).toBe(false);
    expect(isCapturedProcedureDocument({ ...document, steps: [] })).toBe(false);
    expect(isCapturedProcedureDocument({ ...document, steps: [document.steps[0], document.steps[0]] })).toBe(false);
    expect(isCapturedProcedureDocument({ ...document, steps: [{ ...document.steps[0], prompt: '多做一点' }, document.steps[1]] })).toBe(false);
    expect(isCapturedProcedureDocument({ ...document, authorityCeiling: { ...document.authorityCeiling, searchEngine: true } })).toBe(false);
    expect(isCapturedProcedureDocument({ ...document, authorityCeiling: { ...document.authorityCeiling, outputs: ['annotation'] } })).toBe(false);
    expect(isCapturedProcedureDocument({ ...document, authorityCeiling: { ...document.authorityCeiling, model: false } })).toBe(false);
    expect(isCapturedProcedureDocument({ ...document, authorityCeiling: { ...document.authorityCeiling, runSourceScope: 'series' } })).toBe(false);
    expect(isCapturedProcedureDocument({ ...document, authorityCeiling: { ...document.authorityCeiling,
      steps: [{ categoryId: 'style-and-format', executor: 'baseline-leads' }, document.authorityCeiling.steps[1]] } })).toBe(false);
    expect(isCapturedProcedureDocument({ ...document, authorityCeiling: { ...document.authorityCeiling,
      steps: [{ categoryId: 'style-and-format', executor: 'shell' }, document.authorityCeiling.steps[1]] } })).toBe(false);
  });

  it('reads back only canonical JSON matching its digest', () => {
    const json = canonicalJson(capturedProcedureDocument('体例', [STYLE], 'whole'));
    expect(readCapturedProcedureDocument(json, sha256Hex(json))?.title).toBe('体例');
    expect(readCapturedProcedureDocument(json, '0'.repeat(64))).toBeNull();
    const spaced = JSON.stringify(JSON.parse(json), null, 1);
    expect(readCapturedProcedureDocument(spaced, sha256Hex(spaced))).toBeNull();
  });

  it('takes a title as a label: trimmed, within 60 graphemes, no control characters', () => {
    expect(validCapturedProcedureTitle('体例复核')).toBe(true);
    expect(validCapturedProcedureTitle('字'.repeat(60))).toBe(true);
    expect(validCapturedProcedureTitle('字'.repeat(61))).toBe(false);
    expect(validCapturedProcedureTitle(' 体例')).toBe(false);
    expect(validCapturedProcedureTitle('')).toBe(false);
    expect(validCapturedProcedureTitle('体\n例')).toBe(false);
    expect(validCapturedProcedureTitle(7)).toBe(false);
  });
});

describe('validation (ADR 0087 §3)', () => {
  const document = capturedProcedureDocument('体例', [STYLE, PLOT], 'whole');

  it('passes each step that still resolves at the same 工序 version and does no more', () => {
    expect(capturedStepProblem(document, 0, BUILTIN_REVIEW_CATEGORY_CONFIGURATION)).toBeNull();
    expect(capturedStepProblem(document, 1, BUILTIN_REVIEW_CATEGORY_CONFIGURATION)).toBeNull();
  });

  it('fails a step whose category is gone, unavailable, at another 工序 version, or wider than saved', () => {
    const without = { ...BUILTIN_REVIEW_CATEGORY_CONFIGURATION, categories: BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.filter((candidate) => candidate.categoryId !== 'style-and-format') };
    expect(capturedStepProblem(document, 0, without)).toBe('这一类已不在审阅配置中。');
    expect(capturedStepProblem(document, 0, configurationWith('style-and-format', { executor: 'unavailable', unavailableReason: '暂停使用。' })))
      .toBe('「体例与格式」现在不能运行：暂停使用。');
    expect(capturedStepProblem(document, 0, configurationWith('style-and-format', { procedure: { ...STYLE.procedure, version: '2' } })))
      .toBe('「体例与格式」的工序已换成第 2 版，与保存时的第 1 版不同；请从一次新的审阅重新保存。');
    for (const change of [{ searchEngine: true }, { output: 'change-suggestion' as const }, { executor: 'factual-review-kind' as const }]) {
      expect(capturedStepProblem(document, 0, configurationWith('style-and-format', change))).toBe('「体例与格式」现在的做法超出了保存时的范围；请从一次新的审阅重新保存。');
    }
    // The leads calling a model would widen the ceiling too.
    expect(capturedStepProblem(document, 1, configurationWith('plot-consistency', { executor: 'review-category-contract' })))
      .toBe('「情节逻辑与前后一致」现在的做法超出了保存时的范围；请从一次新的审阅重新保存。');
  });

  it('holds the ceiling to the source Run: a category it never ran, or one it ran doing less, is wider', () => {
    expect(ceilingWiderThanSource(document, [STYLE, PLOT])).toEqual([]);
    expect(ceilingWiderThanSource(document, [STYLE])).toEqual(['「plot-consistency」不是来源审阅运行过的类别。']);
    expect(ceilingWiderThanSource(document, [{ ...STYLE, output: 'change-suggestion' }, PLOT])).toEqual(['「体例与格式」的权限超出了来源审阅。']);
    const searching = capturedProcedureDocument('核查', [FACTUAL], 'whole');
    expect(ceilingWiderThanSource(searching, [{ ...FACTUAL, searchEngine: false }])).toEqual(['「事实核查」的权限超出了来源审阅。']);
    expect(ceilingWiderThanSource(document, [STYLE, { ...PLOT, executor: 'review-category-contract' }])).toEqual(['「情节逻辑与前后一致」的权限超出了来源审阅。']);
  });
});

describe('what a capture may keep (ADR 0087 §2; REUSE-019)', () => {
  const category = (source: ReviewCategoryConfigurationEntry, state: string, stateLabel = state) => ({ entry: source, state, stateLabel });

  it('offers only a Run authorized and finished, with nothing left to continue', () => {
    const settled = [category(STYLE, 'settled')];
    const read = (state: 'prepared' | 'running' | 'settled' | 'partial' | 'failed', authorized = true, canContinue = false, categories = settled) =>
      procedureCaptureSource({ authorized, state, canContinue, categories }, BUILTIN_REVIEW_CATEGORY_CONFIGURATION).unavailableReason;
    expect(read('prepared', false)).toBe(CAPTURE_NOT_STARTED);
    expect(read('settled', false)).toBe(CAPTURE_NOT_STARTED);
    expect(read('running')).toBe(CAPTURE_RUNNING);
    expect(read('partial', true, true)).toBe(CAPTURE_CONTINUABLE);
    expect(read('failed', true, false, [category(STYLE, 'failed', '运行失败')])).toBe(CAPTURE_NOTHING_SETTLED);
    expect(read('settled')).toBeNull();
    expect(read('partial', true, false, [category(STYLE, 'settled'), category(LITERARY, 'interrupted', '已中断')])).toBeNull();
  });

  it('leaves out a failed, interrupted or refused category, and one whose 工序 moved on or became unavailable', () => {
    const { steps } = procedureCaptureSource({
      authorized: true, state: 'partial', canContinue: false,
      categories: [category(STYLE, 'settled'), category(PLOT, 'refused', '未能开始'), category(LITERARY, 'interrupted', '已中断')],
    }, BUILTIN_REVIEW_CATEGORY_CONFIGURATION);
    expect(steps.map((step) => [step.entry.categoryId, step.eligible, step.excludedReason])).toEqual([
      ['style-and-format', true, null],
      ['plot-consistency', false, '这一类在这次审阅中没有完成（未能开始），不会保存。'],
      ['literary-expression', false, '这一类在这次审阅中没有完成（已中断），不会保存。'],
    ]);
    const moved = procedureCaptureSource({ authorized: true, state: 'settled', canContinue: false, categories: [category(STYLE, 'settled')] },
      configurationWith('style-and-format', { procedure: { ...STYLE.procedure, version: '2' } }));
    expect(moved.unavailableReason).toBe(CAPTURE_NOTHING_ELIGIBLE);
    expect(moved.steps[0]!.excludedReason).toBe('这一类的工序已换成第 2 版，与这次审阅用的第 1 版不同，不会保存。');
    const gone = procedureCaptureSource({ authorized: true, state: 'settled', canContinue: false, categories: [category(STYLE, 'settled')] },
      configurationWith('style-and-format', { executor: 'unavailable', unavailableReason: '暂停使用。' }));
    expect(gone.steps[0]!.excludedReason).toBe('这一类现在不能运行：暂停使用。');
  });
});

function ledgerDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE books (book_id TEXT PRIMARY KEY) STRICT');
  db.exec('CREATE TABLE review_runs (review_run_id TEXT PRIMARY KEY) STRICT');
  for (const sql of Object.values(CAPTURED_PROCEDURE_SCHEMA_SQL)) db.exec(sql);
  for (const sql of Object.values(CAPTURED_PROCEDURE_TRIGGER_SQL)) db.exec(sql);
  db.prepare('INSERT INTO books VALUES (?)').run('11111111-1111-4111-8111-111111111111');
  db.prepare('INSERT INTO review_runs VALUES (?)').run('22222222-2222-4222-8222-222222222222');
  db.prepare('INSERT INTO review_runs VALUES (?)').run('33333333-3333-4333-8333-333333333333');
  return db;
}

describe('the ledger', () => {
  const source = { sourceBookId: '11111111-1111-4111-8111-111111111111', sourceReviewRunId: '22222222-2222-4222-8222-222222222222', sourceRunOrdinal: 1 };

  it('chains versions by digest, records a failed validation without enabling, and stops a version for good', () => {
    const db = ledgerDatabase();
    const ledger = new CapturedProcedures(db);
    const first = ledger.save({ procedureId: null, document: capturedProcedureDocument('体例', [STYLE], 'whole'), ...source });
    expect(first).toMatchObject({ version: 1, state: 'pending-validation', previousDocumentSha256: null, validationProblems: [] });
    const failed = ledger.recordValidation(first.versionId, ['「体例与格式」的工序已换成第 2 版。'], 'a'.repeat(64));
    expect(failed).toMatchObject({ state: 'pending-validation', validationProblems: ['「体例与格式」的工序已换成第 2 版。'], stateRecordedAt: null });
    const enabled = ledger.recordValidation(first.versionId, [], 'b'.repeat(64));
    expect(enabled).toMatchObject({ state: 'enabled', validationProblems: [] });
    expect(() => ledger.recordValidation(first.versionId, [], 'b'.repeat(64))).toThrowError('这一版已经启用。');
    const second = ledger.save({ procedureId: first.procedureId, document: capturedProcedureDocument('体例二', [STYLE, LITERARY], 'chapters'), ...source });
    expect(second).toMatchObject({ version: 2, previousDocumentSha256: first.documentSha256 });
    expect(ledger.versions(first.procedureId).map((version) => version.version)).toEqual([2, 1]);
    ledger.stop(first.versionId);
    ledger.stop(first.versionId);
    expect(ledger.version(first.versionId)!.state).toBe('stopped');
    expect(() => ledger.recordValidation(first.versionId, [], 'c'.repeat(64))).toThrowError('这一版已停用');
    // The ledger itself refuses a state after 停用, and any rewrite or removal.
    expect(() => db.prepare(`INSERT INTO captured_procedure_states(version_id, sequence, state, recorded_at, canonical_json, sha256) VALUES (?, 9, 'enabled', 'x', '{}', ?)`)
      .run(first.versionId, 'd'.repeat(64))).toThrowError('CAPTURED_PROCEDURE_STOPPED');
    expect(() => db.prepare('UPDATE captured_procedure_versions SET version = 7').run()).toThrowError('CAPTURED_PROCEDURE_LEDGER_IMMUTABLE');
    expect(() => db.prepare('DELETE FROM captured_procedure_versions').run()).toThrowError('CAPTURED_PROCEDURE_LEDGER_IMMUTABLE');
    expect(() => ledger.save({ procedureId: '44444444-4444-4444-8444-444444444444', document: capturedProcedureDocument('无', [STYLE], 'whole'), ...source }))
      .toThrowError('这个可复用工序不存在。');
    expect(() => ledger.save({ procedureId: null, document: { ...capturedProcedureDocument('体例', [STYLE], 'whole'), title: '' }, ...source }))
      .toThrowError('要保存的工序无效。');
    db.close();
  });

  it('pins a Review Run by value, and reads the pin as stopped once its version is', () => {
    const db = ledgerDatabase();
    const ledger = new CapturedProcedures(db);
    const version = ledger.save({ procedureId: null, document: capturedProcedureDocument('体例', [STYLE, PLOT], 'whole'), ...source });
    const run = '33333333-3333-4333-8333-333333333333';
    recordReviewRunProcedurePin(db, run, {
      procedureId: version.procedureId, versionId: version.versionId, version: 1, title: '体例', documentSha256: version.documentSha256, scope: 'whole',
      steps: ['style-and-format', 'plot-consistency'],
    }, ['style-and-format'], [{ categoryId: 'plot-consistency', label: '情节逻辑与前后一致', reason: '没有基线分析。' }], '2026-10-08T00:00:00.000Z');
    expect(readReviewRunProcedurePin(db, run)).toEqual({
      procedureId: version.procedureId, versionId: version.versionId, version: 1, title: '体例', documentSha256: version.documentSha256, stopped: false, missing: false,
      leftOut: [{ categoryId: 'plot-consistency', label: '情节逻辑与前后一致', reason: '没有基线分析。' }],
    });
    expect(procedurePinRefusal(db, run)).toBeNull();
    expect(readReviewRunProcedurePin(db, '22222222-2222-4222-8222-222222222222')).toBeNull();
    ledger.stop(version.versionId);
    expect(readReviewRunProcedurePin(db, run)!.stopped).toBe(true);
    expect(procedurePinRefusal(db, run)).toEqual({ code: 'REVIEW_PROCEDURE_STOPPED', message: '这次审阅按可复用工序《体例》第 1 版准备，这一版已停用；请重新准备这次审阅。' });
    // A pin naming a version this house never held — a Book merged in from another — reads as missing and is refused.
    const merged = '22222222-2222-4222-8222-222222222222';
    recordReviewRunProcedurePin(db, merged, {
      procedureId: '55555555-5555-4555-8555-555555555555', versionId: '66666666-6666-4666-8666-666666666666', version: 3, title: '别处的工序',
      documentSha256: 'e'.repeat(64), scope: 'whole', steps: ['style-and-format'],
    }, ['style-and-format'], [], '2026-10-08T00:00:00.000Z');
    expect(readReviewRunProcedurePin(db, merged)).toMatchObject({ missing: true, stopped: false });
    expect(procedurePinRefusal(db, merged)).toEqual({ code: 'REVIEW_PROCEDURE_MISSING', message: '这次审阅按可复用工序《别处的工序》第 3 版准备，本机没有这一版；请重新准备这次审阅。' });
    db.close();
  });

  it('writes a Developer Capability Proposal as readable Markdown under a safe name, with its digest', () => {
    const db = ledgerDatabase();
    const ledger = new CapturedProcedures(db);
    const proposalId = ledger.saveProposal({ proposalId: null, title: '图注/核对', missingCapability: '核对图注。', affectedProcedure: '', direction: '读图片说明。', pluginCandidate: '' });
    const version = ledger.proposal(proposalId).versions[0]!;
    expect(developerProposalFileName(version)).toBe('开发建议 图注_核对 第 1 版.md');
    // Cut by grapheme: a family emoji is kept whole or not at all, never split into a lone surrogate.
    const long = developerProposalFileName({ title: '👨‍👩‍👧‍👦'.repeat(50), version: 2 });
    expect(long).toBe(`开发建议 ${'👨‍👩‍👧‍👦'.repeat(40)} 第 2 版.md`);
    expect(long.isWellFormed()).toBe(true);
    const text = developerProposalFileText(version);
    expect(text).toContain('# 开发建议：图注/核对');
    expect(text).toContain('## 涉及的工序\n\n（未填写）');
    expect(text).toContain(`记录摘要（SHA-256）：${version.technical.sha256}`);
    ledger.recordProposalFile(version.proposalVersionId, 'x.md', new TextEncoder().encode(text));
    expect(ledger.proposal(proposalId).versions[0]!.files.map((file) => file.fileName)).toEqual(['x.md']);
    db.close();
  });
});
