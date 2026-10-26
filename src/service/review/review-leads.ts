import {
  ANALYSIS_CONFLICT_KIND_LABELS,
  ANALYSIS_CROSS_UNIT_FINDING_KIND_LABELS,
  type AnalysisSourceRangeProjection,
  type BaselineAnalysisResultSetRevisionProjection,
  type ReviewFindingSeverity,
  type ReviewBaselineSource,
} from '../../shared/protocol.js';
import { canonicalJson, sha256Hex } from '../analysis/canonical.js';

/**
 * The leads of 情节逻辑与前后一致 (Issue #417; V2-UX-REV-011): what the baseline analysis already holds
 * about the manuscript not agreeing with itself, made into 批注 without a model call. A lead is a pointer
 * and never a verdict — it says that two places disagree or that something is left open, not which
 * place is right (the category's one clause says exactly that).
 *
 * Three lists feed it, in this order: the deterministic conflicts, the model-driven cross-unit findings,
 * and every open question the sections and the synthesis carry. The same description over the same
 * ranges is one lead however many lists name it, which is how a section's open question and the
 * synthesis's copy of it become one 批注.
 */
export const UNRESOLVED_LEAD_LABEL = '未决事项' as const;

export interface ReviewLead {
  /**
   * `lead_<sha24>` over the kind, the description and the ranges. The baseline revision is left out on
   * purpose: a lead the next baseline revision still reports, at the same places, is the same finding,
   * and a later Review Run recognises it and keeps its one 批注 rather than adding a second.
   */
  readonly leadId: string;
  readonly source: 'conflict' | 'cross-unit-finding' | 'unresolved';
  /** The analysis's own token: a conflict kind, a cross-unit kind, or `unresolved`. */
  readonly kind: string;
  readonly kindLabel: string;
  readonly description: string;
  /** A divergence asks to be looked at; an open question is a note. */
  readonly severity: ReviewFindingSeverity;
  /** Every source range the lead cites, every side in order; the first is where its 批注 is anchored. */
  readonly ranges: ReadonlyArray<AnalysisSourceRangeProjection>;
}

type LeadSource = Pick<BaselineAnalysisResultSetRevisionProjection, 'conflicts' | 'crossUnitFindings' | 'sections' | 'synthesis'>;

function plainRanges(ranges: ReadonlyArray<AnalysisSourceRangeProjection>): AnalysisSourceRangeProjection[] {
  return ranges.map((range) => ({ blockId: range.blockId, fromGrapheme: range.fromGrapheme, toGrapheme: range.toGrapheme }));
}

export function reviewLeadsOf(revision: LeadSource): ReviewLead[] {
  const leads: ReviewLead[] = [];
  const seen = new Set<string>();
  const add = (
    source: ReviewLead['source'],
    kind: string,
    kindLabel: string,
    description: string,
    severity: ReviewFindingSeverity,
    sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>,
  ): void => {
    const ranges = plainRanges(sourceRanges);
    const key = canonicalJson([description, ranges]);
    if (seen.has(key)) return;
    seen.add(key);
    leads.push({
      leadId: `lead_${sha256Hex(canonicalJson({ kind, description, ranges })).slice(0, 24)}`,
      source,
      kind,
      kindLabel,
      description,
      severity,
      ranges,
    });
  };
  for (const conflict of revision.conflicts) {
    add('conflict', conflict.kind, ANALYSIS_CONFLICT_KIND_LABELS[conflict.kind], conflict.description, 'should', conflict.sourceRanges);
  }
  for (const finding of revision.crossUnitFindings) {
    add('cross-unit-finding', finding.kind, ANALYSIS_CROSS_UNIT_FINDING_KIND_LABELS[finding.kind], finding.description, 'should',
      finding.sides.flatMap((side) => side.sourceRanges));
  }
  for (const item of [...revision.sections.flatMap((section) => section.unresolved), ...revision.synthesis.unresolved]) {
    add('unresolved', 'unresolved', UNRESOLVED_LEAD_LABEL, item.description, 'note', item.sourceRanges);
  }
  return leads;
}

/** What a lead's 批注 says on the manuscript: which kind of lead it is, then the analysis's own words. */
export function reviewLeadBody(lead: Pick<ReviewLead, 'kindLabel' | 'description'>): string {
  return `【线索 · ${lead.kindLabel}】${lead.description}`;
}

/** Snapshot only bounded baseline leads, with the exact producing revision and manuscript pin. */
export function reviewBaselineSource(revision: BaselineAnalysisResultSetRevisionProjection | null): ReviewBaselineSource | null {
  if (revision === null) return null;
  const leads: ReviewBaselineSource['leads'][number][] = [];
  let omitted = 0;
  const add = (kind: string, text: string, ranges: ReadonlyArray<AnalysisSourceRangeProjection>): void => {
    if (leads.length >= 160) { omitted += 1; return; }
    const bounded = [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text)].slice(0, 300).map((part) => part.segment).join('');
    leads.push({ ref: `baseline-${leads.length + 1}`, kind, text: bounded, ranges: plainRanges(ranges).slice(0, 8) });
  };
  for (const entity of revision.synthesis.entities) add(`first-appearance/${entity.kind}`, [entity.name, ...entity.aliases, entity.note ?? ''].join('；'), entity.sourceRanges);
  for (const event of revision.synthesis.events) add('timeline', [event.summary, event.chronology ?? '', ...event.participants].join('；'), event.sourceRanges);
  for (const claim of revision.synthesis.settingClaims) add('setting', `${claim.subject}：${claim.claim}`, claim.sourceRanges);
  for (const lead of reviewLeadsOf(revision)) add(lead.kind, lead.description, lead.ranges);
  return { resultSetId: revision.resultSetId, revisionId: revision.revisionId, digest: revision.digest,
    manuscriptPin: structuredClone(revision.manuscriptPin), leads, omitted };
}
