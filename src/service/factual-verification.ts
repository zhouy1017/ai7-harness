import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  CORRECTION_ASSURANCE_INCOMPLETE_LABEL,
  EVIDENCE_ASSURANCE_LEVEL_LABELS,
  EVIDENCE_ASSURANCE_OFFLINE_DEGRADE,
  EVIDENCE_CHECK_LABELS,
  EVIDENCE_LINEAGE_LABELS,
  EVIDENCE_MATRIX_MAX_PINNED,
  EVIDENCE_MATRIX_MIN_PINNED,
  FACTUAL_VERIFICATION_OUTCOMES,
  MAX_CORRECTION_RATIONALE_GRAPHEMES,
  MAX_CORRECTION_TEXT_GRAPHEMES,
  MAX_EVIDENCE_SOURCE_PAGE,
  MAX_FACTUAL_VERIFICATION_PAGE,
  MAX_VERIFICATION_OWN_WORDS_CHARACTERS,
  MAX_VERIFICATION_REASON_CHARACTERS,
  RESEARCH_EVIDENCE_STALE_AFTER_DAYS,
  STALE_VERIFICATION_ANCHOR_LABEL,
  VERIFICATION_REVIEW_DISPOSITIONS,
  VERIFICATION_REVIEW_DISPOSITION_LABELS,
  type CorrectionProposalDraftProjection,
  type CorrectionRangeProjection,
  type CorrectionVariantProjection,
  type EvidenceAssuranceLevel,
  type EvidenceComparisonSummaryProjection,
  type EvidenceLineageClass,
  type EvidenceRelation,
  type EvidenceSourceCardProjection,
  type EvidenceWorkspaceProjection,
  type FactualActionNeed,
  type FactualAssertionCategory,
  type FactualAssertionClass,
  type FactualCorrectionLineageProjection,
  type FactualDecisionCardProjection,
  type FactualEvidenceState,
  type FactualReviewDecisionProjection,
  type FactualRunAssuranceProjection,
  type FactualSeverityTier,
  type FactualSourceCondition,
  type FactualVerificationLensFilters,
  type FactualVerificationOutcome,
  type FactualVerificationPolicyPinProjection,
  type FactualVerificationResultProjection,
  type VerificationReasonState,
  type VerificationReviewDisposition,
} from '../shared/protocol.js';
import { UUID_PATTERN, canonicalJson, canonicalRecord, sha256Hex } from './analysis/canonical.js';
import { FACTUAL_VERIFICATION_POLICY_VERSION, graphemeCount } from './analysis/factual-review-contract.js';
import { retrievalCandidateOf, type FactualEvidenceRelation } from './analysis/factual-review-contract-v2.js';
import { evidenceStaleness, titleSiteLabel } from './analysis/factual-review-evidence.js';
import { FACTUAL_VERIFICATION_FOREIGN_KEYS, FACTUAL_VERIFICATION_SCHEMA_SQL, FACTUAL_VERIFICATION_TRIGGER_SQL } from './factual-verification-schema.js';

export { FACTUAL_VERIFICATION_FOREIGN_KEYS, FACTUAL_VERIFICATION_SCHEMA_SQL, FACTUAL_VERIFICATION_TRIGGER_SQL };

/**
 * Factual verification (Issue #901; V2-UX-FACT, EVID, EASSURE, FREV, CORR): the Versioned Verification Results a 事实核查 Run's
 * evidence supports, the editor's immutable Factual Review Decisions over them, and the lineage of each Correction Proposal.
 *
 * Every outcome here is a deterministic reading of recorded facts — the relations the Run's model stated, checked against what
 * the Run actually captured — and never a model verdict, a count of sources or a confidence (FACT-006, FACT-009, EVID-007). A
 * relation counts only when its source's exact excerpt was obtained: a page AI7 captured whole whose text holds the excerpt
 * verbatim, or an in-Book source Exact Fetch found it in (EVID-004, EVID-005). Nothing in this module sends, applies, decides a
 * proposal or grants any authority (FREV-010, EVID-012); a Correction Proposal it records lineage for is an ordinary 修改建议.
 */
export class FactualVerificationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'FactualVerificationError';
  }
}

function requireVerification(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new FactualVerificationError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;
const fold = (sql: string): string => sql.trim().replace(/\s+/gu, ' ');
/** The revision this module's relations first stand in. */
export const FACTUAL_VERIFICATION_REVISION = 78;
export const FACTUAL_VERIFICATION_PRODUCER = 'AI7 事实核查';
const RESULT_SCHEMA = 'ai7.factual-verification-result/1';
const DECISION_SCHEMA = 'ai7.factual-review-decision/1';
const PROPOSAL_SCHEMA = 'ai7.correction-proposal/1';
const RUN_ASSURANCE_SCHEMA = 'ai7.factual-run-assurance/1';
const GRAPHEMES = new Intl.Segmenter('zh', { granularity: 'grapheme' });

/** Revision 78's relations, created once on a store below it; a store that has them is checked against their exact text. */
export function initializeFactualVerificationSchema(db: DatabaseSync, version: number): void {
  const present = Object.keys(FACTUAL_VERIFICATION_SCHEMA_SQL).filter((table) =>
    db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) !== undefined);
  if (present.length > 0) {
    validateFactualVerificationSchema(db);
    return;
  }
  requireVerification(version < FACTUAL_VERIFICATION_REVISION, 'SCHEMA_INVALID', '事实核查结果表缺失。');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(FACTUAL_VERIFICATION_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(FACTUAL_VERIFICATION_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Factual verification schema rollback failed.');
    }
    throw error;
  }
}

/** Every relation and trigger of revision 78 exactly as written, and nothing of it missing. */
export function validateFactualVerificationSchema(db: DatabaseSync): void {
  for (const [name, sql] of [...Object.entries(FACTUAL_VERIFICATION_SCHEMA_SQL), ...Object.entries(FACTUAL_VERIFICATION_TRIGGER_SQL)]) {
    const row = db.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').get(name) as SqlRow | undefined;
    requireVerification(row !== undefined && typeof row.sql === 'string' && fold(row.sql) === fold(sql), 'SCHEMA_INVALID', '事实核查结果表结构不兼容。');
  }
}

// ---- Evidence Source Lineage ------------------------------------------------------------------------------------------

/** The suffixes under which a registrable domain takes three labels: a common subset of the public suffix list. */
const TWO_LABEL_SUFFIXES = new Set([
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn', 'mil.cn', 'com.hk', 'org.hk', 'edu.hk', 'gov.hk', 'com.tw', 'org.tw', 'edu.tw',
  'gov.tw', 'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'co.jp', 'ac.jp', 'or.jp', 'go.jp', 'com.au', 'org.au', 'edu.au', 'gov.au', 'com.sg', 'edu.sg',
]);

/** The registrable domain of an https address — `news.example.com.cn` → `example.com.cn` — or `null` when it has none. */
export function registrableDomain(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.length === 0 || /^[\d.]+$/u.test(host) || host.includes(':')) return host.length === 0 ? null : host;
  const labels = host.split('.').filter((label) => label.length > 0);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  return TWO_LABEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

/**
 * The independence group a checked source counts in under 严格核查 (V2-UX-EVID-008): its registrable domain and its publisher.
 * Quoted, syndicated, translated or summarized material depends on another source and counts in no group; two sources that
 * share a registrable domain or a named publisher share a group, so neither is counted twice.
 */
export function independenceGroups(sources: ReadonlyArray<{ readonly domain: string | null; readonly publisher: string | null; readonly lineage: EvidenceLineageClass | null }>): Array<string | null> {
  const identities = sources.map((source) => ({
    domain: source.domain?.trim().toLowerCase() || null,
    publisher: source.publisher?.trim().toLowerCase() || null,
  }));
  const roots = sources.map((_, index) => index);
  const root = (index: number): number => roots[index] === index ? index : root(roots[index]!);
  // A shared publisher can bridge two domains. Keep every identity and merge the entire connected group, including
  // unknown/dependent members; only explicitly original members may count as corroboration afterwards.
  for (let index = 0; index < identities.length; index += 1) {
    for (let prior = 0; prior < index; prior += 1) {
      const left = identities[index]!;
      const right = identities[prior]!;
      if ((left.domain !== null && left.domain === right.domain) || (left.publisher !== null && left.publisher === right.publisher)) {
        roots[root(index)] = root(prior);
      }
    }
  }
  const named = new Map<number, string>();
  return sources.map((source, index) => {
    const identity = identities[index]!;
    if (source.lineage !== 'original' || (identity.domain === null && identity.publisher === null)) return null;
    const key = root(index);
    if (!named.has(key)) named.set(key, `g${named.size + 1}`);
    return named.get(key)!;
  });
}

// ---- Outcome mapping --------------------------------------------------------------------------------------------------

/** What one assertion's research came to in its unit: searched, never searched, or stopped short of the policy's work. */
export type FactualResearchReach = 'researched' | 'not-attempted' | 'incomplete';

/** One relation as the outcome mapping reads it: whether its source's exact excerpt was obtained, and its group. */
export interface MappedRelation {
  readonly relation: EvidenceRelation;
  readonly exact: boolean;
  readonly group: string | null;
}

/**
 * The deterministic outcome mapping (V2-UX-FACT-006; Issue #901 brief Outcome 2). 快速整理 — or a contract that states no
 * relation — records only 待核查 (EASSURE-004, FREV-003). Otherwise: checked 支持 and no checked 反驳 → 证据支持; checked 反驳
 * and no checked 支持 → 疑似错误; both → 证据冲突; research that could not finish → 无法核实; candidates, background or any other
 * relation only, or research that found nothing → 证据不足; nothing attempted → 待核查. 严格核查 further needs two independent
 * checked sources on the side it records, else 证据不足 (EASSURE-006). Sources are never counted into confidence.
 */
export function mapVerificationOutcome(input: {
  readonly level: EvidenceAssuranceLevel;
  readonly relationsStated: boolean;
  readonly relations: ReadonlyArray<MappedRelation>;
  readonly research: FactualResearchReach;
}): { outcome: FactualVerificationOutcome; claimSupport: FactualEvidenceState; gateUnmet: boolean } {
  if (input.level === 'quick' || !input.relationsStated) return { outcome: '待核查', claimSupport: '未核查', gateUnmet: false };
  const supports = input.relations.filter((entry) => entry.exact && entry.relation === '支持');
  const refutes = input.relations.filter((entry) => entry.exact && entry.relation === '反驳');
  const partial = input.relations.some((entry) => entry.exact && entry.relation === '部分支持');
  const claimSupport: FactualEvidenceState = supports.length > 0 || partial
    ? refutes.length > 0 ? '冲突' : '成立'
    : refutes.length > 0 ? '不成立' : '未核查';
  const independent = (entries: ReadonlyArray<MappedRelation>): number => new Set(entries.map((entry) => entry.group).filter((group) => group !== null)).size;
  if (supports.length > 0 && refutes.length > 0) return { outcome: '证据冲突', claimSupport, gateUnmet: false };
  // Checked passages remain Claim Support, but unfinished required research cannot close factual verification.
  if (input.research === 'incomplete') return { outcome: '无法核实', claimSupport, gateUnmet: false };
  if (supports.length > 0 || refutes.length > 0) {
    const side = supports.length > 0 ? supports : refutes;
    if (input.level === 'strict' && independent(side) < 2) return { outcome: '证据不足', claimSupport, gateUnmet: true };
    return { outcome: supports.length > 0 ? '证据支持' : '疑似错误', claimSupport, gateUnmet: false };
  }
  if (input.relations.length > 0 || input.research === 'researched') return { outcome: '证据不足', claimSupport, gateUnmet: false };
  return { outcome: '待核查', claimSupport, gateUnmet: false };
}

// ---- Exact excerpts ---------------------------------------------------------------------------------------------------

/** Whether the captured source holds these exact characters (EVID-005), without a normalization that can change meaning. */
export function excerptLocated(captured: string, excerpt: string): boolean {
  return excerpt.trim().length > 0 && captured.includes(excerpt);
}

function graphemesOf(text: string): string[] {
  return [...GRAPHEMES.segment(text)].map((segment) => segment.segment);
}

// ---- Records ----------------------------------------------------------------------------------------------------------

/** One source of a result's evidence snapshot, as recorded with the result version. */
interface SnapshotSource {
  readonly cardId: string;
  readonly sourceRef: string;
  readonly sourceKind: 'web' | 'in-book';
  readonly relation: EvidenceRelation;
  readonly excerptRef: string | null;
  readonly lineage: EvidenceLineageClass | null;
  readonly exact: boolean;
  readonly title: string | null;
  readonly publisher: string | null;
  readonly domain: string | null;
  readonly contentSha256: string | null;
  readonly capturedAt: string | null;
  readonly captureState: 'full-text' | 'snippet-only' | 'failed' | 'exact-fetch' | 'not-captured';
  readonly evidenceId: string | null;
  readonly group: string | null;
  readonly reused: boolean;
  readonly inBookPin: FactualEvidenceRelation['exactFetch'];
}

interface StoredResult {
  readonly rowid: number;
  readonly resultId: string;
  readonly bookId: string;
  readonly assertionKey: string;
  readonly version: number;
  readonly reviewRunId: string;
  readonly reviewFindingId: string;
  readonly findingId: string;
  readonly runRecordId: string;
  readonly revisionId: string;
  readonly manuscriptRevisionId: string;
  readonly blockId: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  readonly level: EvidenceAssuranceLevel;
  readonly outcome: FactualVerificationOutcome;
  readonly claimSupport: FactualEvidenceState;
  readonly recordedAt: string;
  readonly body: {
    readonly taskIntentId: string;
    readonly plannedLevel: EvidenceAssuranceLevel;
    readonly disclosure: string | null;
    readonly quote: string;
    readonly pinnedText: string;
    readonly normalizedStatement: string;
    readonly category: FactualAssertionCategory;
    readonly severity: FactualSeverityTier;
    readonly heading: string | null;
    readonly markId: string | null;
    readonly gateUnmet: boolean;
    readonly research: FactualResearchReach;
    readonly sources: ReadonlyArray<SnapshotSource>;
    readonly corrections: ReadonlyArray<{ readonly text: string; readonly rationale: string }>;
    readonly limitations: ReadonlyArray<string>;
    readonly policy: FactualVerificationPolicyPinProjection;
  };
}

interface StoredDecision {
  readonly decisionId: string;
  readonly resultId: string;
  readonly boundVersion: number;
  readonly disposition: VerificationReviewDisposition;
  readonly ownWords: string | null;
  readonly reason: null | { state: VerificationReasonState; text: string; suggestion: string | null };
  readonly requestedLevel: EvidenceAssuranceLevel | null;
  readonly recordedAt: string;
}

/** One finding of a settled factual Run, as the store hands it to {@link FactualVerificationLedger.materialize}. */
export interface MaterializedFactualFinding {
  readonly assertionClass: FactualAssertionClass;
  readonly reviewFindingId: string;
  readonly findingId: string;
  readonly blockId: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  readonly quote: string;
  readonly pinnedText: string;
  readonly question: string;
  readonly category: FactualAssertionCategory;
  readonly severity: FactualSeverityTier;
  readonly heading: string | null;
  readonly markId: string | null;
  readonly unitOrdinals: ReadonlyArray<number>;
  /** Every relation the Run's model stated for the finding's assertions; `null` when its contract states none (v1). */
  readonly relations: ReadonlyArray<FactualEvidenceRelation> | null;
  readonly corrections: ReadonlyArray<{ readonly text: string; readonly rationale: string }>;
}

/** What the store reads of the Book's current manuscript for the anchor and range checks. */
export interface ManuscriptReader {
  /** A touched verification range stays historical even if identical words are subsequently restored. */
  rangeUntouched(runRecordId: string, blockId: string, fromGrapheme: number, toGrapheme: number): boolean;
  /** Revalidate a retained Exact Fetch against the Run's pinned, still-admitted sources without fetching externally. */
  sourceCurrent(runRecordId: string, pin: NonNullable<FactualEvidenceRelation['exactFetch']>): boolean;
  /** The current working text of a block, or `null` when the block no longer stands. */
  currentBlockText(blockId: string): string | null;
  /** The blocks of one committed revision, in order, with the chapter heading each falls under. */
  revisionBlocks(manuscriptRevisionId: string): ReadonlyArray<{ readonly blockId: string; readonly text: string; readonly heading: string | null }>;
}

const DECISION_REASON_SUGGESTIONS: Readonly<Record<FactualVerificationOutcome, ReadonlyArray<string>>> = {
  待核查: ['还没有可以下结论的证据', '先补充来源再处理'],
  证据支持: ['已核对的来源支持这条断言', '与我掌握的出处一致'],
  疑似错误: ['已核对的来源与原文不符', '需要改正原文'],
  证据不足: ['只有候选来源，尚未核对', '需要更权威的来源'],
  证据冲突: ['来源之间相互矛盾，需要再查', '以更权威的来源为准'],
  无法核实: ['联网核查没有完成', '暂时无法找到可靠来源'],
};

const RECOMMENDATIONS: Readonly<Partial<Record<FactualVerificationOutcome, { disposition: VerificationReviewDisposition; rationale: string }>>> = {
  证据支持: { disposition: 'accept', rationale: '已核对来源支持这条断言，且没有已核对的反驳来源。' },
  疑似错误: { disposition: 'accept', rationale: '已核对来源与原文不符；接受后可以准备更正提案。' },
  证据不足: { disposition: 'request-evidence', rationale: '目前只有候选来源或背景材料，补充核查后再决定。' },
  证据冲突: { disposition: 'request-evidence', rationale: '已核对来源相互冲突，AI7 不替你选择；可要求补充证据。' },
  无法核实: { disposition: 'keep-pending', rationale: '这次运行的核查没有完成，结论保持未决。' },
};

export interface MaterializeInput {
  readonly bookId: string;
  readonly reviewRunId: string;
  readonly runRecordId: string;
  readonly taskIntentId: string;
  readonly revisionId: string;
  readonly manuscriptRevisionId: string;
  /** The level the Run's contract executed; `null` for v1, which states no relation. */
  readonly contractLevel: EvidenceAssuranceLevel | null;
  readonly plannedLevel: EvidenceAssuranceLevel;
  readonly findings: ReadonlyArray<MaterializedFactualFinding>;
}

export class FactualVerificationLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  #present(): boolean {
    return this.#db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'factual_verification_results'").get() !== undefined;
  }

  // ---- Run assurance (EASSURE-002) ------------------------------------------------------------------------------------

  /**
   * The level a 事实核查 Run executes under, decided once as it starts: the planned level, lowered to 快速整理 with its
   * disclosure only when this device read offline then (D9). Nothing else ever lowers it. A Run already recorded keeps its row.
   */
  recordRunAssurance(input: {
    readonly bookId: string;
    readonly runRecordId: string;
    readonly taskIntentId: string;
    readonly plannedLevel: EvidenceAssuranceLevel;
    readonly contractLevel: EvidenceAssuranceLevel | null;
    readonly offline: boolean;
    readonly now?: Date;
  }): FactualRunAssuranceProjection {
    const existing = this.runAssurance(input.runRecordId);
    if (existing !== null) return existing;
    const degraded = input.offline && input.plannedLevel !== 'quick';
    const effectiveLevel: EvidenceAssuranceLevel = degraded ? 'quick' : input.plannedLevel;
    const contractLevel = degraded ? 'quick' : input.contractLevel;
    const disclosure = degraded ? EVIDENCE_ASSURANCE_OFFLINE_DEGRADE : null;
    const recordedAt = (input.now ?? new Date()).toISOString();
    const record = canonicalRecord({
      schema: RUN_ASSURANCE_SCHEMA, runRecordId: input.runRecordId, bookId: input.bookId, taskIntentId: input.taskIntentId,
      plannedLevel: input.plannedLevel, effectiveLevel, contractLevel, disclosure, recordedAt,
    });
    this.#db.prepare(`INSERT INTO factual_run_assurance(run_record_id, book_id, task_intent_id, planned_level, effective_level, contract_level,
      disclosure, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.runRecordId, input.bookId, input.taskIntentId, input.plannedLevel, effectiveLevel, contractLevel, disclosure, recordedAt, record.json, record.digest);
    return { runRecordId: input.runRecordId, plannedLevel: input.plannedLevel, effectiveLevel, disclosure, recordedAt };
  }

  runAssurance(runRecordId: string): FactualRunAssuranceProjection | null {
    if (!this.#present()) return null;
    const row = this.#db.prepare('SELECT * FROM factual_run_assurance WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    if (row === undefined) return null;
    requireVerification(sha256Hex(String(row.canonical_json)) === String(row.sha256), 'FACTUAL_VERIFICATION_RECORD_INVALID', '事实核查运行级别记录已损坏。');
    return {
      runRecordId, plannedLevel: String(row.planned_level) as EvidenceAssuranceLevel, effectiveLevel: String(row.effective_level) as EvidenceAssuranceLevel,
      disclosure: row.disclosure === null ? null : String(row.disclosure), recordedAt: String(row.recorded_at),
    };
  }

  /** The level the Run's contract executed (`null` for v1), as recorded at its start. */
  #contractLevel(runRecordId: string): EvidenceAssuranceLevel | null | undefined {
    const row = this.#db.prepare('SELECT contract_level FROM factual_run_assurance WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    return row === undefined ? undefined : row.contract_level === null ? null : String(row.contract_level) as EvidenceAssuranceLevel;
  }

  // ---- Versioned Verification Results (FREV-001) --------------------------------------------------------------------------

  /**
   * Record one Versioned Verification Result for each finding of a settled factual Run, inside the caller's transaction. A
   * finding already recorded for this Run is left as it is, so the call can be repeated; a finding whose assertion — the same
   * revision, range and words — has an earlier result gains the next version of it, and the earlier one stays as it was.
   */
  materialize(input: MaterializeInput, now: Date = new Date()): number {
    if (!this.#present()) return 0;
    const assurance = this.runAssurance(input.runRecordId);
    const recordedContract = this.#contractLevel(input.runRecordId);
    const contractLevel = recordedContract === undefined ? input.contractLevel : recordedContract;
    const plannedLevel = assurance?.plannedLevel ?? input.plannedLevel;
    const level: EvidenceAssuranceLevel = assurance?.effectiveLevel ?? plannedLevel;
    const disclosure = assurance?.disclosure ?? null;
    const units = this.#researchUnits(input.runRecordId);
    const insert = this.#db.prepare(`INSERT INTO factual_verification_results(result_id, book_id, assertion_key, version, review_run_id, review_finding_id,
      finding_id, run_record_id, revision_id, manuscript_revision_id, block_id, from_grapheme, to_grapheme, level, policy_sha256, reference_integrity,
      claim_support, factual_verification, producer, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    let written = 0;
    for (const finding of input.findings) {
      if (this.#db.prepare('SELECT 1 FROM factual_verification_results WHERE run_record_id = ? AND finding_id = ?').get(input.runRecordId, finding.findingId) !== undefined) continue;
      const assertionKey = assertionKeyOf(input.manuscriptRevisionId, finding);
      const latest = this.#db.prepare('SELECT MAX(version) AS version FROM factual_verification_results WHERE assertion_key = ?').get(assertionKey) as SqlRow;
      const version = (latest.version === null ? 0 : Number(latest.version)) + 1;
      const relationsStated = contractLevel !== null && finding.relations !== null;
      const sources = relationsStated && level !== 'quick' ? this.#sources(input.bookId, input.runRecordId, finding.relations!, finding.assertionClass, true, now) : [];
      const researchReach: FactualResearchReach = finding.unitOrdinals.some((ordinal) => units.get(ordinal) === 'incomplete') ? 'incomplete'
        : finding.unitOrdinals.some((ordinal) => units.get(ordinal) === 'completed') ? 'researched' : 'not-attempted';
      const mapped = mapVerificationOutcome({
        level, relationsStated, research: researchReach,
        relations: sources.map((source) => ({ relation: source.relation, exact: source.exact, group: source.group })),
      });
      const limitations = limitationsOf({ level, plannedLevel, disclosure, relationsStated, sources, gateUnmet: mapped.gateUnmet, research: researchReach });
      const resultId = randomUUID();
      const recordedAt = now.toISOString();
      const body: StoredResult['body'] = {
        taskIntentId: input.taskIntentId, plannedLevel, disclosure, quote: finding.quote, pinnedText: finding.pinnedText,
        normalizedStatement: finding.question, category: finding.category, severity: finding.severity, heading: finding.heading, markId: finding.markId,
        gateUnmet: mapped.gateUnmet, research: researchReach, sources, corrections: finding.corrections.slice(0, 3), limitations,
        policy: { ...FACTUAL_VERIFICATION_POLICY_VERSION },
      };
      const record = canonicalRecord({
        schema: RESULT_SCHEMA, resultId, bookId: input.bookId, assertionKey, version, reviewRunId: input.reviewRunId, reviewFindingId: finding.reviewFindingId,
        findingId: finding.findingId, runRecordId: input.runRecordId, revisionId: input.revisionId, manuscriptRevisionId: input.manuscriptRevisionId,
        blockId: finding.blockId, fromGrapheme: finding.fromGrapheme, toGrapheme: finding.toGrapheme, level, referenceIntegrity: 'verified',
        claimSupport: mapped.claimSupport, factualVerification: mapped.outcome, producer: FACTUAL_VERIFICATION_PRODUCER, recordedAt, body,
      });
      insert.run(resultId, input.bookId, assertionKey, version, input.reviewRunId, finding.reviewFindingId, finding.findingId, input.runRecordId, input.revisionId,
        input.manuscriptRevisionId, finding.blockId, finding.fromGrapheme, finding.toGrapheme, level, FACTUAL_VERIFICATION_POLICY_VERSION.sha256, 'verified',
        mapped.claimSupport, mapped.outcome, FACTUAL_VERIFICATION_PRODUCER, recordedAt, record.json, record.digest);
      written += 1;
    }
    return written;
  }

  /** How each researched unit of a Run ended, from the retained evidence ledger; a unit never researched is absent. */
  #researchUnits(runRecordId: string): Map<number, 'completed' | 'incomplete' | 'not-searched'> {
    const units = new Map<number, 'completed' | 'incomplete' | 'not-searched'>();
    if (this.#db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'research_evidence_units'").get() === undefined) return units;
    for (const row of this.#db.prepare('SELECT unit_ordinal, search_state FROM research_evidence_units WHERE run_record_id = ?').all(runRecordId) as SqlRow[]) {
      units.set(Number(row.unit_ordinal), String(row.search_state) as 'completed' | 'incomplete' | 'not-searched');
    }
    return units;
  }

  /**
   * Resolve each stated relation to its source and decide whether it is exact: a web source this Run captured whole — or,
   * where `reuse` holds, an earlier Run of the Book captured whole and nothing has captured it differently since (EASSURE-009)
   * — whose text holds the excerpt; an in-Book source Exact Fetch found the excerpt in. Everything else is a candidate.
   */
  #sources(bookId: string, runRecordId: string, relations: ReadonlyArray<FactualEvidenceRelation>, assertionClass: FactualAssertionClass, reuse: boolean, now: Date): SnapshotSource[] {
    const evidencePresent = this.#db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'research_evidence'").get() !== undefined;
    const captureOf = (url: string, own: boolean): SqlRow | undefined => !evidencePresent ? undefined : this.#db.prepare(`SELECT e.evidence_id, e.url, e.captured_at,
        e.capture_state, e.content_sha256, e.canonical_json, c.content_text FROM research_evidence e LEFT JOIN research_evidence_contents c ON c.content_sha256 = e.content_sha256
        WHERE e.book_id = ? AND e.url = ? AND ${own ? 'e.run_record_id = ?' : "e.run_record_id <> ? AND e.capture_state = 'full-text' AND e.staleness_state = 'current'"}
        ORDER BY e.capture_state = 'full-text' DESC, e.rowid DESC LIMIT 1`).get(bookId, url, runRecordId) as SqlRow | undefined;
    const drafted: Array<Omit<SnapshotSource, 'group'>> = relations.map((relation, index) => {
      const cardId = `src_${sha256Hex(canonicalJson({ index, sourceRef: relation.sourceRef, relation: relation.relation })).slice(0, 20)}`;
      const candidateId = retrievalCandidateOf(relation.sourceRef);
      if (candidateId !== null) {
        const found = relation.exactFetch ?? null;
        return {
          cardId, sourceRef: relation.sourceRef, sourceKind: 'in-book',
          relation: assertionClass === 'real-world-fact' || assertionClass === 'judgment' ? '仅提供背景' : relation.relation,
          excerptRef: relation.excerptRef, lineage: relation.lineage,
          exact: found !== null && relation.excerptRef !== null, title: found === null ? null : found.sourceKind === 'manuscript' ? '本书稿件' : '本书资料', publisher: 'AI7 书内来源',
          domain: found === null ? null : `in-book:${found.sourceId}`, contentSha256: found?.digest ?? null, capturedAt: null,
          captureState: found === null ? 'not-captured' : 'exact-fetch', evidenceId: null, reused: false, inBookPin: found,
        };
      }
      let url = relation.sourceRef;
      try { const parsed = new URL(url); parsed.hash = ''; url = parsed.href; } catch { /* kept as written */ }
      const ownRow = captureOf(url, true);
      const row = ownRow !== undefined && ownRow.capture_state === 'full-text' ? ownRow : reuse ? captureOf(url, false) ?? ownRow : ownRow;
      const fullText = row !== undefined && row.capture_state === 'full-text' && typeof row.content_text === 'string';
      const current = fullText && Number.isFinite(Date.parse(String(row.captured_at))) && evidenceStaleness({
        capturedAt: String(row.captured_at), now,
        laterDifferentHash: this.#laterDifferentCapture(bookId, url, String(row.captured_at), String(row.content_sha256)),
      }).state === 'current';
      const exact = current && relation.excerptRef !== null && excerptLocated(String(row.content_text), relation.excerptRef);
      let title: string | null = null;
      try { title = row === undefined ? null : (JSON.parse(String(row.canonical_json)) as { sourceTitle?: unknown }).sourceTitle as string | null ?? null; } catch { title = null; }
      const domain = registrableDomain(url);
      return {
        cardId, sourceRef: url, sourceKind: 'web', relation: relation.relation, excerptRef: relation.excerptRef, lineage: relation.lineage,
        exact, title, publisher: titleSiteLabel(title) ?? domain, domain, contentSha256: row === undefined || row.content_sha256 === null ? null : String(row.content_sha256),
        capturedAt: row === undefined ? null : String(row.captured_at),
        captureState: row === undefined ? 'not-captured' : String(row.capture_state) as 'full-text' | 'snippet-only' | 'failed',
        evidenceId: row === undefined ? null : String(row.evidence_id), reused: row !== undefined && row !== ownRow, inBookPin: null,
      };
    });
    const exactOnes = drafted.filter((source) => source.exact);
    const groups = independenceGroups(exactOnes.map((source) => ({ domain: source.domain, publisher: source.publisher, lineage: source.lineage })));
    return drafted.map((source) => ({ ...source, group: source.exact ? groups[exactOnes.indexOf(source)] ?? null : null }));
  }

  #result(row: SqlRow): StoredResult {
    const json = String(row.canonical_json);
    requireVerification(sha256Hex(json) === String(row.sha256), 'FACTUAL_VERIFICATION_RECORD_INVALID', '事实核查结果记录已损坏。');
    const record = JSON.parse(json) as Record<string, unknown> & { body: StoredResult['body'] };
    requireVerification(record.schema === RESULT_SCHEMA && record.resultId === row.result_id && record.assertionKey === row.assertion_key &&
      record.version === row.version && record.factualVerification === row.factual_verification && record.level === row.level,
    'FACTUAL_VERIFICATION_RECORD_INVALID', '事实核查结果记录已损坏。');
    return {
      rowid: Number(row.rowid), resultId: String(row.result_id), bookId: String(row.book_id), assertionKey: String(row.assertion_key), version: Number(row.version),
      reviewRunId: String(row.review_run_id), reviewFindingId: String(row.review_finding_id), findingId: String(row.finding_id),
      runRecordId: String(row.run_record_id), revisionId: String(row.revision_id), manuscriptRevisionId: String(row.manuscript_revision_id),
      blockId: String(row.block_id), fromGrapheme: Number(row.from_grapheme), toGrapheme: Number(row.to_grapheme),
      level: String(row.level) as EvidenceAssuranceLevel, outcome: String(row.factual_verification) as FactualVerificationOutcome,
      claimSupport: String(row.claim_support) as FactualEvidenceState, recordedAt: String(row.recorded_at), body: record.body,
    };
  }

  #requireResult(bookId: string, resultId: string): StoredResult {
    requireVerification(typeof resultId === 'string' && UUID_PATTERN.test(resultId), 'FACTUAL_VERIFICATION_INVALID', '核查结果标识无效。');
    requireVerification(this.#present(), 'FACTUAL_VERIFICATION_NOT_FOUND', '没有这条核查结果。');
    const row = this.#db.prepare('SELECT rowid, * FROM factual_verification_results WHERE result_id = ?').get(resultId) as SqlRow | undefined;
    requireVerification(row !== undefined && String(row.book_id) === bookId, 'FACTUAL_VERIFICATION_NOT_FOUND', '这条核查结果不属于这本书。');
    return this.#result(row);
  }

  #latestVersion(assertionKey: string): number {
    const row = this.#db.prepare('SELECT MAX(version) AS version FROM factual_verification_results WHERE assertion_key = ?').get(assertionKey) as SqlRow;
    return Number(row.version);
  }

  #decisions(assertionKey: string): StoredDecision[] {
    const rows = this.#db.prepare(`SELECT d.* FROM factual_review_decisions d JOIN factual_verification_results r ON r.result_id = d.result_id
      WHERE r.assertion_key = ? ORDER BY d.rowid`).all(assertionKey) as SqlRow[];
    return rows.map((row) => {
      const json = String(row.canonical_json);
      requireVerification(sha256Hex(json) === String(row.sha256), 'FACTUAL_VERIFICATION_RECORD_INVALID', '核查审阅决定记录已损坏。');
      const record = JSON.parse(json) as { schema?: unknown; reason?: StoredDecision['reason'] };
      requireVerification(record.schema === DECISION_SCHEMA, 'FACTUAL_VERIFICATION_RECORD_INVALID', '核查审阅决定记录已损坏。');
      return {
        decisionId: String(row.decision_id), resultId: String(row.result_id), boundVersion: Number(row.bound_version),
        disposition: String(row.disposition) as VerificationReviewDisposition, ownWords: row.own_words === null ? null : String(row.own_words),
        reason: record.reason ?? null, requestedLevel: row.requested_level === null ? null : String(row.requested_level) as EvidenceAssuranceLevel,
        recordedAt: String(row.recorded_at),
      };
    });
  }

  #decisionProjection(decision: StoredDecision, latestVersion: number): FactualReviewDecisionProjection {
    return {
      decisionId: decision.decisionId, resultId: decision.resultId, boundVersion: decision.boundVersion, disposition: decision.disposition,
      dispositionLabel: VERIFICATION_REVIEW_DISPOSITION_LABELS[decision.disposition], ownWords: decision.ownWords, reason: decision.reason,
      superseded: decision.boundVersion < latestVersion, requestedLevel: decision.requestedLevel, recordedAt: decision.recordedAt,
    };
  }

  /** Whether the manuscript still holds the result's words at its range now (FACT-010, FACT-011). */
  #anchorCurrent(result: StoredResult, reader: ManuscriptReader): boolean {
    const text = reader.currentBlockText(result.blockId);
    return reader.rangeUntouched(result.runRecordId, result.blockId, result.fromGrapheme, result.toGrapheme) &&
      text !== null && graphemesOf(text).slice(result.fromGrapheme, result.toGrapheme).join('') === result.body.pinnedText;
  }

  #projection(result: StoredResult, reader: ManuscriptReader): FactualVerificationResultProjection {
    const latestVersion = this.#latestVersion(result.assertionKey);
    const decisions = this.#decisions(result.assertionKey);
    const latestDecision = decisions.at(-1) ?? null;
    const anchorCurrent = this.#anchorCurrent(result, reader);
    const sources = result.body.sources;
    const checked = sources.filter((source) => source.exact).length;
    const candidates = sources.length - checked;
    const independent = new Set(sources.map((source) => source.group).filter((group) => group !== null)).size;
    const sourceCondition: FactualSourceCondition = result.outcome === '证据冲突' ? 'conflicting' : checked > 0 ? 'checked' : candidates > 0 ? 'candidates-only' : 'no-source';
    const boundToThis = latestDecision !== null && latestDecision.boundVersion === result.version && latestDecision.resultId === result.resultId;
    const correctionAvailable = this.#correctionOffer(result, latestDecision, anchorCurrent) !== null;
    const actionNeed: FactualActionNeed = correctionAvailable && boundToThis ? 'correction' : !boundToThis && result.version === latestVersion ? 'review' : 'none';
    return {
      resultId: result.resultId, version: result.version, assertionKey: result.assertionKey, reviewRunId: result.reviewRunId,
      reviewFindingId: result.reviewFindingId, findingId: result.findingId, runRecordId: result.runRecordId, taskIntentId: result.body.taskIntentId,
      markId: result.body.markId, blockId: result.blockId, fromGrapheme: result.fromGrapheme, toGrapheme: result.toGrapheme, quote: result.body.quote,
      normalizedStatement: result.body.normalizedStatement, heading: result.body.heading, category: result.body.category, severity: result.body.severity,
      plannedLevel: result.body.plannedLevel, level: result.level, levelLabel: EVIDENCE_ASSURANCE_LEVEL_LABELS[result.level], disclosure: result.body.disclosure,
      states: { referenceIntegrity: 'verified', claimSupport: result.claimSupport, factualVerification: result.outcome },
      sourceCondition, actionNeed, sourceCounts: { checked, candidates, independent, reused: sources.filter((source) => source.reused).length },
      limitations: result.body.limitations, policyPin: result.body.policy, producer: FACTUAL_VERIFICATION_PRODUCER, recordedAt: result.recordedAt,
      anchor: anchorCurrent ? { state: 'current', label: null } : { state: 'stale', label: STALE_VERIFICATION_ANCHOR_LABEL },
      decision: latestDecision === null ? null : this.#decisionProjection(latestDecision, latestVersion),
      pendingReview: result.version === latestVersion && !boundToThis,
      correctionAvailable,
    };
  }

  /**
   * Whether 准备更正提案 is offered, and with what assurance (FREV-008, EASSURE-004, EASSURE-012): on the latest version, on a
   * current anchor, and not after the editor declined the result. Accepting 疑似错误 at 标准核查 or 严格核查 offers a complete
   * proposal; a result that records no formal outcome offers only an evidence-incomplete one; 证据支持 offers none.
   */
  #correctionOffer(result: StoredResult, decision: StoredDecision | null, anchorCurrent: boolean): null | { incomplete: boolean; decisionId: string | null } {
    if (!anchorCurrent || result.version !== this.#latestVersion(result.assertionKey)) return null;
    const bound = decision !== null && decision.resultId === result.resultId ? decision : null;
    if (bound?.disposition === 'decline') return null;
    if (result.outcome === '疑似错误') return bound?.disposition === 'accept' ? { incomplete: result.level === 'quick', decisionId: bound.decisionId } : null;
    if (result.outcome === '证据支持') return null;
    return { incomplete: true, decisionId: bound?.decisionId ?? null };
  }

  // ---- The Fact-check Lens (FACT-004, FACT-005, FACT-007) -----------------------------------------------------------------

  /**
   * One bounded page of results: a Review Run's own, or the latest version of every assertion of the Book, in manuscript
   * order of their recording, each with its three states apart and the editor's decision, filtered as the editor asked.
   */
  lens(input: { bookId: string; reviewRunId: string | null; after: number | null; filters: FactualVerificationLensFilters; chapterOf: (blockId: string) => string | null },
    reader: ManuscriptReader): { results: FactualVerificationResultProjection[]; nextCursor: number | null; total: number; counts: Array<{ outcome: FactualVerificationOutcome; count: number }> } {
    if (!this.#present()) return { results: [], nextCursor: null, total: 0, counts: FACTUAL_VERIFICATION_OUTCOMES.map((outcome) => ({ outcome, count: 0 })) };
    const rows = (input.reviewRunId === null
      ? this.#db.prepare(`SELECT rowid, * FROM factual_verification_results r WHERE book_id = ? AND version =
          (SELECT MAX(version) FROM factual_verification_results l WHERE l.assertion_key = r.assertion_key) ORDER BY rowid`).all(input.bookId)
      : this.#db.prepare('SELECT rowid, * FROM factual_verification_results WHERE book_id = ? AND review_run_id = ? ORDER BY rowid').all(input.bookId, input.reviewRunId)) as SqlRow[];
    const all = rows.map((row) => this.#result(row));
    const counts = FACTUAL_VERIFICATION_OUTCOMES.map((outcome) => ({ outcome, count: all.filter((result) => result.outcome === outcome).length }));
    const { filters } = input;
    const matching = all.filter((result) => (filters.outcome === null || result.outcome === filters.outcome) &&
      (filters.severity === null || result.body.severity === filters.severity) &&
      (filters.chapterBlockId === null || input.chapterOf(result.blockId) === filters.chapterBlockId));
    const filtered = matching.map((result) => ({ result, projected: this.#projection(result, reader) })).filter(({ projected }) =>
      (filters.sourceCondition === null || projected.sourceCondition === filters.sourceCondition) &&
      (filters.actionNeed === null || projected.actionNeed === filters.actionNeed));
    const page: FactualVerificationResultProjection[] = [];
    let nextCursor: number | null = null;
    for (const { result, projected } of filtered) {
      if (input.after !== null && result.rowid <= input.after) continue;
      if (page.length === MAX_FACTUAL_VERIFICATION_PAGE) { nextCursor = page.at(-1) === undefined ? null : this.#rowidOf(page.at(-1)!.resultId); break; }
      page.push(projected);
    }
    return { results: page, nextCursor, total: filtered.length, counts };
  }

  #rowidOf(resultId: string): number {
    return Number((this.#db.prepare('SELECT rowid FROM factual_verification_results WHERE result_id = ?').get(resultId) as SqlRow).rowid);
  }

  /** The latest result of one Review Finding, for the 依据与核查 region of its mark and for deep links. */
  resultOfFinding(bookId: string, reviewFindingId: string): string | null {
    if (!this.#present()) return null;
    const row = this.#db.prepare('SELECT result_id FROM factual_verification_results WHERE book_id = ? AND review_finding_id = ? ORDER BY rowid DESC LIMIT 1')
      .get(bookId, reviewFindingId) as SqlRow | undefined;
    return row === undefined ? null : String(row.result_id);
  }

  // ---- The Evidence Workspace (EVID-001 to EVID-013) -------------------------------------------------------------------------

  workspace(bookId: string, resultId: string, sourcesAfter: number | null, reader: ManuscriptReader, now: Date = new Date()): EvidenceWorkspaceProjection {
    const result = this.#requireResult(bookId, resultId);
    requireVerification(sourcesAfter === null || (Number.isSafeInteger(sourcesAfter) && sourcesAfter >= 0), 'FACTUAL_VERIFICATION_INVALID', '来源分页位置无效。');
    const projected = this.#projection(result, reader);
    const cards = result.body.sources.map((source) => this.#card(result.bookId, source, now));
    const start = sourcesAfter ?? 0;
    const page = cards.slice(start, start + MAX_EVIDENCE_SOURCE_PAGE);
    const supporting = cards.filter((card) => card.checkState === 'exact' && card.relation === '支持');
    const refuting = cards.filter((card) => card.checkState === 'exact' && card.relation === '反驳');
    const conflicts = supporting.flatMap((left) => refuting.map((right) => ({
      supportingCardId: left.cardId, refutingCardId: right.cardId,
      point: `「${left.excerpt ?? ''}」与「${right.excerpt ?? ''}」所述不一致；AI7 不替你选择哪一方。`,
    })));
    const versions = (this.#db.prepare('SELECT rowid, * FROM factual_verification_results WHERE assertion_key = ? ORDER BY version').all(result.assertionKey) as SqlRow[])
      .map((row) => this.#result(row));
    const latestVersion = versions.at(-1)!.version;
    return {
      bookId, result: projected, sources: page,
      nextSourceCursor: start + MAX_EVIDENCE_SOURCE_PAGE < cards.length ? start + MAX_EVIDENCE_SOURCE_PAGE : null,
      totalSources: cards.length, conflicts, summary: comparisonSummary(cards),
      history: versions.map((version) => ({ resultId: version.resultId, version: version.version, outcome: version.outcome, level: version.level, recordedAt: version.recordedAt })),
      decisions: this.#decisions(result.assertionKey).map((decision) => this.#decisionProjection(decision, latestVersion)),
      decisionCard: this.#decisionCard(result, projected, reader, now),
      matrix: { minPinned: EVIDENCE_MATRIX_MIN_PINNED, maxPinned: EVIDENCE_MATRIX_MAX_PINNED },
    };
  }

  #card(bookId: string, source: SnapshotSource, now: Date): EvidenceSourceCardProjection {
    const freshness = source.capturedAt === null ? null : evidenceStaleness({
      capturedAt: source.capturedAt, now, staleAfterDays: RESEARCH_EVIDENCE_STALE_AFTER_DAYS,
      laterDifferentHash: source.sourceKind === 'web' && source.contentSha256 !== null && this.#laterDifferentCapture(bookId, source.sourceRef, source.capturedAt, source.contentSha256),
    });
    const integrity = source.captureState === 'not-captured' || source.captureState === 'failed' ? 'not-captured' as const : source.exact ? 'located' as const : 'not-located' as const;
    return {
      cardId: source.cardId, sourceRef: source.sourceRef, sourceKind: source.sourceKind, title: source.title,
      checkState: source.exact ? 'exact' : 'candidate', checkLabel: EVIDENCE_CHECK_LABELS[source.exact ? 'exact' : 'candidate'], relation: source.relation,
      // A candidate is never quoted (EVID-004): only an exact excerpt is shown as what the source says.
      excerpt: source.exact ? source.excerptRef : null,
      sourceVersion: source.contentSha256, publisher: source.publisher, registrableDomain: source.domain, capturedAt: source.capturedAt,
      freshness: freshness === null ? 'unknown' : freshness.state,
      freshnessLabel: freshness === null ? '时间未知' : freshness.state === 'current' ? '当前' : '可能已过期',
      integrity, integrityLabel: integrity === 'located' ? '引文完整' : integrity === 'not-located' ? '摘录未在原文中找到' : '未取得原文',
      lineage: source.lineage, lineageLabel: source.lineage === null ? '来源关系未标注' : EVIDENCE_LINEAGE_LABELS[source.lineage],
      independenceGroup: source.group, evidenceId: source.evidenceId, reused: source.reused,
    };
  }

  #laterDifferentCapture(bookId: string, url: string, capturedAt: string, contentSha256: string): boolean {
    if (this.#db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'research_evidence'").get() === undefined) return false;
    return this.#db.prepare("SELECT 1 FROM research_evidence WHERE book_id = ? AND url = ? AND captured_at >= ? AND capture_state = 'full-text' AND content_sha256 <> ? LIMIT 1")
      .get(bookId, url, capturedAt, contentSha256) !== undefined;
  }

  #decisionCard(result: StoredResult, projected: FactualVerificationResultProjection, reader: ManuscriptReader, now: Date): FactualDecisionCardProjection {
    return {
      choices: VERIFICATION_REVIEW_DISPOSITIONS.map((disposition) => ({ disposition, label: VERIFICATION_REVIEW_DISPOSITION_LABELS[disposition] })),
      recommendation: RECOMMENDATIONS[result.outcome] ?? null,
      reasonSuggestions: DECISION_REASON_SUGGESTIONS[result.outcome],
      drift: this.#drift(result, projected, reader, now),
    };
  }

  /** The exact dependency that changed since the result, which refuses a decision on it now (FREV-011); `null` when none did. */
  #drift(result: StoredResult, projected: FactualVerificationResultProjection, reader: ManuscriptReader, now: Date = new Date()): string | null {
    if (result.version !== this.#latestVersion(result.assertionKey)) return `这条断言已有更新的核查结果（第 ${this.#latestVersion(result.assertionKey)} 版）；请看最新结果再决定。`;
    if (!this.#anchorCurrent(result, reader)) return `${STALE_VERIFICATION_ANCHOR_LABEL}：稿件在这段文字处已经改动，核查结果只作为历史保留。`;
    const inBookMoved = result.body.sources.find((source) => source.exact && source.sourceKind === 'in-book' &&
      (source.inBookPin == null || !reader.sourceCurrent(result.runRecordId, source.inBookPin)));
    if (inBookMoved !== undefined) return '书内来源版本或授权已变化，请重新核对这条结果的来源。';
    const moved = result.body.sources.find((source) => source.exact && source.sourceKind === 'web' && source.contentSha256 !== null && source.capturedAt !== null &&
      this.#laterDifferentCapture(result.bookId, source.sourceRef, source.capturedAt, source.contentSha256));
    if (moved !== undefined) return `来源版本已变化：${moved.title ?? moved.sourceRef} 后来取回的内容与这次核查所用的不同。`;
    const expired = result.body.sources.find((source) => source.exact && source.sourceKind === 'web' && source.capturedAt !== null &&
      evidenceStaleness({ capturedAt: source.capturedAt, now, laterDifferentHash: false }).state !== 'current');
    if (expired !== undefined) return `来源新鲜度已变化：${expired.title ?? expired.sourceRef} 已超过有效核查期限，请重新核对。`;
    void projected;
    return null;
  }

  // ---- Factual Review Decisions (FREV-004 to FREV-011) ----------------------------------------------------------------------

  /**
   * 记录核查审阅决定: one immutable Review Decision bound to the exact result version the editor read, with the actor, the time,
   * the disposition and the optional reason with how the editor treated its suggestion. A later version, a changed anchor or a
   * changed source refuses it with the exact dependency (FREV-011). It grants nothing and changes no manuscript text (FREV-010).
   */
  recordDecision(input: {
    bookId: string; resultId: string; resultVersion: number; disposition: VerificationReviewDisposition; ownWords: string | null;
    reason: null | { state: VerificationReasonState; text: string; suggestion: string | null };
  }, reader: ManuscriptReader, now: Date = new Date()): { decisionId: string; requestedLevel: EvidenceAssuranceLevel | null; result: FactualVerificationResultProjection } {
    const result = this.#requireResult(input.bookId, input.resultId);
    requireVerification(VERIFICATION_REVIEW_DISPOSITIONS.includes(input.disposition), 'FACTUAL_DECISION_INVALID', '请选择一项核查审阅决定。');
    requireVerification(input.resultVersion === result.version, 'FACTUAL_DECISION_STALE', '你看到的不是这条核查结果的这一版；请重新打开。');
    const projected = this.#projection(result, reader);
    const drift = this.#drift(result, projected, reader, now);
    requireVerification(drift === null, 'FACTUAL_DECISION_DRIFT', drift ?? '');
    const ownWords = input.disposition === 'own-words' ? (input.ownWords ?? '').trim() : null;
    requireVerification(input.disposition === 'own-words' ? ownWords !== null && ownWords.length > 0 && [...ownWords].length <= MAX_VERIFICATION_OWN_WORDS_CHARACTERS : input.ownWords === null,
      'FACTUAL_DECISION_INVALID', `自行输入的结论需要 1–${MAX_VERIFICATION_OWN_WORDS_CHARACTERS} 个字。`);
    const reason = input.reason === null ? null : { state: input.reason.state, text: input.reason.text.trim(), suggestion: input.reason.suggestion };
    requireVerification(reason === null || (['selected', 'corrected', 'replaced'].includes(reason.state) && reason.text.length > 0 &&
      [...reason.text].length <= MAX_VERIFICATION_REASON_CHARACTERS && (reason.state === 'replaced' ? reason.suggestion === null : reason.suggestion !== null &&
        DECISION_REASON_SUGGESTIONS[result.outcome].includes(reason.suggestion)) && (reason.state !== 'selected' || reason.text === reason.suggestion)),
    'FACTUAL_DECISION_INVALID', '理由与所选建议不一致。');
    // 要求补充证据 asks for the same level or a higher one, never a lower one (FREV-008, EASSURE-010).
    const requestedLevel: EvidenceAssuranceLevel | null = input.disposition === 'request-evidence' ? result.level === 'quick' ? 'standard' : result.level : null;
    const decisionId = randomUUID();
    const recordedAt = now.toISOString();
    const record = canonicalRecord({
      schema: DECISION_SCHEMA, decisionId, bookId: input.bookId, resultId: result.resultId, assertionKey: result.assertionKey, boundVersion: result.version,
      disposition: input.disposition, ownWords, reason, requestedLevel, actor: 'editor', recordedAt,
    });
    this.#db.prepare(`INSERT INTO factual_review_decisions(decision_id, book_id, result_id, bound_version, disposition, own_words, reason_state, reason_text,
      requested_level, actor, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'editor', ?, ?, ?)`)
      .run(decisionId, input.bookId, result.resultId, result.version, input.disposition, ownWords, reason?.state ?? null, reason?.text ?? null,
        requestedLevel, recordedAt, record.json, record.digest);
    return { decisionId, requestedLevel, result: this.#projection(result, reader) };
  }

  // ---- Correction Proposals (CORR-001 to CORR-012) -----------------------------------------------------------------------------

  /**
   * 准备更正提案: the draft offer — the Run's own 1–3 Correction Variants for this assertion, unselected, plus 自行编辑; the
   * Linked Correction Range Set of exactly the occurrences of the finding's words in the pinned revision, only the finding's
   * own included by default; and the assurance it would carry. A read: nothing is written (CORR-004).
   */
  draft(bookId: string, resultId: string, reader: ManuscriptReader): CorrectionProposalDraftProjection {
    const result = this.#requireResult(bookId, resultId);
    const decision = this.#decisions(result.assertionKey).at(-1) ?? null;
    const anchorCurrent = this.#anchorCurrent(result, reader);
    const offer = this.#correctionOffer(result, decision, anchorCurrent);
    requireVerification(offer !== null, 'CORRECTION_NOT_OFFERED', anchorCurrent ? '这条核查结果现在不能准备更正提案。' : `${STALE_VERIFICATION_ANCHOR_LABEL}：不能在已改动的文字上准备更正提案。`);
    const projected = this.#projection(result, reader);
    const drift = this.#drift(result, projected, reader);
    requireVerification(drift === null, 'CORRECTION_STALE', drift ?? '');
    const cards = result.body.sources.map((source) => this.#card(result.bookId, source, new Date()));
    const against = cards.filter((card) => card.checkState === 'exact' && card.relation === '反驳').map((card) => card.cardId);
    const unresolved = [
      ...cards.filter((card) => card.checkState === 'candidate').map((card) => `${card.title ?? card.sourceRef}：${card.checkLabel}`),
      ...cards.filter((card) => card.checkState === 'exact' && card.relation === '支持').map((card) => `${card.title ?? card.sourceRef}：已核对来源支持原文`),
    ];
    const missing = missingChecksOf(result);
    const limitations = [...result.body.limitations];
    const variants: CorrectionVariantProjection[] = result.body.corrections.map((variant, index) => ({
      variantId: `v${index + 1}`, text: variant.text, rationale: variant.rationale, evidenceCardIds: against, unresolved, limitations,
    }));
    return {
      bookId, result: projected, decisionId: offer.decisionId, variants, ownEditAllowed: true, scope: 'minimal',
      scopeStatement: '最小更正：只改这条断言必须改的文字，不顺带润色、调整结构或改动相邻内容。',
      ranges: this.#ranges(result, reader), assuranceIncomplete: offer.incomplete, missingChecks: offer.incomplete ? missing : [],
      label: offer.incomplete ? CORRECTION_ASSURANCE_INCOMPLETE_LABEL : null,
    };
  }

  /** Exact-equal occurrences of the finding's words in the pinned revision; approximate text is never included (CORR-007). */
  #ranges(result: StoredResult, reader: ManuscriptReader): CorrectionRangeProjection[] {
    const needle = graphemesOf(result.body.pinnedText);
    const ranges: CorrectionRangeProjection[] = [];
    for (const block of reader.revisionBlocks(result.manuscriptRevisionId)) {
      const haystack = graphemesOf(block.text);
      for (let start = 0; start + needle.length <= haystack.length; start += 1) {
        if (needle.some((grapheme, offset) => haystack[start + offset] !== grapheme)) continue;
        const current = reader.currentBlockText(block.blockId);
        ranges.push({
          rangeId: `rng_${sha256Hex(`${block.blockId}:${start}:${start + needle.length}`).slice(0, 24)}`,
          blockId: block.blockId, fromGrapheme: start, toGrapheme: start + needle.length, text: result.body.pinnedText, heading: block.heading,
          primary: block.blockId === result.blockId && start === result.fromGrapheme,
          current: reader.rangeUntouched(result.runRecordId, block.blockId, start, start + needle.length) &&
            current !== null && graphemesOf(current).slice(start, start + needle.length).join('') === result.body.pinnedText,
        });
      }
    }
    return ranges;
  }

  /**
   * What 保存为更正提案 writes, checked before any mark is made: the chosen variant or the editor's own words, a rationale, and
   * the included ranges — each current. The store makes the 修改建议 marks through the ordinary producer and then calls
   * {@link recordProposal} in the same transaction.
   */
  prepareSave(input: { bookId: string; resultId: string; resultVersion: number; variantId: string | null; text: string; rationale: string; rangeIds: ReadonlyArray<string> },
    reader: ManuscriptReader): { draft: CorrectionProposalDraftProjection; ranges: CorrectionRangeProjection[]; text: string; rationale: string; variant: 'own-edit' | 'v1' | 'v2' | 'v3' } {
    const draft = this.draft(input.bookId, input.resultId, reader);
    requireVerification(input.resultVersion === draft.result.version, 'CORRECTION_STALE', '核查结果已有新版本；请重新准备更正提案。');
    const variant = input.variantId === null ? 'own-edit' as const : draft.variants.find((entry) => entry.variantId === input.variantId)?.variantId as 'v1' | 'v2' | 'v3' | undefined;
    requireVerification(variant !== undefined, 'CORRECTION_INVALID', '所选更正方案不在这次运行给出的方案中。');
    const text = input.text;
    requireVerification(variant === 'own-edit' || text === draft.variants.find((entry) => entry.variantId === variant)?.text,
      'CORRECTION_INVALID', '修改方案文字后请使用自行编辑，不能记为运行给出的原方案。');
    requireVerification(typeof text === 'string' && text.isWellFormed() && text.trim().length > 0 && graphemeCount(text) <= MAX_CORRECTION_TEXT_GRAPHEMES,
      'CORRECTION_INVALID', `更正文字需要 1–${MAX_CORRECTION_TEXT_GRAPHEMES} 个字。`);
    requireVerification(text !== (draft.ranges.find((range) => range.primary)?.text ?? draft.result.quote), 'CORRECTION_INVALID', '更正文字与原文相同。');
    requireVerification(typeof input.rationale === 'string' && input.rationale.isWellFormed() && graphemeCount(input.rationale) <= MAX_CORRECTION_RATIONALE_GRAPHEMES,
      'CORRECTION_INVALID', `更正理由最多 ${MAX_CORRECTION_RATIONALE_GRAPHEMES} 个字。`);
    requireVerification(Array.isArray(input.rangeIds) && input.rangeIds.length > 0 && new Set(input.rangeIds).size === input.rangeIds.length,
      'CORRECTION_INVALID', '至少保留一处要更正的位置。');
    const ranges = input.rangeIds.map((rangeId) => draft.ranges.find((range) => range.rangeId === rangeId));
    requireVerification(ranges.every((range) => range !== undefined), 'CORRECTION_INVALID', '所选位置不是这段文字在核查版本中的原样出现处。');
    requireVerification(ranges.every((range) => range!.current), 'CORRECTION_TARGET_CHANGED', '所选位置的文字已经改动；不会改到别处，请重新准备更正提案。');
    return { draft, ranges: ranges as CorrectionRangeProjection[], text, rationale: input.rationale, variant };
  }

  /** One lineage row per created 修改建议, inside the caller's transaction (CORR-011). */
  recordProposal(input: {
    bookId: string; proposalId: string; draft: CorrectionProposalDraftProjection; markIds: ReadonlyArray<string>; ranges: ReadonlyArray<CorrectionRangeProjection>;
    text: string; rationale: string; variant: 'own-edit' | 'v1' | 'v2' | 'v3';
  }, now: Date = new Date()): void {
    const result = this.#requireResult(input.bookId, input.draft.result.resultId);
    requireVerification(input.markIds.length === input.ranges.length, 'CORRECTION_INVALID', '更正提案的标记与位置不一致。');
    const recordedAt = now.toISOString();
    input.markIds.forEach((markId, index) => {
      const range = input.ranges[index]!;
      const record = canonicalRecord({
        schema: PROPOSAL_SCHEMA, markId, proposalId: input.proposalId, bookId: input.bookId, resultId: result.resultId, resultVersion: result.version,
        decisionId: input.draft.decisionId, findingId: result.findingId, level: result.level, policy: result.body.policy,
        assuranceIncomplete: input.draft.assuranceIncomplete, missingChecks: input.draft.missingChecks, variant: input.variant, text: input.text,
        rationale: input.rationale, range: { ordinal: index + 1, blockId: range.blockId, fromGrapheme: range.fromGrapheme, toGrapheme: range.toGrapheme, primary: range.primary },
        rangeSet: input.draft.ranges.map((entry) => ({ rangeId: entry.rangeId, included: input.ranges.some((chosen) => chosen.rangeId === entry.rangeId) })),
        evidence: result.body.sources.map((source) => ({ cardId: source.cardId, sourceRef: source.sourceRef, exact: source.exact, relation: source.relation, contentSha256: source.contentSha256 })),
        states: { referenceIntegrity: 'verified', claimSupport: result.claimSupport, factualVerification: result.outcome }, recordedAt,
      });
      this.#db.prepare(`INSERT INTO correction_proposals(mark_id, proposal_id, book_id, result_id, result_version, decision_id, finding_id, level, policy_sha256,
        assurance_incomplete, variant, range_ordinal, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(markId, input.proposalId, input.bookId, result.resultId, result.version, input.draft.decisionId, result.findingId, result.level,
          result.body.policy.sha256, input.draft.assuranceIncomplete ? 1 : 0, input.variant, index + 1, recordedAt, record.json, record.digest);
    });
  }

  /** The factual lineage of a Correction Proposal's 修改建议, for its card's 依据与核查 region; `null` for every other mark. */
  lineageOfMark(markId: string): FactualCorrectionLineageProjection | null {
    if (!this.#present()) return null;
    const row = this.#db.prepare('SELECT * FROM correction_proposals WHERE mark_id = ?').get(markId) as SqlRow | undefined;
    if (row === undefined) return null;
    const json = String(row.canonical_json);
    requireVerification(sha256Hex(json) === String(row.sha256), 'FACTUAL_VERIFICATION_RECORD_INVALID', '更正提案记录已损坏。');
    const record = JSON.parse(json) as { schema?: unknown; states: FactualCorrectionLineageProjection['states']; missingChecks: string[]; evidence: Array<{ exact: boolean }>; policy: FactualVerificationPolicyPinProjection };
    requireVerification(record.schema === PROPOSAL_SCHEMA, 'FACTUAL_VERIFICATION_RECORD_INVALID', '更正提案记录已损坏。');
    const level = String(row.level) as EvidenceAssuranceLevel;
    const incomplete = Number(row.assurance_incomplete) === 1;
    return {
      proposalId: String(row.proposal_id), resultId: String(row.result_id), resultVersion: Number(row.result_version),
      decisionId: row.decision_id === null ? null : String(row.decision_id), level, levelLabel: EVIDENCE_ASSURANCE_LEVEL_LABELS[level], states: record.states,
      checkedSources: record.evidence.filter((entry) => entry.exact).length, candidateSources: record.evidence.filter((entry) => !entry.exact).length,
      policyPin: record.policy, assuranceLabel: incomplete ? CORRECTION_ASSURANCE_INCOMPLETE_LABEL : null, missingChecks: incomplete ? record.missingChecks : [],
    };
  }
}

/** The assertion key (FREV-001): the manuscript revision, the digest of the exact range, and the digest of the words there. */
export function assertionKeyOf(manuscriptRevisionId: string, finding: { blockId: string; fromGrapheme: number; toGrapheme: number; pinnedText: string }): string {
  return sha256Hex(canonicalJson({
    manuscriptRevisionId,
    rangeDigest: sha256Hex(canonicalJson({ blockId: finding.blockId, fromGrapheme: finding.fromGrapheme, toGrapheme: finding.toGrapheme })),
    quoteDigest: sha256Hex(finding.pinnedText),
  }));
}

function limitationsOf(input: {
  level: EvidenceAssuranceLevel; plannedLevel: EvidenceAssuranceLevel; disclosure: string | null; relationsStated: boolean;
  sources: ReadonlyArray<SnapshotSource>; gateUnmet: boolean; research: FactualResearchReach;
}): string[] {
  const lines: string[] = [];
  if (input.disclosure !== null) lines.push(input.disclosure);
  if (input.level === 'quick') lines.push('快速整理：只列出断言与候选方向，没有记录支持或反驳的正式结论。');
  else if (!input.relationsStated) lines.push('这次运行的核查契约不判断证据关系；结论保持待核查。');
  const candidates = input.sources.filter((source) => !source.exact).length;
  if (candidates > 0) lines.push(`${candidates} 个来源只是候选来源，尚未核对，不计入结论。`);
  if (input.gateUnmet) lines.push('严格核查要求两个以上相互独立的已核对来源；目前不足。');
  if (input.research === 'incomplete') lines.push('联网核查未完成。');
  lines.push('核查结果是证据评估，不是事实定论，也不构成审阅决定或任何授权。');
  return lines;
}

function missingChecksOf(result: StoredResult): string[] {
  const missing: string[] = [];
  if (result.level === 'quick') missing.push('未做证据核查（快速整理）');
  if (result.body.sources.length === 0) missing.push('没有找到来源');
  else if (!result.body.sources.some((source) => source.exact)) missing.push('没有精确取文的来源');
  if (result.body.gateUnmet) missing.push('缺少第二个相互独立的已核对来源');
  if (result.outcome === '证据冲突') missing.push('来源之间的冲突未解决');
  if (result.outcome === '无法核实') missing.push('联网核查未完成');
  return missing;
}

/**
 * The AI7 Evidence Comparison Summary (V2-UX-EVID-010): statements AI7 derives from the cards themselves, each linked to the
 * cards it speaks of. It is labelled 非证据, cites no model knowledge, and says 尚无足够证据 where there is none.
 */
function comparisonSummary(cards: ReadonlyArray<EvidenceSourceCardProjection>): EvidenceComparisonSummaryProjection {
  const statements: Array<{ text: string; cardIds: string[] }> = [];
  const exact = cards.filter((card) => card.checkState === 'exact');
  const byRelation = (relation: EvidenceRelation): EvidenceSourceCardProjection[] => exact.filter((card) => card.relation === relation);
  for (const relation of ['支持', '部分支持', '反驳', '仅提供背景', '关系待判断'] as const) {
    const matching = byRelation(relation);
    if (matching.length > 0) statements.push({ text: `已核对来源中 ${matching.length} 个对这条断言的关系为「${relation}」。`, cardIds: matching.map((card) => card.cardId) });
  }
  const candidates = cards.filter((card) => card.checkState === 'candidate');
  if (candidates.length > 0) statements.push({ text: `${candidates.length} 个候选来源尚未核对，不计入结论。`, cardIds: candidates.map((card) => card.cardId) });
  const groups = new Set(exact.map((card) => card.independenceGroup).filter((group) => group !== null));
  if (exact.length > 0 && groups.size < exact.length) statements.push({ text: '部分已核对来源来自同一发布方或同一域名，或为转引、转载、译介、摘述，不算相互独立的佐证。', cardIds: exact.map((card) => card.cardId) });
  if (exact.length === 0) statements.push({ text: '尚无足够证据：没有精确取文的来源。', cardIds: [] });
  return { label: '非证据', statements };
}
