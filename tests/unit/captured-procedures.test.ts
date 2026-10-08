import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import {
  CAPTURED_PROCEDURE_SCHEMA_SQL,
  CAPTURED_PROCEDURE_TRIGGER_SQL,
  CAPTURE_CANCELLED,
  CAPTURE_CONTINUABLE,
  CAPTURE_SCOPE_CHANGED,
  CAPTURE_NOT_STARTED,
  CAPTURE_NOTHING_ELIGIBLE,
  CAPTURE_NOTHING_SETTLED,
  CAPTURE_RUNNING,
  CapturedProcedures,
  PASSED_OVER_FAILED,
  PASSED_OVER_PENDING,
  PASSED_OVER_STOPPED,
  PROCEDURE_STEP_NOT_CHOSEN,
  boundedPage,
  capturedProcedureDocument,
  capturedStepProblem,
  capturedStepProjections,
  chosenApartSteps,
  ceilingWiderThanSource,
  developerProposalFileText,
  isCapturedProcedureDocument,
  procedureCaptureSource,
  procedurePinRefusal,
  readCapturedProcedureDocument,
  readReviewRunProcedurePin,
  recordReviewRunProcedurePin,
  resolveProcedureVersions,
  stepRequirement,
  validCapturedProcedureTitle,
  versionEligible,
  versionIneligibleReason,
  type ResolvableVersion,
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
    const read = (state: 'prepared' | 'running' | 'settled' | 'partial' | 'failed' | 'cancelled' | 'scope-changed', authorized = true, canContinue = false, categories = settled) =>
      procedureCaptureSource({ authorized, state, canContinue, categories }, BUILTIN_REVIEW_CATEGORY_CONFIGURATION).unavailableReason;
    expect(read('prepared', false)).toBe(CAPTURE_NOT_STARTED);
    expect(read('settled', false)).toBe(CAPTURE_NOT_STARTED);
    expect(read('running')).toBe(CAPTURE_RUNNING);
    expect(read('cancelled')).toBe(CAPTURE_CANCELLED);
    expect(read('scope-changed')).toBe(CAPTURE_SCOPE_CHANGED);
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

describe('a page of versions (Issue #65 review)', () => {
  it('takes at most its limit, stops at its byte budget, and always takes one while any remain', () => {
    const items = [{ text: 'a'.repeat(90) }, { text: 'b'.repeat(90) }, { text: 'c'.repeat(90) }];
    expect(boundedPage(items, 2)).toEqual(items.slice(0, 2));
    expect(boundedPage(items, 5, 250)).toEqual(items.slice(0, 2));
    expect(boundedPage(items, 5, 150)).toEqual(items.slice(0, 1));
    expect(boundedPage(items, 5, 0)).toEqual(items.slice(0, 1));
    expect(boundedPage([], 5, 0)).toEqual([]);
  });
});

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
    ledger.stop(first.versionId, 'f'.repeat(64));
    ledger.stop(first.versionId, 'f'.repeat(64));
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
      steps: ['style-and-format', 'plot-consistency'], chosenApart: [],
    }, ['style-and-format'], [{ categoryId: 'plot-consistency', label: '情节逻辑与前后一致', reason: '没有基线分析。', byChoice: false }], '2026-10-08T00:00:00.000Z');
    expect(readReviewRunProcedurePin(db, run)).toEqual({
      procedureId: version.procedureId, versionId: version.versionId, version: 1, title: '体例', documentSha256: version.documentSha256, stopped: false, missing: false,
      leftOut: [{ categoryId: 'plot-consistency', label: '情节逻辑与前后一致', reason: '没有基线分析。', byChoice: false }],
    });
    expect(procedurePinRefusal(db, run)).toBeNull();
    expect(readReviewRunProcedurePin(db, '22222222-2222-4222-8222-222222222222')).toBeNull();
    ledger.stop(version.versionId, 'f'.repeat(64));
    expect(readReviewRunProcedurePin(db, run)!.stopped).toBe(true);
    expect(procedurePinRefusal(db, run)).toEqual({ code: 'REVIEW_PROCEDURE_STOPPED', message: '这次审阅按可复用工序《体例》第 1 版准备，这一版已停用；请重新准备这次审阅。' });
    // A pin naming a version this house never held — a Book merged in from another — reads as missing and is refused.
    const merged = '22222222-2222-4222-8222-222222222222';
    recordReviewRunProcedurePin(db, merged, {
      procedureId: '55555555-5555-4555-8555-555555555555', versionId: '66666666-6666-4666-8666-666666666666', version: 3, title: '别处的工序',
      documentSha256: 'e'.repeat(64), scope: 'whole', steps: ['style-and-format'], chosenApart: [],
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

// ---- Issue #66, plan slice S31: Latest Eligible Version Resolution, and what a 停用 records ----------------------------------

const resolvable = (version: number, state: ResolvableVersion['state'], problem: string | null = null, failedValidation = false): ResolvableVersion => ({
  versionId: `00000000-0000-4000-8000-00000000000${version}`, version, state, problem, failedValidation,
});

describe('Latest Eligible Version Resolution (UI ADR 0013; REUSE-043, REUSE-044)', () => {
  it('takes the newest 已启用 version that still validates, and names every newer one it passed over with why', () => {
    const versions = [resolvable(2, 'enabled'), resolvable(5, 'pending-validation'), resolvable(1, 'enabled'), resolvable(4, 'stopped'),
      resolvable(3, 'enabled', '「体例与格式」现在不能运行。'), resolvable(6, 'pending-validation', null, true)];
    const { eligible, passedOver } = resolveProcedureVersions(versions);
    expect(eligible.map((version) => version.version)).toEqual([2, 1]);
    expect(passedOver).toEqual([
      { version: 6, reason: PASSED_OVER_FAILED },
      { version: 5, reason: PASSED_OVER_PENDING },
      { version: 4, reason: PASSED_OVER_STOPPED },
      { version: 3, reason: '「体例与格式」现在不能运行。' },
    ]);
  });

  it('weighs an excluded version as stopped: what a 停用 would leave a new use', () => {
    const versions = [resolvable(1, 'enabled'), resolvable(2, 'enabled')];
    expect(resolveProcedureVersions(versions, new Set([versions[1]!.versionId])).eligible.map((version) => version.version)).toEqual([1]);
    expect(resolveProcedureVersions(versions, new Set([versions[1]!.versionId])).passedOver).toEqual([{ version: 2, reason: PASSED_OVER_STOPPED }]);
    const none = resolveProcedureVersions(versions, new Set(versions.map((version) => version.versionId)));
    expect(none.eligible).toEqual([]);
    expect(none.passedOver.map((version) => version.version)).toEqual([2, 1]);
    // Excluding never changes what it was given.
    expect(versions.map((version) => version.state)).toEqual(['enabled', 'enabled']);
  });

  it('reads eligibility from the state and, only for an 已启用 version, its validation', () => {
    expect(versionEligible(resolvable(1, 'enabled'))).toBe(true);
    expect(versionEligible(resolvable(1, 'enabled', '不再通过'))).toBe(false);
    expect(versionEligible(resolvable(1, 'pending-validation'))).toBe(false);
    expect(versionEligible(resolvable(1, 'stopped'))).toBe(false);
    expect(versionIneligibleReason(resolvable(1, 'enabled'))).toBeNull();
    expect(versionIneligibleReason(resolvable(1, 'stopped', '不再通过'))).toBe(PASSED_OVER_STOPPED);
    expect(versionIneligibleReason(resolvable(1, 'pending-validation', '不再通过'))).toBe(PASSED_OVER_PENDING);
    expect(versionIneligibleReason(resolvable(1, 'pending-validation', null, true))).toBe(PASSED_OVER_FAILED);
    expect(resolveProcedureVersions([]).eligible).toEqual([]);
  });
});

describe('Series material chosen apart and what a step needs of a Book (Issue #66, S31b)', () => {
  it('names what a Book must have for each step, from the executor the document holds (REUSE-048)', () => {
    expect([stepRequirement('series-knowledge'), stepRequirement('baseline-leads'), stepRequirement('review-category-contract'), stepRequirement('factual-review-kind')])
      .toEqual(['series', 'baseline-analysis', null, null]);
    const document = capturedProcedureDocument('全面', [STYLE, PLOT, SERIES], 'whole');
    expect(chosenApartSteps(document)).toEqual(['series-consistency']);
    expect(chosenApartSteps(capturedProcedureDocument('体例', [STYLE, PLOT], 'whole'))).toEqual([]);
    const words = (categoryId: string) => ({ label: categoryId, procedureTitle: categoryId });
    expect(capturedStepProjections(document, words).map((step) => [step.categoryId, step.requirement]))
      .toEqual([['style-and-format', null], ['plot-consistency', 'baseline-analysis'], ['series-consistency', 'series']]);
  });

  it('records a step the editor did not choose apart from one the Book could not take, and reads an older pin as neither chosen', () => {
    const db = ledgerDatabase();
    const ledger = new CapturedProcedures(db);
    const version = ledger.save({ procedureId: null, document: capturedProcedureDocument('全面', [STYLE, SERIES], 'whole'),
      sourceBookId: '11111111-1111-4111-8111-111111111111', sourceReviewRunId: '22222222-2222-4222-8222-222222222222', sourceRunOrdinal: 1 });
    const pin = { procedureId: version.procedureId, versionId: version.versionId, version: 1, title: '全面', documentSha256: version.documentSha256,
      scope: 'whole' as const, steps: ['style-and-format', 'series-consistency'], chosenApart: ['series-consistency'] };
    const run = '33333333-3333-4333-8333-333333333333';
    recordReviewRunProcedurePin(db, run, pin, ['style-and-format'],
      [{ categoryId: 'series-consistency', label: '书系一致性', reason: PROCEDURE_STEP_NOT_CHOSEN, byChoice: true }], '2026-10-09T00:00:00.000Z');
    expect(readReviewRunProcedurePin(db, run)!.leftOut).toEqual([{ categoryId: 'series-consistency', label: '书系一致性', reason: PROCEDURE_STEP_NOT_CHOSEN, byChoice: true }]);
    const stored = db.prepare('SELECT canonical_json FROM review_run_procedure_pins WHERE review_run_id = ?').get(run) as { canonical_json: string };
    expect(JSON.parse(stored.canonical_json)).toMatchObject({ schema: 'ai7.review.procedure-pin/2', ran: ['style-and-format'] });
    // A pin written before S31b (`/1`) left out only what its Book could not take.
    const older = '22222222-2222-4222-8222-222222222222';
    const legacy = (leftOut: unknown) => canonicalJson({ schema: 'ai7.review.procedure-pin/1', reviewRunId: older, procedureId: version.procedureId, versionId: version.versionId,
      version: 1, title: '全面', documentSha256: version.documentSha256, scope: 'whole', ran: ['style-and-format'], leftOut, recordedAt: '2026-10-01T00:00:00.000Z' });
    const v1 = legacy([{ categoryId: 'series-consistency', label: '书系一致性', reason: '这本书不在任何书系中。' }]);
    db.prepare('INSERT INTO review_run_procedure_pins(review_run_id, procedure_id, version_id, version, document_sha256, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(older, version.procedureId, version.versionId, 1, version.documentSha256, '2026-10-01T00:00:00.000Z', v1, sha256Hex(v1));
    expect(readReviewRunProcedurePin(db, older)!.leftOut).toEqual([{ categoryId: 'series-consistency', label: '书系一致性', reason: '这本书不在任何书系中。', byChoice: false }]);
    db.close();
  });

  it('refuses a pin whose left-out steps do not hold to its schema', () => {
    const run = '33333333-3333-4333-8333-333333333333';
    for (const [schema, leftOut] of [
      ['ai7.review.procedure-pin/2', [{ categoryId: 'series-consistency', label: '书系一致性', reason: 'x' }]],
      ['ai7.review.procedure-pin/2', [{ categoryId: 'series-consistency', label: '书系一致性', reason: 'x', byChoice: 'yes' }]],
      ['ai7.review.procedure-pin/1', [{ categoryId: 'series-consistency', label: '书系一致性', reason: 'x', byChoice: true }]],
      ['ai7.review.procedure-pin/2', [{ categoryId: 1, label: '书系一致性', reason: 'x', byChoice: true }]],
      ['ai7.review.procedure-pin/2', [{ categoryId: 'series-consistency', label: 2, reason: 'x', byChoice: true }]],
      ['ai7.review.procedure-pin/2', [{ categoryId: 'series-consistency', label: '书系一致性', reason: null, byChoice: true }]],
      ['ai7.review.procedure-pin/2', ['series-consistency']],
      ['ai7.review.procedure-pin/3', []],
    ] as const) {
      const db = ledgerDatabase();
      const json = canonicalJson({ schema, reviewRunId: run, procedureId: '55555555-5555-4555-8555-555555555555', versionId: '66666666-6666-4666-8666-666666666666',
        version: 1, title: '全面', documentSha256: 'e'.repeat(64), scope: 'whole', ran: [], leftOut, recordedAt: '2026-10-01T00:00:00.000Z' });
      db.prepare('INSERT INTO review_run_procedure_pins(review_run_id, procedure_id, version_id, version, document_sha256, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(run, '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', 1, 'e'.repeat(64), '2026-10-01T00:00:00.000Z', json, sha256Hex(json));
      expect(() => readReviewRunProcedurePin(db, run)).toThrowError('审阅所依据的可复用工序记录已损坏。');
      db.close();
    }
  });
});

describe('a 停用 in the ledger (Issue #66, S31)', () => {
  it('records the digest of the preview it confirmed, and lists the Runs that pinned a version in the order they were prepared', () => {
    const db = ledgerDatabase();
    const ledger = new CapturedProcedures(db);
    const version = ledger.save({ procedureId: null, document: capturedProcedureDocument('体例', [STYLE], 'whole'),
      sourceBookId: '11111111-1111-4111-8111-111111111111', sourceReviewRunId: '22222222-2222-4222-8222-222222222222', sourceRunOrdinal: 1 });
    const pin = { procedureId: version.procedureId, versionId: version.versionId, version: 1, title: '体例', documentSha256: version.documentSha256, scope: 'whole' as const, steps: ['style-and-format'], chosenApart: [] };
    recordReviewRunProcedurePin(db, '33333333-3333-4333-8333-333333333333', pin, ['style-and-format'], [], '2026-10-08T00:00:00.000Z');
    recordReviewRunProcedurePin(db, '22222222-2222-4222-8222-222222222222', pin, ['style-and-format'], [], '2026-10-09T00:00:00.000Z');
    expect(ledger.pinnedRunIds(version.versionId)).toEqual(['33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222']);
    expect(ledger.pinnedRunIds('44444444-4444-4444-8444-444444444444')).toEqual([]);
    ledger.stop(version.versionId, 'a'.repeat(64));
    const state = db.prepare("SELECT canonical_json FROM captured_procedure_states WHERE state = 'stopped'").get() as { canonical_json: string };
    expect(JSON.parse(state.canonical_json)).toMatchObject({ state: 'stopped', previewDigest: 'a'.repeat(64) });
    db.close();
  });
});
