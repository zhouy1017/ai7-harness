import type {
  AnalysisAssuranceAxis,
  AnalysisConflictProjection,
  AnalysisCoverageAxis,
  AnalysisCrossUnitFindingProjection,
  AnalysisCrossUnitReductionProjection,
  AnalysisEntityProjection,
  AnalysisEventProjection,
  AnalysisGapProjection,
  AnalysisReducerClosureAxis,
  AnalysisReducerStageProjection,
  AnalysisRelationshipProjection,
  AnalysisSectionProjection,
  AnalysisSettingClaimProjection,
  AnalysisSourceRangeProjection,
  AnalysisSynthesisProjection,
  AnalysisUnresolvedProjection,
  CoverageManifestProjection,
} from '../../shared/protocol.js';
import type { BaselineUnitResult } from './contract.js';
import type { CrossUnitFinding } from './cross-unit-contract.js';

/**
 * Typed reducers over Analysis Unit results. Section-level and Book-level reduction preserve unit
 * lineage, gaps, and conflicts; a deterministic cross-unit contradiction/continuity pass runs before
 * the final synthesis; no reducer manufactures certainty — a divergence is reported as an unresolved
 * conflict, never resolved by choosing a side.
 *
 * Since Issue #274 the deterministic pass is a pre-filter for one further stage: the model-driven
 * cross-unit reduction (ADR 0066), whose outcome the execution owner hands in. Its findings enter the
 * Result Set beside the deterministic conflicts with lineage to every unit they cite; they never
 * modify a unit result, never merge into the conflict list, and never resolve a side.
 */
/** One unit that closed, carrying whichever typed result its analysis kind's contract produced. */
export interface ClosedUnitOutcome<TResult> {
  readonly unitOrdinal: number;
  readonly state: 'closed';
  readonly result: TResult;
}

/** One unit that did not close. Identical for every analysis kind: a gap is a gap. */
export interface GapUnitOutcome {
  readonly unitOrdinal: number;
  readonly state: 'gap';
  readonly code: AnalysisGapProjection['code'];
  readonly reason: string;
}

export type UnitOutcome = ClosedUnitOutcome<BaselineUnitResult> | GapUnitOutcome;

/**
 * Every unit of the manifest in ordinal order, with a unit the Run never reached recorded as an exact
 * `not-attempted` gap. Shared by every analysis kind: which units a revision covers is a fact about
 * the Coverage Manifest and the Run, not about the contract the units were read under.
 */
export function orderUnitOutcomes<TResult>(
  manifest: CoverageManifestProjection,
  outcomes: ReadonlyArray<ClosedUnitOutcome<TResult> | GapUnitOutcome>,
): Array<ClosedUnitOutcome<TResult> | GapUnitOutcome> {
  const byOrdinal = new Map(outcomes.map((outcome) => [outcome.unitOrdinal, outcome] as const));
  return manifest.units.map((unit) => byOrdinal.get(unit.ordinal) ?? {
    unitOrdinal: unit.ordinal,
    state: 'gap',
    code: 'not-attempted',
    reason: '该单元未进入执行。',
  });
}

/** The exact gaps of an ordered outcome list, each carrying the manifest positions of its unit. */
export function unitGaps<TResult>(
  manifest: CoverageManifestProjection,
  ordered: ReadonlyArray<ClosedUnitOutcome<TResult> | GapUnitOutcome>,
): AnalysisGapProjection[] {
  return ordered
    .filter((outcome): outcome is GapUnitOutcome => outcome.state === 'gap')
    .map((outcome) => {
      const unit = manifest.units[outcome.unitOrdinal - 1]!;
      return {
        unitOrdinal: outcome.unitOrdinal,
        code: outcome.code,
        reason: outcome.reason,
        startPosition: unit.startPosition,
        endPosition: unit.endPosition,
        blockIds: [...unit.blockIds],
      };
    });
}

/** The coverage axis, worded identically for every analysis kind: units closed, reused, and missing. */
export function coverageAxis(counts: { unitsTotal: number; unitsClosed: number; unitsReused: number; gapCount: number }): AnalysisCoverageAxis {
  const reuseNote = counts.unitsReused === 0 ? '' : ` · 复用 ${counts.unitsReused} 单元`;
  return {
    axis: 'coverage',
    state: counts.gapCount === 0 ? 'complete' : 'partial',
    label: counts.gapCount === 0
      ? `覆盖：完整 · ${counts.unitsClosed}/${counts.unitsTotal} 单元${reuseNote}`
      : `覆盖：部分 · ${counts.unitsClosed}/${counts.unitsTotal} 单元 · ${counts.gapCount} 处缺口${reuseNote}`,
    unitsTotal: counts.unitsTotal,
    unitsClosed: counts.unitsClosed,
    unitsReused: counts.unitsReused,
    gapCount: counts.gapCount,
  };
}

/**
 * Why a cross-unit reduction did not close. The three the transport can produce are the unit loop's
 * own codes; `policy-bounded` and `run-budget-ceiling-reached` are the two the reduction adds,
 * because it is the only step whose dispatch a launch policy or a spent ceiling can refuse on its own.
 */
export type CrossUnitGapCode =
  | 'adapter-failure'
  | 'contract-invalid'
  | 'interrupted'
  | 'egress-refused'
  | 'policy-bounded'
  | 'run-budget-ceiling-reached';

/** What the reduction did, as the execution owner observed it. `not-run` is fewer than two closed units. */
export type CrossUnitOutcome =
  | {
      readonly state: 'closed';
      readonly findings: ReadonlyArray<CrossUnitFinding>;
      readonly requestDigest: string;
      readonly usage: { readonly inputTokens: number; readonly outputTokens: number } | null;
    }
  | { readonly state: 'gap'; readonly code: CrossUnitGapCode; readonly reason: string; readonly requestDigest: string }
  | { readonly state: 'not-run'; readonly reason: string };

/** The outcome of a reduction that was never asked for: the default for every caller without one. */
export const CROSS_UNIT_NOT_RUN: Extract<CrossUnitOutcome, { state: 'not-run' }> = {
  state: 'not-run',
  reason: '已闭合单元少于两个，跨单元归纳未发起。',
};

export interface BaselineReduction {
  readonly coverage: AnalysisCoverageAxis;
  readonly reducerClosure: AnalysisReducerClosureAxis;
  readonly assurance: AnalysisAssuranceAxis;
  readonly sections: ReadonlyArray<AnalysisSectionProjection>;
  readonly synthesis: AnalysisSynthesisProjection;
  readonly gaps: ReadonlyArray<AnalysisGapProjection>;
  readonly conflicts: ReadonlyArray<AnalysisConflictProjection>;
  /** The model-driven findings, each with lineage to every unit it cites; empty unless the reduction closed. */
  readonly crossUnitFindings: ReadonlyArray<AnalysisCrossUnitFindingProjection>;
  readonly crossUnitReduction: AnalysisCrossUnitReductionProjection;
}

export const ASSURANCE_STATEMENT = '仅为模型输出的结构化归纳；不构成事实判定、编辑评审或稿件变更。' as const;

function normalize(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase('en-US');
}

function rangeKey(range: AnalysisSourceRangeProjection): string {
  return `${range.blockId}:${range.fromGrapheme ?? ''}:${range.toGrapheme ?? ''}`;
}

function mergeRanges(
  into: AnalysisSourceRangeProjection[],
  ranges: ReadonlyArray<AnalysisSourceRangeProjection>,
  seen: Set<string>,
): void {
  for (const range of ranges) {
    const key = rangeKey(range);
    if (seen.has(key)) continue;
    seen.add(key);
    into.push({ blockId: range.blockId, fromGrapheme: range.fromGrapheme, toGrapheme: range.toGrapheme });
  }
}

function sortedUnique(values: Iterable<number>): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

interface EntityAccumulator {
  projection: {
    name: string;
    kind: AnalysisEntityProjection['kind'];
    aliases: string[];
    note: string | null;
    sourceRanges: AnalysisSourceRangeProjection[];
    unitOrdinals: number[];
  };
  aliasKeys: Set<string>;
  rangeKeys: Set<string>;
}

function mergeEntities(closed: ReadonlyArray<Extract<UnitOutcome, { state: 'closed' }>>): AnalysisEntityProjection[] {
  const byName = new Map<string, EntityAccumulator>();
  for (const outcome of closed) {
    for (const entity of outcome.result.entities) {
      const key = normalize(entity.name);
      let accumulator = byName.get(key);
      if (accumulator === undefined) {
        accumulator = {
          projection: { name: entity.name, kind: entity.kind, aliases: [], note: null, sourceRanges: [], unitOrdinals: [] },
          aliasKeys: new Set(),
          rangeKeys: new Set(),
        };
        byName.set(key, accumulator);
      }
      for (const alias of entity.aliases) {
        const aliasKey = normalize(alias);
        if (aliasKey === key || accumulator.aliasKeys.has(aliasKey)) continue;
        accumulator.aliasKeys.add(aliasKey);
        accumulator.projection.aliases.push(alias);
      }
      accumulator.projection.note ??= entity.note;
      mergeRanges(accumulator.projection.sourceRanges, entity.sourceRanges, accumulator.rangeKeys);
      accumulator.projection.unitOrdinals.push(outcome.unitOrdinal);
    }
  }
  return Array.from(byName.values()).map((accumulator) => ({
    ...accumulator.projection,
    unitOrdinals: sortedUnique(accumulator.projection.unitOrdinals),
  }));
}

function collectEvents(closed: ReadonlyArray<Extract<UnitOutcome, { state: 'closed' }>>): AnalysisEventProjection[] {
  const events: AnalysisEventProjection[] = [];
  for (const outcome of closed) {
    for (const event of [...outcome.result.events].sort((left, right) => left.ordinal - right.ordinal)) {
      events.push({
        unitOrdinal: outcome.unitOrdinal,
        ordinal: event.ordinal,
        summary: event.summary,
        chronology: event.chronology,
        participants: [...event.participants],
        sourceRanges: event.sourceRanges.map((range) => ({ ...range })),
      });
    }
  }
  return events;
}

function mergeRelationships(closed: ReadonlyArray<Extract<UnitOutcome, { state: 'closed' }>>): AnalysisRelationshipProjection[] {
  const byKey = new Map<string, { projection: { subject: string; object: string; relation: string; sourceRanges: AnalysisSourceRangeProjection[]; unitOrdinals: number[] }; rangeKeys: Set<string> }>();
  for (const outcome of closed) {
    for (const relationship of outcome.result.relationships) {
      const key = `${normalize(relationship.subject)}→${normalize(relationship.relation)}→${normalize(relationship.object)}`;
      let entry = byKey.get(key);
      if (entry === undefined) {
        entry = {
          projection: { subject: relationship.subject, object: relationship.object, relation: relationship.relation, sourceRanges: [], unitOrdinals: [] },
          rangeKeys: new Set(),
        };
        byKey.set(key, entry);
      }
      mergeRanges(entry.projection.sourceRanges, relationship.sourceRanges, entry.rangeKeys);
      entry.projection.unitOrdinals.push(outcome.unitOrdinal);
    }
  }
  return Array.from(byKey.values()).map((entry) => ({ ...entry.projection, unitOrdinals: sortedUnique(entry.projection.unitOrdinals) }));
}

function collectClaims(closed: ReadonlyArray<Extract<UnitOutcome, { state: 'closed' }>>): AnalysisSettingClaimProjection[] {
  const claims: AnalysisSettingClaimProjection[] = [];
  for (const outcome of closed) {
    for (const claim of outcome.result.settingClaims) {
      claims.push({
        unitOrdinal: outcome.unitOrdinal,
        subject: claim.subject,
        claim: claim.claim,
        sourceRanges: claim.sourceRanges.map((range) => ({ ...range })),
      });
    }
  }
  return claims;
}

function collectNotes(
  closed: ReadonlyArray<Extract<UnitOutcome, { state: 'closed' }>>,
  select: (result: BaselineUnitResult) => ReadonlyArray<{ description: string; sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection> }>,
): AnalysisUnresolvedProjection[] {
  const notes: AnalysisUnresolvedProjection[] = [];
  for (const outcome of closed) {
    for (const note of select(outcome.result)) {
      notes.push({ unitOrdinal: outcome.unitOrdinal, description: note.description, sourceRanges: note.sourceRanges.map((range) => ({ ...range })) });
    }
  }
  return notes;
}

function unitReportedConflicts(closed: ReadonlyArray<Extract<UnitOutcome, { state: 'closed' }>>): AnalysisConflictProjection[] {
  return collectNotes(closed, (result) => result.conflicts).map((note) => ({
    kind: 'unit-reported' as const,
    description: note.description,
    sourceRanges: note.sourceRanges,
    unitOrdinals: [note.unitOrdinal],
  }));
}

/**
 * Deterministic cross-unit contradiction/continuity pass. It reports divergences it can detect
 * structurally — one alias claimed by two different entities, one entity named with two kinds, one
 * setting subject given two different claims — and never decides which side is right.
 */
export function detectCrossUnitConflicts(closed: ReadonlyArray<Extract<UnitOutcome, { state: 'closed' }>>): AnalysisConflictProjection[] {
  const conflicts: AnalysisConflictProjection[] = [];
  const aliasOwners = new Map<string, Array<{ name: string; unitOrdinal: number; ranges: ReadonlyArray<AnalysisSourceRangeProjection>; alias: string }>>();
  const entityKinds = new Map<string, Array<{ name: string; kind: string; unitOrdinal: number; ranges: ReadonlyArray<AnalysisSourceRangeProjection> }>>();
  const claimsBySubject = new Map<string, Array<{ subject: string; claim: string; unitOrdinal: number; ranges: ReadonlyArray<AnalysisSourceRangeProjection> }>>();
  for (const outcome of closed) {
    for (const entity of outcome.result.entities) {
      const nameKey = normalize(entity.name);
      for (const alias of entity.aliases) {
        const aliasKey = normalize(alias);
        if (aliasKey === nameKey) continue;
        const owners = aliasOwners.get(aliasKey) ?? [];
        owners.push({ name: entity.name, unitOrdinal: outcome.unitOrdinal, ranges: entity.sourceRanges, alias });
        aliasOwners.set(aliasKey, owners);
      }
      const kinds = entityKinds.get(nameKey) ?? [];
      kinds.push({ name: entity.name, kind: entity.kind, unitOrdinal: outcome.unitOrdinal, ranges: entity.sourceRanges });
      entityKinds.set(nameKey, kinds);
    }
    for (const claim of outcome.result.settingClaims) {
      const subjectKey = normalize(claim.subject);
      const claims = claimsBySubject.get(subjectKey) ?? [];
      claims.push({ subject: claim.subject, claim: claim.claim, unitOrdinal: outcome.unitOrdinal, ranges: claim.sourceRanges });
      claimsBySubject.set(subjectKey, claims);
    }
  }
  const emit = (
    kind: AnalysisConflictProjection['kind'],
    description: string,
    parts: ReadonlyArray<{ unitOrdinal: number; ranges: ReadonlyArray<AnalysisSourceRangeProjection> }>,
  ): void => {
    const sourceRanges: AnalysisSourceRangeProjection[] = [];
    const seen = new Set<string>();
    for (const part of parts) mergeRanges(sourceRanges, part.ranges, seen);
    conflicts.push({ kind, description, sourceRanges, unitOrdinals: sortedUnique(parts.map((part) => part.unitOrdinal)) });
  };
  for (const owners of aliasOwners.values()) {
    const names = Array.from(new Set(owners.map((owner) => normalize(owner.name))));
    if (names.length < 2) continue;
    const displayNames = Array.from(new Set(owners.map((owner) => owner.name)));
    emit('alias-collision', `别名“${owners[0]!.alias}”同时归于不同实体：${displayNames.join('、')}。`, owners);
  }
  for (const kinds of entityKinds.values()) {
    const distinct = Array.from(new Set(kinds.map((entry) => entry.kind)));
    if (distinct.length < 2) continue;
    emit('entity-kind-divergence', `实体“${kinds[0]!.name}”在不同单元中被归为不同类别：${distinct.join('、')}。`, kinds);
  }
  for (const claims of claimsBySubject.values()) {
    const distinct = Array.from(new Set(claims.map((entry) => normalize(entry.claim))));
    if (distinct.length < 2) continue;
    emit('setting-claim-divergence', `设定主体“${claims[0]!.subject}”在不同单元中有不同声明：${claims.map((entry) => `单元 ${entry.unitOrdinal}「${entry.claim}」`).join('；')}。`, claims);
  }
  return conflicts;
}

function stage(
  name: AnalysisReducerStageProjection['stage'],
  inputCount: number,
  gaps: number,
): AnalysisReducerStageProjection {
  return { stage: name, state: gaps > 0 ? 'closed-with-gaps' : 'closed', inputCount };
}

/** The stage state of the model-driven reduction: what it did, not how many gaps the units carried. */
function crossUnitStageState(crossUnit: CrossUnitOutcome): AnalysisReducerStageProjection['state'] {
  if (crossUnit.state === 'not-run') return 'not-run';
  return crossUnit.state === 'gap' ? 'closed-with-gaps' : 'closed';
}

/**
 * The findings as the Result Set carries them: the contract's typed finding plus the lineage the
 * revision is read by — every unit it cites, sorted and deduplicated from its own sides. Nothing is
 * merged, reordered, or resolved; the projection adds lineage and takes nothing away.
 */
function crossUnitFindingProjections(findings: ReadonlyArray<CrossUnitFinding>): AnalysisCrossUnitFindingProjection[] {
  return findings.map((finding) => ({
    kind: finding.kind,
    description: finding.description,
    sides: finding.sides.map((side) => ({ unitOrdinal: side.unitOrdinal, sourceRanges: side.sourceRanges.map((range) => ({ ...range })) })),
    unitOrdinals: sortedUnique(finding.sides.map((side) => side.unitOrdinal)),
    confidence: finding.confidence,
  }));
}

/**
 * Reduce the complete unit set of one revision. `reusedUnitOrdinals` names the closed units whose
 * result was copied from the predecessor revision by lineage; they count as closed coverage and
 * their reuse is disclosed in the coverage axis, never hidden. `crossUnit` is the model-driven
 * reduction's outcome, which the execution owner observed inside the same Run envelope.
 */
export function reduceBaselineAnalysis(
  manifest: CoverageManifestProjection,
  outcomes: ReadonlyArray<UnitOutcome>,
  reusedUnitOrdinals: ReadonlySet<number> = new Set(),
  crossUnit: CrossUnitOutcome = CROSS_UNIT_NOT_RUN,
): BaselineReduction {
  const units = manifest.units;
  const ordered = orderUnitOutcomes(manifest, outcomes);
  const closed = ordered.filter((outcome): outcome is Extract<UnitOutcome, { state: 'closed' }> => outcome.state === 'closed');
  const gaps = unitGaps(manifest, ordered);

  const sections: AnalysisSectionProjection[] = [];
  const sectionOrdinals = sortedUnique(units.map((unit) => unit.sectionOrdinal));
  for (const sectionOrdinal of sectionOrdinals) {
    const sectionUnits = units.filter((unit) => unit.sectionOrdinal === sectionOrdinal);
    const sectionClosed = closed.filter((outcome) => sectionUnits.some((unit) => unit.ordinal === outcome.unitOrdinal));
    const first = sectionUnits[0]!;
    sections.push({
      sectionOrdinal,
      headingText: first.headingText,
      headingLevel: first.headingLevel,
      unitOrdinals: sectionUnits.map((unit) => unit.ordinal),
      closedUnitOrdinals: sectionClosed.map((outcome) => outcome.unitOrdinal),
      gapUnitOrdinals: sectionUnits.map((unit) => unit.ordinal).filter((ordinal) => !sectionClosed.some((outcome) => outcome.unitOrdinal === ordinal)),
      synopsis: sectionClosed.map((outcome) => outcome.result.synopsis).join('\n'),
      entities: mergeEntities(sectionClosed),
      events: collectEvents(sectionClosed),
      relationships: mergeRelationships(sectionClosed),
      settingClaims: collectClaims(sectionClosed),
      conflicts: unitReportedConflicts(sectionClosed),
      unresolved: collectNotes(sectionClosed, (result) => result.unresolved),
    });
  }

  const deterministicConflicts = detectCrossUnitConflicts(closed);
  const conflicts: AnalysisConflictProjection[] = [...unitReportedConflicts(closed), ...deterministicConflicts];
  const synthesis: AnalysisSynthesisProjection = {
    synopsis: sections.map((section) => section.synopsis).filter((text) => text.length > 0).join('\n'),
    entities: mergeEntities(closed),
    events: collectEvents(closed),
    relationships: mergeRelationships(closed),
    settingClaims: collectClaims(closed),
    conflicts,
    unresolved: collectNotes(closed, (result) => result.unresolved),
  };

  const crossUnitFindings = crossUnitFindingProjections(crossUnit.state === 'closed' ? crossUnit.findings : []);
  const crossUnitReduction: AnalysisCrossUnitReductionProjection = {
    state: crossUnit.state,
    reason: crossUnit.state === 'closed' ? null : crossUnit.reason,
    requestDigest: crossUnit.state === 'not-run' ? null : crossUnit.requestDigest,
    usage: crossUnit.state === 'closed' ? crossUnit.usage : null,
    findingCount: crossUnitFindings.length,
  };
  const stages: AnalysisReducerStageProjection[] = [
    stage('unit-validation', ordered.length, gaps.length),
    stage('section-reduction', sections.length, sections.filter((section) => section.gapUnitOrdinals.length > 0).length),
    stage('contradiction-continuity', closed.length, gaps.length),
    { stage: 'cross-unit-reduction', state: crossUnitStageState(crossUnit), inputCount: closed.length },
    stage('book-synthesis', sections.length, gaps.length),
  ];
  const unitsReused = closed.filter((outcome) => reusedUnitOrdinals.has(outcome.unitOrdinal)).length;
  const coverage = coverageAxis({ unitsTotal: units.length, unitsClosed: closed.length, unitsReused, gapCount: gaps.length });
  // A stage that carried gaps through qualifies the axis; a stage that never ran does not, because
  // `not-run` reports that there was nothing for it to close, not that something was lost.
  const stagesCarriedGaps = stages.some((entry) => entry.state === 'closed-with-gaps');
  const reducerClosure: AnalysisReducerClosureAxis = {
    axis: 'reducer-closure',
    state: stagesCarriedGaps ? 'closed-with-gaps' : 'closed',
    label: !stagesCarriedGaps
      ? '归约/综合闭合：全部阶段已闭合'
      : gaps.length > 0
        ? `归约/综合闭合：已闭合 · 保留 ${gaps.length} 处缺口`
        : '归约/综合闭合：已闭合 · 跨单元归纳保留 1 处缺口',
    stages,
  };
  const lowConfidence = closed.filter((outcome) => outcome.result.confidence === 'low').length;
  const unresolvedItemCount = synthesis.unresolved.length;
  const assuranceState: AnalysisAssuranceAxis['state'] = lowConfidence > 0
    ? 'limited'
    : conflicts.length > 0 ? 'qualified-with-open-conflicts' : 'qualified';
  const assurance: AnalysisAssuranceAxis = {
    axis: 'assurance',
    state: assuranceState,
    label: assuranceState === 'qualified'
      ? '语义/证据保证：合格 · 无未解决冲突'
      : assuranceState === 'qualified-with-open-conflicts'
        ? `语义/证据保证：合格 · ${conflicts.length} 处未解决冲突`
        : `语义/证据保证：有限 · ${lowConfidence} 个低置信单元 · ${conflicts.length} 处未解决冲突`,
    unresolvedConflictCount: conflicts.length,
    unresolvedItemCount,
    lowConfidenceUnitCount: lowConfidence,
    // Disclosed beside the deterministic count, never folded into it: the axis states stay exactly the
    // readings they were, and a model-driven finding is evidence for the editor rather than a verdict.
    crossUnitFindingCount: crossUnitFindings.length,
    statement: ASSURANCE_STATEMENT,
  };
  return { coverage, reducerClosure, assurance, sections, synthesis, gaps, conflicts, crossUnitFindings, crossUnitReduction };
}
