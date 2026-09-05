import type {
  AnalysisAssuranceAxis,
  AnalysisConflictProjection,
  AnalysisCoverageAxis,
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

/**
 * Typed reducers over Analysis Unit results. Section-level and Book-level reduction preserve unit
 * lineage, gaps, and conflicts; a deterministic cross-unit contradiction/continuity pass runs before
 * the final synthesis; no reducer manufactures certainty — a divergence is reported as an unresolved
 * conflict, never resolved by choosing a side.
 */
export type UnitOutcome =
  | { readonly unitOrdinal: number; readonly state: 'closed'; readonly result: BaselineUnitResult }
  | { readonly unitOrdinal: number; readonly state: 'gap'; readonly code: AnalysisGapProjection['code']; readonly reason: string };

export interface BaselineReduction {
  readonly coverage: AnalysisCoverageAxis;
  readonly reducerClosure: AnalysisReducerClosureAxis;
  readonly assurance: AnalysisAssuranceAxis;
  readonly sections: ReadonlyArray<AnalysisSectionProjection>;
  readonly synthesis: AnalysisSynthesisProjection;
  readonly gaps: ReadonlyArray<AnalysisGapProjection>;
  readonly conflicts: ReadonlyArray<AnalysisConflictProjection>;
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

export function reduceBaselineAnalysis(
  manifest: CoverageManifestProjection,
  outcomes: ReadonlyArray<UnitOutcome>,
): BaselineReduction {
  const byOrdinal = new Map(outcomes.map((outcome) => [outcome.unitOrdinal, outcome] as const));
  const units = manifest.units;
  const ordered: UnitOutcome[] = units.map((unit) => byOrdinal.get(unit.ordinal) ?? {
    unitOrdinal: unit.ordinal,
    state: 'gap',
    code: 'not-attempted',
    reason: '该单元未进入执行。',
  });
  const closed = ordered.filter((outcome): outcome is Extract<UnitOutcome, { state: 'closed' }> => outcome.state === 'closed');
  const gaps: AnalysisGapProjection[] = ordered
    .filter((outcome): outcome is Extract<UnitOutcome, { state: 'gap' }> => outcome.state === 'gap')
    .map((outcome) => {
      const unit = units[outcome.unitOrdinal - 1]!;
      return {
        unitOrdinal: outcome.unitOrdinal,
        code: outcome.code,
        reason: outcome.reason,
        startPosition: unit.startPosition,
        endPosition: unit.endPosition,
        blockIds: [...unit.blockIds],
      };
    });

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

  const crossUnit = detectCrossUnitConflicts(closed);
  const conflicts: AnalysisConflictProjection[] = [...unitReportedConflicts(closed), ...crossUnit];
  const synthesis: AnalysisSynthesisProjection = {
    synopsis: sections.map((section) => section.synopsis).filter((text) => text.length > 0).join('\n'),
    entities: mergeEntities(closed),
    events: collectEvents(closed),
    relationships: mergeRelationships(closed),
    settingClaims: collectClaims(closed),
    conflicts,
    unresolved: collectNotes(closed, (result) => result.unresolved),
  };

  const stages: AnalysisReducerStageProjection[] = [
    stage('unit-validation', ordered.length, gaps.length),
    stage('section-reduction', sections.length, sections.filter((section) => section.gapUnitOrdinals.length > 0).length),
    stage('contradiction-continuity', closed.length, gaps.length),
    stage('book-synthesis', sections.length, gaps.length),
  ];
  const coverage: AnalysisCoverageAxis = {
    axis: 'coverage',
    state: gaps.length === 0 ? 'complete' : 'partial',
    label: gaps.length === 0
      ? `覆盖：完整 · ${closed.length}/${units.length} 单元`
      : `覆盖：部分 · ${closed.length}/${units.length} 单元 · ${gaps.length} 处缺口`,
    unitsTotal: units.length,
    unitsClosed: closed.length,
    gapCount: gaps.length,
  };
  const reducerClosure: AnalysisReducerClosureAxis = {
    axis: 'reducer-closure',
    state: stages.every((entry) => entry.state === 'closed') ? 'closed' : 'closed-with-gaps',
    label: stages.every((entry) => entry.state === 'closed')
      ? '归约/综合闭合：全部阶段已闭合'
      : `归约/综合闭合：已闭合 · 保留 ${gaps.length} 处缺口`,
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
    statement: ASSURANCE_STATEMENT,
  };
  return { coverage, reducerClosure, assurance, sections, synthesis, gaps, conflicts };
}
