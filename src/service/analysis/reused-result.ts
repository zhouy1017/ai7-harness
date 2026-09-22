import type { AnalysisSourceRangeProjection, CoverageManifestUnitProjection } from '../../shared/protocol.js';
import type { BaselineUnitResult } from './contract.js';
import { ExecutionAdmissionError } from './execution-error.js';

/**
 * Remap the source ranges of a reused predecessor result onto the new unit: the i-th own block and
 * the i-th overlap block of the predecessor unit correspond to the same positions of the new unit
 * because the compatibility key proved their content digests equal in order. Identities usually
 * coincide; when they differ the remap keeps `回到稿件范围` pointing at the block that carries the
 * same content in the current revision.
 *
 * This is the baseline kind's remap, and only the baseline kind's: its unit results cite blocks by
 * identity. A kind whose results cite a block by its position in the unit message — the factual kind,
 * every review category — carries a reused result across unchanged, because the same key that proves
 * the digests equal in order proves the positions equal too. Each kind states which it is through
 * `AnalysisKindDefinition.remapReusedResult`.
 */
export function remapReusedResult(
  result: BaselineUnitResult,
  predecessorUnit: CoverageManifestUnitProjection,
  newUnit: CoverageManifestUnitProjection,
): BaselineUnitResult {
  const from = [...predecessorUnit.blockIds, ...predecessorUnit.overlapBlockIds];
  const to = [...newUnit.blockIds, ...newUnit.overlapBlockIds];
  if (from.length !== to.length) throw new ExecutionAdmissionError('EXECUTION_LINEAGE_INVALID', '复用单元与前一单元的内容块数量不一致。');
  const mapping = new Map(from.map((blockId, index) => [blockId, to[index]!] as const));
  const ranges = (list: ReadonlyArray<AnalysisSourceRangeProjection>): AnalysisSourceRangeProjection[] => list.map((range) => {
    const blockId = mapping.get(range.blockId);
    if (blockId === undefined) throw new ExecutionAdmissionError('EXECUTION_LINEAGE_INVALID', '复用单元的来源范围引用了前一单元之外的内容块。');
    return { blockId, fromGrapheme: range.fromGrapheme, toGrapheme: range.toGrapheme };
  });
  return {
    schema: result.schema,
    unitOrdinal: newUnit.ordinal,
    synopsis: result.synopsis,
    entities: result.entities.map((entity) => ({ ...entity, aliases: [...entity.aliases], sourceRanges: ranges(entity.sourceRanges) })),
    events: result.events.map((event) => ({ ...event, participants: [...event.participants], sourceRanges: ranges(event.sourceRanges) })),
    relationships: result.relationships.map((relationship) => ({ ...relationship, sourceRanges: ranges(relationship.sourceRanges) })),
    settingClaims: result.settingClaims.map((claim) => ({ ...claim, sourceRanges: ranges(claim.sourceRanges) })),
    conflicts: result.conflicts.map((note) => ({ ...note, sourceRanges: ranges(note.sourceRanges) })),
    unresolved: result.unresolved.map((note) => ({ ...note, sourceRanges: ranges(note.sourceRanges) })),
    confidence: result.confidence,
  };
}

/**
 * The remap of a kind whose unit results name a block by its 1-based position in the unit message.
 * A reused unit's message lists the same number of overlap and own blocks in the same order — that is
 * what the compatibility key proves — so every position still names the block with the same content,
 * and only the unit ordinal the result states moves. A count that differs is a lineage the plan could
 * not have derived, and is refused exactly as the baseline remap refuses it.
 */
export function carryPositionalResult<TResult extends { readonly unitOrdinal: number }>(
  result: TResult,
  predecessorUnit: CoverageManifestUnitProjection,
  newUnit: CoverageManifestUnitProjection,
): TResult {
  if (predecessorUnit.blockIds.length !== newUnit.blockIds.length || predecessorUnit.overlapBlockIds.length !== newUnit.overlapBlockIds.length) {
    throw new ExecutionAdmissionError('EXECUTION_LINEAGE_INVALID', '复用单元与前一单元的内容块数量不一致。');
  }
  return { ...result, unitOrdinal: newUnit.ordinal };
}
