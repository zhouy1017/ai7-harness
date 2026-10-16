import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  FACTUAL_REVIEW_PROMPT_CONTRACT,
  FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST,
  FACTUAL_REVIEW_UNIT_RESULT_SCHEMA,
  FACTUAL_VERIFICATION_POLICY_VERSION,
  buildFactualReviewUnitMessage,
} from '../../src/service/analysis/factual-review-contract.js';
import {
  FACTUAL_REVIEW_PROMPT_CONTRACT_V2_STANDARD,
  FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA,
  markInBookExactFetch,
  parseFactualReviewUnitResultV2,
} from '../../src/service/analysis/factual-review-contract-v2.js';
import { factualReviewDefinitionsByDigest, factualReviewKindDefinition, factualReviewLevelDefinition, withFactualResearch } from '../../src/service/analysis/kind-definition.js';
import { canonicalPlanEdits, planEditAssuranceLevel, planEditDiff, planEditsOf, NO_PLAN_EDITS } from '../../src/service/analysis/plan-edits.js';
import { levelBelowPolicyMinimum } from '../../src/service/analysis/baseline-analysis-store.js';
import { assuranceSelector, ASSURANCE_LEVEL_POLICY_REQUIREMENT, driftEntry } from '../../src/service/task-plan.js';
import {
  FactualVerificationLedger,
  excerptLocated,
  independenceGroups,
  mapVerificationOutcome,
  registrableDomain,
  type ManuscriptReader,
  type MaterializedFactualFinding,
} from '../../src/service/factual-verification.js';
import { FACTUAL_VERIFICATION_SCHEMA_SQL, FACTUAL_VERIFICATION_TRIGGER_SQL } from '../../src/service/factual-verification-schema.js';
import { RESEARCH_EVIDENCE_SCHEMA_SQL } from '../../src/service/research-evidence-schema.js';
import {
  CORRECTION_ASSURANCE_INCOMPLETE_LABEL,
  STALE_VERIFICATION_ANCHOR_LABEL,
  type CoverageManifestUnitProjection,
  type EvidenceAssuranceLevel,
} from '../../src/shared/protocol.js';

// Issue #901 (wave 8, slice 8a): the pure parts of 事实核查's Evidence Assurance — contract /2, the outcome mapping, Evidence
// Source Lineage, the plan edit and the policy pin — and the factual verification ledger over a bare in-memory database, where a
// second Run of the same assertion can be recorded although a Book holds one 事实核查 Run until the update modes land (#905).

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('Factual Review Contract /2 is additive', () => {
  it('leaves v1 byte for byte: its prompt contract, the research wrap and 快速整理 all keep their digests', () => {
    // Synchronized pins (Issue #901): the v1 and research digests are the ones every earlier plan and capture froze.
    expect(FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST).toBe('22beb453ba08208c65cc65c78e1d5fc766fdb7efbc99865e0d7046f39cb39a37');
    expect(FACTUAL_REVIEW_PROMPT_CONTRACT.responseSchema).toBe(FACTUAL_REVIEW_UNIT_RESULT_SCHEMA);
    expect(withFactualResearch(factualReviewKindDefinition()).promptContractDigest).toBe('639d98f1576761aa320d4d48e7df182d389ba537ddef9da2de4a36f45a44592b');
    const quick = factualReviewLevelDefinition('quick');
    expect(quick.promptContractDigest).toBe(FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST);
    expect(quick.systemPrompt).toBe(FACTUAL_REVIEW_PROMPT_CONTRACT.systemPrompt);
    expect(quick.researchDeclaration).toEqual({ webSearch: false, searchEngine: null });
    const standard = factualReviewLevelDefinition('standard');
    const strict = factualReviewLevelDefinition('strict');
    expect(standard.promptContractDigest).toBe('692604f0d48c52ed7f82b43855eab7bdcda2192791c38c22dbc785415bd7db9e');
    expect(strict.promptContractDigest).toBe('610e96937f4aae95da53f1673c6967dc1f359ee01cc42ffa36039bc817177090');
    expect(standard.unitResultSchema).toBe(FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA);
    expect(standard.contractVersion).toBe(factualReviewKindDefinition().contractVersion);
    expect(strict.systemPrompt).toContain('严格核查');
    // The unit message is v1's own builder: one request per unit, the same bytes under every level.
    const unit = { ordinal: 1, digest: 'a'.repeat(64), blockIds: ['blk_000000000000000000000001'], overlapBlockIds: [] } as unknown as CoverageManifestUnitProjection;
    const blocks = new Map([['blk_000000000000000000000001', { blockId: 'blk_000000000000000000000001', kind: 'paragraph', level: null, text: '合成段落。' }]]);
    expect(standard.buildUnitMessage(unit, 1, blocks as never)).toBe(buildFactualReviewUnitMessage(unit, 1, blocks as never));
    // Every frozen factual plan finds its own definition back by digest, the two predecessors included.
    expect([...factualReviewDefinitionsByDigest().keys()].sort()).toEqual([standard.promptContractDigest, strict.promptContractDigest,
      '639d98f1576761aa320d4d48e7df182d389ba537ddef9da2de4a36f45a44592b', FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST].sort());
    expect(FACTUAL_REVIEW_PROMPT_CONTRACT_V2_STANDARD.unitMessageHeader).toBe(FACTUAL_REVIEW_PROMPT_CONTRACT.unitMessageHeader);
  });

  it('parses relations and corrections exactly, and never takes the Exact Fetch mark from the model', () => {
    const assertion = { quote: '合成引文', blockOrdinal: 1, assertionClass: 'real-world-fact', category: '机构', severity: 'A', question: '在何处？', basis: '可核查。' };
    const relation = { sourceRef: 'https://museum.example.org/zun', relation: '支持', excerptRef: '现藏于馆中', lineage: 'original' };
    const parse = (value: unknown) => parseFactualReviewUnitResultV2(JSON.stringify(value), { unitOrdinal: 1, blockCount: 1 });
    const ok = parse({ schema: FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA, unitOrdinal: 1, assertions: [{ ...assertion, evidenceRelations: [relation] }],
      corrections: [{ assertionRef: 1, variants: [{ text: '改正后的文字', rationale: '来源记载不同。' }] }] });
    expect(ok.ok).toBe(true);
    // A v1 answer is not a v2 answer; an assertion without its relations, a forged mark, an unknown relation or source fail.
    expect(parse({ schema: FACTUAL_REVIEW_UNIT_RESULT_SCHEMA, unitOrdinal: 1, assertions: [assertion] }).ok).toBe(false);
    expect(parse({ schema: FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA, unitOrdinal: 1, assertions: [assertion] }).ok).toBe(false);
    expect(parse({ schema: FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA, unitOrdinal: 1, assertions: [{ ...assertion, evidenceRelations: [{ ...relation, exactFetch: { sourceKind: 'manuscript', sourceId: 'x', digest: 'y' } }] }] }).ok).toBe(false);
    expect(parse({ schema: FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA, unitOrdinal: 1, assertions: [{ ...assertion, evidenceRelations: [{ ...relation, relation: '确证' }] }] }).ok).toBe(false);
    expect(parse({ schema: FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA, unitOrdinal: 1, assertions: [{ ...assertion, evidenceRelations: [{ ...relation, sourceRef: 'http://plain.example.org' }] }] }).ok).toBe(false);
    expect(parse({ schema: FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA, unitOrdinal: 1, assertions: [{ ...assertion, evidenceRelations: [] }],
      corrections: [{ assertionRef: 1, variants: [] }] }).ok).toBe(false);
    expect(parse({ schema: FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA, unitOrdinal: 1, assertions: [{ ...assertion, evidenceRelations: [] }],
      corrections: [{ assertionRef: 2, variants: [{ text: '改', rationale: '理由' }] }] }).ok).toBe(false);
    expect(parse({ schema: FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA, unitOrdinal: 1, assertions: [{ ...assertion, evidenceRelations: [] }],
      corrections: [{ assertionRef: 1, variants: [{ text: '字'.repeat(201), rationale: '理由' }] }] }).ok).toBe(false);
    // In-Book relations are marked by Exact Fetch alone: found verbatim, or not.
    const inBook = { sourceRef: `retrieval:${'b'.repeat(64)}`, relation: '支持' as const, excerptRef: '原文一句', lineage: null };
    const result = { schema: FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA, unitOrdinal: 1, corrections: [], assertions: [{ ...assertion, evidenceRelations: [inBook, relation] }] } as never;
    const fetched = markInBookExactFetch(result, () => ({ text: '前文。原文一句。后文。', candidate: { sourceKind: 'manuscript', sourceId: 'm1', revisionOrIndexDigest: 'd1' } }));
    expect(fetched.assertions[0]!.evidenceRelations[0]!.exactFetch).toEqual({ sourceKind: 'manuscript', sourceId: 'm1', digest: 'd1' });
    expect(fetched.assertions[0]!.evidenceRelations[1]!.exactFetch).toBeUndefined();
    expect(markInBookExactFetch(result, () => ({ text: '别的文字', candidate: { sourceKind: 'material', sourceId: 'x', revisionOrIndexDigest: 'd' } })).assertions[0]!.evidenceRelations[0]!.exactFetch).toBeNull();
    expect(markInBookExactFetch(result, null).assertions[0]!.evidenceRelations[0]!.exactFetch).toBeNull();
  });
});

describe('the outcome mapping (FACT-006), row by row', () => {
  const exact = (relation: string, group: string | null = 'g1') => ({ relation: relation as never, exact: true, group });
  const candidate = (relation: string) => ({ relation: relation as never, exact: false, group: null });
  const map = (level: EvidenceAssuranceLevel, relations: ReturnType<typeof exact>[], research: 'researched' | 'not-attempted' | 'incomplete' = 'researched') =>
    mapVerificationOutcome({ level, relationsStated: true, relations, research });
  it('maps each row, never by counting sources', () => {
    expect(map('standard', [exact('支持')]).outcome).toBe('证据支持');
    expect(map('standard', [exact('反驳')]).outcome).toBe('疑似错误');
    expect(map('standard', [exact('支持'), exact('反驳', 'g2')]).outcome).toBe('证据冲突');
    expect(map('standard', [candidate('支持'), candidate('反驳')]).outcome).toBe('证据不足');
    expect(map('standard', [exact('仅提供背景')]).outcome).toBe('证据不足');
    expect(map('standard', [exact('部分支持')])).toMatchObject({ outcome: '证据不足', claimSupport: '成立' });
    expect(map('standard', [], 'incomplete').outcome).toBe('无法核实');
    expect(map('standard', [candidate('支持')], 'incomplete').outcome).toBe('无法核实');
    expect(map('standard', [], 'researched').outcome).toBe('证据不足');
    expect(map('standard', [], 'not-attempted').outcome).toBe('待核查');
    // Three supporting sources are not more true than one; a single refutation is still a conflict.
    expect(map('standard', [exact('支持'), exact('支持', 'g2'), exact('支持', 'g3'), exact('反驳', 'g4')]).outcome).toBe('证据冲突');
    // 快速整理, and a contract that states no relation, record only 待核查.
    expect(map('quick', [exact('支持')])).toEqual({ outcome: '待核查', claimSupport: '未核查', gateUnmet: false });
    expect(mapVerificationOutcome({ level: 'standard', relationsStated: false, relations: [], research: 'researched' }).outcome).toBe('待核查');
  });

  it('holds 严格核查 to two independent checked sources on the side it records', () => {
    expect(map('strict', [exact('支持')])).toMatchObject({ outcome: '证据不足', gateUnmet: true });
    expect(map('strict', [exact('支持', 'g1'), exact('支持', 'g1')]).outcome).toBe('证据不足');
    expect(map('strict', [exact('支持', 'g1'), exact('支持', null)]).outcome).toBe('证据不足');
    expect(map('strict', [exact('支持', 'g1'), exact('支持', 'g2')]).outcome).toBe('证据支持');
    expect(map('strict', [exact('反驳', 'g1'), exact('反驳', 'g2')]).outcome).toBe('疑似错误');
    expect(map('strict', [exact('反驳', 'g1')]).outcome).toBe('证据不足');
  });

  it('groups lineage: one registrable domain or publisher is one source, and dependent classes count in no group', () => {
    expect(registrableDomain('https://news.museum.example.org/a')).toBe('example.org');
    expect(registrableDomain('https://www.archive.example.com.cn/zun')).toBe('example.com.cn');
    expect(registrableDomain('https://press.example.cn/zun')).toBe('example.cn');
    expect(registrableDomain('not a url')).toBeNull();
    expect(independenceGroups([
      { domain: 'example.org', publisher: '馆藏', lineage: 'original' },
      { domain: 'example.org', publisher: '镜像', lineage: null },
      { domain: 'example.cn', publisher: '馆藏', lineage: 'original' },
      { domain: 'example.com', publisher: '档案', lineage: 'translated' },
      { domain: 'example.net', publisher: '报社', lineage: 'original' },
    ])).toEqual(['g1', 'g1', 'g1', null, 'g2']);
    expect(excerptLocated('它现藏湖北省 博物馆，是重器。', '现藏湖北省博物馆')).toBe(true);
    expect(excerptLocated('它现藏湖北省博物馆。', '现藏省博物馆')).toBe(false);
    expect(excerptLocated('任何文字', '   ')).toBe(false);
  });
});

describe('the level as a plan edit, the selector and the policy pin', () => {
  it('names the level only when it is not 标准核查, so every earlier plan reads back byte for byte', () => {
    expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: [] })).toEqual(NO_PLAN_EDITS);
    expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: [], evidenceAssuranceLevel: 'standard' })).toEqual(NO_PLAN_EDITS);
    expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: [], evidenceAssuranceLevel: 'strict' })).toEqual({ removedSteps: [], disallowedAdaptations: [], evidenceAssuranceLevel: 'strict' });
    expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: [], evidenceAssuranceLevel: 'highest' })).toBeNull();
    expect(planEditAssuranceLevel(NO_PLAN_EDITS)).toBe('standard');
    expect(planEditsOf({ editorEdits: { removedSteps: [], disallowedAdaptations: [], evidenceAssuranceLevel: 'quick' } })).toMatchObject({ evidenceAssuranceLevel: 'quick' });
    expect(() => planEditsOf({ editorEdits: { removedSteps: [], disallowedAdaptations: [], evidenceAssuranceLevel: 'standard' } })).toThrow();
    const diff = planEditDiff(NO_PLAN_EDITS, { removedSteps: [], disallowedAdaptations: [], evidenceAssuranceLevel: 'quick' });
    expect(diff).toEqual([{ field: 'evidenceAssuranceLevel', label: '证据保证级别', prior: '标准核查', proposed: '快速整理', materiality: 'edited' }]);
    expect(driftEntry(diff[0]!, [])).toMatchObject({ label: '证据保证级别', prior: '标准核查', proposed: '快速整理' });
  });

  it('pins the Factual Verification Policy Document by its exact bytes, and the minimum-level hook disables lower options', () => {
    const bytes = readFileSync(resolve(__dirname, '..', '..', FACTUAL_VERIFICATION_POLICY_VERSION.document));
    expect(sha(bytes.toString('utf8'))).toBe(FACTUAL_VERIFICATION_POLICY_VERSION.sha256);
    expect(FACTUAL_VERIFICATION_POLICY_VERSION.minimumLevel).toBeNull();
    expect(levelBelowPolicyMinimum('quick')).toBe(false);
    expect(levelBelowPolicyMinimum('quick', 'standard')).toBe(true);
    expect(levelBelowPolicyMinimum('strict', 'standard')).toBe(false);
    const open = assuranceSelector('standard', { editable: true, reason: null }, null);
    expect(open.options.map((option) => [option.label, option.disabled])).toEqual([['快速整理', false], ['标准核查', false], ['严格核查', false]]);
    expect(open.options.every((option) => !/更正确|准确率|模型/u.test(option.consequence))).toBe(true);
    const raised = assuranceSelector('strict', { editable: true, reason: null }, 'standard');
    expect(raised.options.find((option) => option.level === 'quick')).toMatchObject({ disabled: true, requirement: ASSURANCE_LEVEL_POLICY_REQUIREMENT });
    expect(raised.options.find((option) => option.level === 'strict')).toMatchObject({ disabled: false, requirement: null });
  });
});

// ---- the ledger over a bare database ----------------------------------------------------------------------------------

const BOOK = '11111111-1111-4111-8111-111111111111';
const REVIEW = '22222222-2222-4222-8222-222222222222';
const BLOCK = 'blk_000000000000000000000001';
const MUSEUM = 'https://museum.example.org/zun';
const ARCHIVE = 'https://archive.example.com.cn/zun';
const PAGE = '这件尊盘出土于1978年。它现藏湖北省博物馆，是馆藏重器。';
const FINDING = `fnd_${'c'.repeat(24)}`;

function bareLedger(): { db: DatabaseSync; ledger: FactualVerificationLedger } {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  for (const sql of [...Object.values(RESEARCH_EVIDENCE_SCHEMA_SQL), ...Object.values(FACTUAL_VERIFICATION_SCHEMA_SQL), ...Object.values(FACTUAL_VERIFICATION_TRIGGER_SQL)]) db.exec(sql);
  return { db, ledger: new FactualVerificationLedger(db) };
}

function retain(db: DatabaseSync, input: { runRecordId: string; url: string; content: string | null; capturedAt: string }): void {
  const contentSha = input.content === null ? null : sha(input.content);
  if (input.content !== null) db.prepare('INSERT OR IGNORE INTO research_evidence_contents(content_sha256, content_text, recorded_at) VALUES (?, ?, ?)').run(contentSha, input.content, input.capturedAt);
  const full = input.content !== null;
  db.prepare(`INSERT INTO research_evidence(evidence_id, book_id, run_record_id, unit_ordinal, finding_id, backend_id, query_class, url, captured_at, capture_state,
    content_sha256, page_sha256, snapshot_digest, alignment, anchors_json, translation_json, staleness_state, recorded_at, canonical_json, sha256)
    VALUES (?, ?, ?, 1, ?, NULL, '机构', ?, ?, ?, ?, ?, NULL, 'unaligned', '[]', NULL, 'current', ?, ?, ?)`)
    .run(randomUUID(), BOOK, input.runRecordId, FINDING, input.url, input.capturedAt, full ? 'full-text' : 'failed', contentSha, full ? sha(`page:${input.content}`) : null,
      input.capturedAt, JSON.stringify({ sourceTitle: input.url === ARCHIVE ? '档案 - 档案馆' : '馆藏 - 博物馆' }), sha(randomUUID()));
  db.prepare(`INSERT OR IGNORE INTO research_evidence_units(run_record_id, unit_ordinal, book_id, backend_id, search_state, search_calls, retention_fetches, failed_retrievals,
    unsupported_findings, recorded_at, canonical_json, sha256) VALUES (?, 1, ?, NULL, 'completed', 1, 0, 0, 0, ?, '{}', ?)`).run(input.runRecordId, BOOK, input.capturedAt, sha(randomUUID()));
}

function finding(relations: MaterializedFactualFinding['relations'], corrections: MaterializedFactualFinding['corrections'] = []): MaterializedFactualFinding {
  return { reviewFindingId: `rvf_${'d'.repeat(24)}`, findingId: FINDING, blockId: BLOCK, fromGrapheme: 2, toGrapheme: 9, quote: '藏湖北省博物馆', pinnedText: '藏湖北省博物馆', question: '现藏何处？',
    category: '机构', severity: 'A', heading: '第一章', markId: null, unitOrdinals: [1], relations, corrections };
}

function reader(text: { value: string }): ManuscriptReader {
  return { currentBlockText: () => text.value, revisionBlocks: () => [{ blockId: BLOCK, text: text.value, heading: '第一章' }] };
}

describe('the factual verification ledger', () => {
  it('versions one assertion across Runs, supersedes the earlier decision, reuses a current capture, and refuses drift', () => {
    const { db, ledger } = bareLedger();
    const text = { value: '它现藏湖北省博物馆，是重器。' };
    const manuscript = reader(text);
    const runA = randomUUID();
    retain(db, { runRecordId: runA, url: MUSEUM, content: PAGE, capturedAt: '2026-10-16T01:00:00.000Z' });
    const base = { bookId: BOOK, reviewRunId: REVIEW, taskIntentId: randomUUID(), revisionId: randomUUID(), manuscriptRevisionId: 'rev-1', contractLevel: 'standard' as const };
    expect(ledger.materialize({ ...base, runRecordId: runA, plannedLevel: 'standard', findings: [finding([{ sourceRef: MUSEUM, relation: '支持', excerptRef: '它现藏湖北省博物馆', lineage: 'original' }])] })).toBe(1);
    // Recording the same Run again records nothing more.
    expect(ledger.materialize({ ...base, runRecordId: runA, plannedLevel: 'standard', findings: [finding([])] })).toBe(0);
    const first = ledger.lens({ bookId: BOOK, reviewRunId: null, after: null, chapterOf: () => null, filters: { chapterBlockId: null, outcome: null, severity: null, sourceCondition: null, actionNeed: null } }, manuscript).results[0]!;
    expect(first).toMatchObject({ version: 1, states: { factualVerification: '证据支持' }, pendingReview: true, actionNeed: 'review' });
    const decided = ledger.recordDecision({ bookId: BOOK, resultId: first.resultId, resultVersion: 1, disposition: 'accept', ownWords: null, reason: null }, manuscript);
    expect(decided.result.pendingReview).toBe(false);
    // A later strict Run of the same assertion: its own fetch of the museum page failed, so the earlier exact capture is reused.
    const runB = randomUUID();
    retain(db, { runRecordId: runB, url: MUSEUM, content: null, capturedAt: '2026-10-16T02:00:00.000Z' });
    retain(db, { runRecordId: runB, url: ARCHIVE, content: '档案记载：它现藏湖北省博物馆。', capturedAt: '2026-10-16T02:00:00.000Z' });
    ledger.materialize({ ...base, runRecordId: runB, plannedLevel: 'strict', contractLevel: 'strict', findings: [finding([
      { sourceRef: MUSEUM, relation: '支持', excerptRef: '它现藏湖北省博物馆', lineage: 'original' },
      { sourceRef: ARCHIVE, relation: '支持', excerptRef: '它现藏湖北省博物馆', lineage: 'original' },
    ])] });
    const lens = ledger.lens({ bookId: BOOK, reviewRunId: null, after: null, chapterOf: () => null, filters: { chapterBlockId: null, outcome: null, severity: null, sourceCondition: null, actionNeed: null } }, manuscript);
    expect(lens.results).toHaveLength(1);
    const second = lens.results[0]!;
    expect(second).toMatchObject({ version: 2, level: 'strict', states: { factualVerification: '证据支持' }, sourceCounts: { checked: 2, independent: 2, reused: 1 },
      pendingReview: true, decision: { boundVersion: 1, superseded: true } });
    const workspace = ledger.workspace(BOOK, second.resultId, null, manuscript, new Date('2026-10-16T03:00:00.000Z'));
    expect(workspace.history.map((entry) => [entry.version, entry.level])).toEqual([[1, 'standard'], [2, 'strict']]);
    expect(workspace.sources.find((card) => card.sourceRef === MUSEUM)).toMatchObject({ reused: true, checkState: 'exact' });
    expect(workspace.decisions).toEqual([expect.objectContaining({ boundVersion: 1, superseded: true })]);
    // The earlier version refuses a decision now, naming the later one.
    expect(() => ledger.recordDecision({ bookId: BOOK, resultId: first.resultId, resultVersion: 1, disposition: 'decline', ownWords: null, reason: null }, manuscript))
      .toThrow(/第 2 版/u);
    // A later capture of the museum page under another hash marks only that source's dependency changed.
    retain(db, { runRecordId: randomUUID(), url: MUSEUM, content: '这件尊盘出土于1978年。它现已移交他馆。', capturedAt: '2026-10-16T04:00:00.000Z' });
    expect(ledger.workspace(BOOK, second.resultId, null, manuscript).decisionCard.drift).toContain('来源版本已变化');
    // An edit inside the range: 锚点已失效, the result kept as history and never moved.
    text.value = '它现藏湖北某博物馆，是重器。';
    const stale = ledger.workspace(BOOK, second.resultId, null, manuscript);
    expect(stale.result.anchor).toEqual({ state: 'stale', label: STALE_VERIFICATION_ANCHOR_LABEL });
    expect(stale.decisionCard.drift).toContain(STALE_VERIFICATION_ANCHOR_LABEL);
    expect(stale.result).toMatchObject({ blockId: BLOCK, fromGrapheme: 2, toGrapheme: 9, version: 2 });
    // Every row is append-only.
    expect(() => db.prepare('DELETE FROM factual_review_decisions').run()).toThrow(/IMMUTABLE/u);
    expect(() => db.prepare("UPDATE factual_verification_results SET level = 'quick'").run()).toThrow(/IMMUTABLE/u);
  });

  it('records the level a Run executes once, lowering it only on an offline start, and the schema refuses a formal quick outcome', () => {
    const { db, ledger } = bareLedger();
    const run = randomUUID();
    const recorded = ledger.recordRunAssurance({ bookId: BOOK, runRecordId: run, taskIntentId: randomUUID(), plannedLevel: 'strict', contractLevel: 'strict', offline: true });
    expect(recorded).toMatchObject({ plannedLevel: 'strict', effectiveLevel: 'quick', disclosure: '已自动降为快速整理：未联网' });
    expect(ledger.recordRunAssurance({ bookId: BOOK, runRecordId: run, taskIntentId: randomUUID(), plannedLevel: 'standard', contractLevel: 'standard', offline: false })).toEqual(recorded);
    expect(ledger.recordRunAssurance({ bookId: BOOK, runRecordId: randomUUID(), taskIntentId: randomUUID(), plannedLevel: 'quick', contractLevel: 'quick', offline: true }))
      .toMatchObject({ effectiveLevel: 'quick', disclosure: null });
    expect(() => db.prepare(`INSERT INTO factual_run_assurance(run_record_id, book_id, task_intent_id, planned_level, effective_level, contract_level, disclosure, recorded_at, canonical_json, sha256)
      VALUES (?, ?, ?, 'standard', 'strict', NULL, NULL, 'x', '{}', ?)`).run(randomUUID(), BOOK, randomUUID(), sha('raised'))).toThrow();
    ledger.materialize({ bookId: BOOK, reviewRunId: REVIEW, runRecordId: run, taskIntentId: randomUUID(), revisionId: randomUUID(), manuscriptRevisionId: 'rev-1',
      contractLevel: 'strict', plannedLevel: 'strict', findings: [finding([{ sourceRef: MUSEUM, relation: '支持', excerptRef: '它现藏湖北省博物馆', lineage: null }],
        [{ text: '现藏他馆', rationale: '来源不同。' }])] });
    const text = { value: '它现藏湖北省博物馆，是重器。' };
    const result = ledger.lens({ bookId: BOOK, reviewRunId: null, after: null, chapterOf: () => null, filters: { chapterBlockId: null, outcome: null, severity: null, sourceCondition: null, actionNeed: null } }, reader(text)).results[0]!;
    expect(result).toMatchObject({ plannedLevel: 'strict', level: 'quick', disclosure: '已自动降为快速整理：未联网', states: { factualVerification: '待核查', claimSupport: '未核查' }, correctionAvailable: true });
    const draft = ledger.draft(BOOK, result.resultId, reader(text));
    expect(draft).toMatchObject({ assuranceIncomplete: true, label: CORRECTION_ASSURANCE_INCOMPLETE_LABEL });
    expect(draft.variants.map((variant) => variant.variantId)).toEqual(['v1']);
    // The Linked Correction Range Set holds exactly the equal occurrences; only the finding's own is primary.
    expect(draft.ranges).toEqual([expect.objectContaining({ blockId: BLOCK, fromGrapheme: 2, toGrapheme: 9, primary: true, current: true })]);
    expect(() => db.prepare(`INSERT INTO factual_verification_results(result_id, book_id, assertion_key, version, review_run_id, review_finding_id, finding_id, run_record_id,
      revision_id, manuscript_revision_id, block_id, from_grapheme, to_grapheme, level, policy_sha256, reference_integrity, claim_support, factual_verification, producer,
      recorded_at, canonical_json, sha256) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, 'r', ?, 0, 1, 'quick', ?, 'verified', '未核查', '证据支持', 'AI7', 'x', '{}', ?)`)
      .run(randomUUID(), BOOK, sha('k'), REVIEW, `rvf_${'e'.repeat(24)}`, `fnd_${'e'.repeat(24)}`, randomUUID(), randomUUID(), BLOCK, sha('p'), sha('row'))).toThrow();
  });
});
