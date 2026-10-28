import type { ProcedureDefinitionDocument, ProcedureDefinitionPin, ProcedureMemberDefinition } from '../../shared/protocol/procedures.js';
import { canonicalJson, requireAnalysis, sha256Hex } from '../analysis/canonical.js';
import type { DatabaseSync } from 'node:sqlite';
import { allPreinstalledProcedureDefinitions, BASELINE_PROCEDURE_ID, FACTUAL_CLAIM_PROCEDURE_ID } from './preinstalled.js';
import { readProcedurePlanDocument, readProcedurePlanPin, resolveProcedureDefinition } from './definition-store.js';

/** The kind executor a pre-installed version names by its identity alone. */
export function preinstalledExecutorKind(procedureId: string): string {
  if (procedureId === BASELINE_PROCEDURE_ID) return 'baseline-manuscript-analysis';
  if (procedureId === FACTUAL_CLAIM_PROCEDURE_ID || procedureId === 'ai7-procedure/review-factual-review') return 'factual-review';
  return procedureId.startsWith('ai7-procedure/review-') ? `editorial-review/${procedureId.slice('ai7-procedure/review-'.length)}`
    : procedureId.slice('ai7-procedure/'.length);
}

export interface CompositeMember {
  readonly member: ProcedureMemberDefinition;
  readonly executorKind: string;
  /** The member's own version, unchanged: what its executor runs under. */
  readonly executor: ProcedureDefinitionPin;
  /** That version's stages carrying the composite's exemptions and shares, and the composite's instruction. */
  readonly view: ProcedureDefinitionDocument;
}

/**
 * A composite version's members (Issue #1173), each checked against the immutable pre-installed version it names: the same stage
 * types and fixed contracts in the same order, one member per executor, and the composite's last stage the Run's report.
 */
export function compositeMembers(document: ProcedureDefinitionDocument): readonly CompositeMember[] {
  requireAnalysis(document.members !== undefined && document.members.length > 0, 'PROCEDURE_RECORD_INVALID', '这个工序不是组合工序。');
  let offset = 0;
  const members = document.members.map((member): CompositeMember => {
    const source = allPreinstalledProcedureDefinitions().find((entry) => entry.id === member.procedureId && entry.version === member.version);
    requireAnalysis(source !== undefined && source.members === undefined && sha256Hex(canonicalJson(source)) === member.digest && Number.isSafeInteger(member.stageCount) &&
      member.stageCount >= 1, 'PROCEDURE_RECORD_INVALID', '组合工序的成员版本不可用。');
    const own = document.stages.slice(offset, offset + member.stageCount);
    offset += member.stageCount;
    requireAnalysis(own.length === member.stageCount && own.every((stage, index) => {
      const { exemptionRules: _rules, budgetShare: _share, ...fixed } = stage;
      const { exemptionRules: _sourceRules, budgetShare: _sourceShare, ...expected } = source.stages[index] ?? stage;
      return source.stages[index] !== undefined && canonicalJson(fixed) === canonicalJson(expected);
    }), 'PROCEDURE_RECORD_INVALID', '组合工序的阶段与成员版本不一致。');
    const view = { ...source, editorInstruction: document.editorInstruction, stages: source.stages.map((stage, index) =>
      index < own.length ? { ...stage, exemptionRules: own[index]!.exemptionRules, budgetShare: own[index]!.budgetShare } : stage) };
    return { member, executorKind: preinstalledExecutorKind(member.procedureId),
      executor: { procedureId: member.procedureId, version: member.version, digest: member.digest }, view };
  });
  requireAnalysis(offset === document.stages.length - 1 && document.stages.at(-1)?.stageType === 'derived-report' &&
    new Set(members.map((entry) => entry.executorKind)).size === members.length, 'PROCEDURE_RECORD_INVALID', '组合工序的成员结构无效。');
  return members;
}

/**
 * What one kind's Task applies of a pinned version: the version itself, or — for a composite — its member's view, attributed to
 * the composite pin, while the executor keeps the member's own version and therefore its existing contract.
 */
export function procedureForKind(document: ProcedureDefinitionDocument, pin: ProcedureDefinitionPin, kind: string): {
  readonly document: ProcedureDefinitionDocument; readonly pin: ProcedureDefinitionPin; readonly executor: ProcedureDefinitionPin;
} {
  if (document.members === undefined) return { document, pin, executor: pin };
  const member = compositeMembers(document).find((entry) => entry.executorKind === kind);
  requireAnalysis(member !== undefined, 'PROCEDURE_MEMBER_ABSENT', `工序《${document.title}》没有这一类任务。`);
  return { document: member.view, pin, executor: member.executor };
}

/** {@link procedureForKind} of a stored version; the pin must still name exactly that version. */
export function resolveProcedureForKind(db: DatabaseSync, pin: ProcedureDefinitionPin, kind: string): ReturnType<typeof procedureForKind> {
  const resolved = resolveProcedureDefinition(db, pin.procedureId, pin.version);
  requireAnalysis(resolved.pin.digest === pin.digest, 'PROCEDURE_VERSION_MOVED', '工序版本已变化，请重新选择。');
  return procedureForKind(resolved.document, pin, kind);
}

/** What a Plan's procedure snapshot gives one kind's Task, or `null` for a Plan that pins none. */
export function readProcedurePlanView(db: DatabaseSync, envelopeDigest: string, kind: string): ReturnType<typeof procedureForKind> | null {
  const pin = readProcedurePlanPin(db, envelopeDigest);
  return pin === null ? null : procedureForKind(readProcedurePlanDocument(db, envelopeDigest)!, pin, kind);
}
