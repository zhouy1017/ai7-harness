import type {
  EvidenceSourceCardProjection,
  EvidenceWorkspaceProjection,
  FactualVerificationLensProjection,
  InspectEvidenceWorkspaceInput,
  InspectFactualVerificationInput,
  ResearchEvidenceBookProjection,
  ResearchEvidenceProjection,
  ReviewEvidenceSource,
  ServiceOperationMap,
} from '../../shared/protocol.js';
import { findingEvidenceSources } from '../../shared/report-wording.js';

/** The three existing reads a factual finding's sources come from; the store answers them as it answers the renderer. */
export interface ReviewEvidenceReader {
  inspectFactualVerification(input: InspectFactualVerificationInput): FactualVerificationLensProjection;
  inspectEvidenceWorkspace(input: InspectEvidenceWorkspaceInput): EvidenceWorkspaceProjection;
  inspectResearchEvidence(input: ServiceOperationMap['inspectResearchEvidence']['input']): ResearchEvidenceBookProjection;
}

/**
 * The sources of every factual finding of one Review Run, as its cards list them (ADR 0095 §5; Issue #1174): each finding's
 * latest result in the Run, its source cards less the excluded ones, joined to the retained rows of 来源与证据. Read-only;
 * the 审阅报告 records what this answers when it is generated.
 */
export function reviewRunEvidence(reader: ReviewEvidenceReader, bookId: string, reviewRunId: string): ReadonlyMap<string, ReadonlyArray<ReviewEvidenceSource>> {
  const latest = new Map<string, { resultId: string; taskIntentId: string }>();
  let after: number | null = null;
  do {
    const page = reader.inspectFactualVerification({ bookId, reviewRunId, after, chapterBlockId: null, outcome: null, severity: null, sourceCondition: null, actionNeed: null });
    for (const result of page.results) latest.set(result.reviewFindingId, { resultId: result.resultId, taskIntentId: result.taskIntentId });
    after = page.nextCursor;
  } while (after !== null);
  const evidence = new Map<string, ReadonlyArray<ReviewEvidenceSource>>();
  for (const [findingId, { resultId, taskIntentId }] of latest) {
    const cards: EvidenceSourceCardProjection[] = [];
    let sourcesAfter: number | null = null;
    do {
      const workspace = reader.inspectEvidenceWorkspace({ bookId, resultId, sourcesAfter });
      cards.push(...workspace.sources);
      sourcesAfter = workspace.nextSourceCursor;
    } while (sourcesAfter !== null);
    const retained: ResearchEvidenceProjection[] = [];
    let page: number | null = null;
    do {
      const answer = reader.inspectResearchEvidence({ bookId, after: page, staleAfterDays: null, taskIntentId, reviewFindingId: findingId });
      retained.push(...answer.records);
      page = answer.next;
    } while (page !== null);
    evidence.set(findingId, findingEvidenceSources(cards, retained));
  }
  return evidence;
}
