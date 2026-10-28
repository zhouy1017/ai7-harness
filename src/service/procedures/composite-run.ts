import type { DatabaseSync } from 'node:sqlite';
import { PROCEDURE_STAGE_LABELS, type ProcedureDefinitionDocument, type ProcedureDefinitionPin } from '../../shared/protocol/procedures.js';
import { canonicalJson, requireAnalysis } from '../analysis/canonical.js';
import type { AnalysisKindDefinition } from '../analysis/kind-definition.js';
import { compositeMembers, type CompositeMember } from './composite.js';
import { procedureStopped, resolveProcedurePin, selectedProcedureForBook } from './editable.js';
import { resolveProcedureStage } from './stage-types.js';

/** What a composite Review Run snapshots: the exact version, its document and therefore its ordered members. */
export interface CompositeReviewRun {
  readonly procedure: ProcedureDefinitionPin;
  readonly document: ProcedureDefinitionDocument;
}

/**
 * One composite version run as one Review Run of a Book (Issue #1173), checked before anything is prepared or sent: the categories
 * asked for are exactly its members in its order, each model member's kind is still chosen on this Book for exactly this version,
 * and each member's executor holds every stage the member declares — or the composite does not start, and the refusal names it.
 */
export function compositeReviewRun(
  db: DatabaseSync,
  bookId: string,
  pin: ProcedureDefinitionPin,
  categoryIds: readonly string[],
  reading: (member: CompositeMember) => { readonly label: string; readonly definition: AnalysisKindDefinition | undefined } | null,
): CompositeReviewRun & { readonly members: readonly CompositeMember[] } {
  const document = resolveProcedurePin(db, pin);
  requireAnalysis(document.members !== undefined, 'PROCEDURE_NOT_COMPOSITE', '这个工序版本只绑定一类任务，请按它的任务类型运行。');
  requireAnalysis(!procedureStopped(db, pin), 'PROCEDURE_STOPPED', '这个工序版本已停用，请选择另一个版本。');
  const members = compositeMembers(document);
  requireAnalysis(canonicalJson(categoryIds) === canonicalJson(members.map((entry) => entry.member.categoryId)), 'PROCEDURE_MEMBERS_INVALID',
    `按工序《${document.title}》运行时，审阅类别须是它的全部成员，并按它的顺序。`);
  for (const entry of members) {
    const member = reading(entry);
    requireAnalysis(member !== null, 'REVIEW_CATEGORY_UNAVAILABLE', `工序《${document.title}》的一个成员已不在审阅配置中。`);
    if (entry.executorKind === 'local-text-check') continue;
    const chosen = selectedProcedureForBook(db, bookId, entry.executorKind);
    requireAnalysis(chosen !== null && canonicalJson(chosen) === canonicalJson(pin), 'PROCEDURE_CHOICE_MOVED',
      `「${member.label}」在这本书已改选其他工序版本；请在「知识库 › 工序与规则」重新运行《${document.title}》。`);
    for (const stage of entry.view.stages.slice(0, entry.member.stageCount)) {
      const executor = resolveProcedureStage(stage.stageType, member.definition);
      requireAnalysis(executor.state === 'available', 'REVIEW_CATEGORY_UNAVAILABLE',
        `「${member.label}」的「${PROCEDURE_STAGE_LABELS[stage.stageType]}」：${executor.state === 'unavailable' ? executor.reason : ''}`);
    }
  }
  return { procedure: pin, document, members };
}
