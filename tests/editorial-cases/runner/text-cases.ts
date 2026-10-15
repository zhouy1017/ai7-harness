import { randomUUID } from 'node:crypto';
import type { EditorialStore } from '../../../src/service/store.js';
import type { ManifestBlockInput } from '../../../src/service/analysis/coverage-manifest.js';
import { generateSyntheticManuscript } from '../synthetic-manuscripts.mjs';
import type { EditorialCase } from './case-file.js';
import { type ImportedBook, workingBlocks } from './session.js';
import {
  classifyFinding,
  correctionInPlace,
  type EditorAction,
  type FindingVerdict,
  locateOnce,
  sha256Hex,
  simulatedEditor,
  type TextAnchor,
  type TextFinding,
} from './scoring.js';

/**
 * Text-anchored cases (review and 润色这段): the case's concerns and checks resolved against the imported Book, the findings
 * scored, the simulated editor's actions taken through the product's own mark and Apply commands, and every Apply reversed.
 */

export interface TextResolution {
  readonly concerns: ReadonlyArray<TextAnchor>;
  readonly checks: ReadonlyArray<TextAnchor>;
  readonly blocks: ReadonlyArray<ManifestBlockInput>;
}

export interface FindingCounts {
  listed: number;
  located: number;
  excluded: number;
  useful: number;
  precise: number;
  unclassified: number;
  falsePositives: number;
}

export interface EditingEffort {
  adopted: number;
  edited: number;
  rejected: number;
  left: number;
  applied: number;
  appliedCorrect: number;
  reversed: number;
  restoredExactly: boolean;
}

interface ScoredFinding {
  readonly finding: TextFinding;
  readonly verdict: FindingVerdict;
  readonly action: EditorAction;
}

/**
 * Resolve a case's text anchors. A `sample1` anchor names its words; a synthetic one names a generator defect or trap, whose
 * computed range must agree with where the words stand in the imported Book (the digest of the words is checked too), so a
 * drifted generator or importer refuses rather than scoring against the wrong place.
 */
export function resolveTextAnchors(store: EditorialStore, book: ImportedBook, testCase: EditorialCase): TextResolution {
  const blocks = workingBlocks(store, book);
  const synthetic = testCase.manuscript.source === 'synthetic' ? generateSyntheticManuscript(testCase.manuscript.id) : null;
  const blockText = (paragraph: number, label: string): string => {
    const block = blocks.find((candidate) => candidate.position === paragraph);
    if (block === undefined) throw new Error(`EDITORIAL_CASE/anchor-paragraph-absent: ${testCase.id}/${label}`);
    return block.text;
  };
  const concerns = testCase.expectedConcerns.map((concern): TextAnchor => {
    if (concern.defect !== undefined) {
      const defect = synthetic?.defects.find((candidate) => candidate.id === concern.defect);
      if (defect === undefined) throw new Error(`EDITORIAL_CASE/defect-unknown: ${testCase.id}/${concern.id}`);
      const text = blockText(defect.paragraph, concern.id);
      const words = [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text)].slice(defect.from, defect.to).map((part) => part.segment).join('');
      if (sha256Hex(words) !== defect.spanSha256) throw new Error(`EDITORIAL_CASE/defect-drifted: ${testCase.id}/${concern.id}`);
      return { id: concern.id, paragraph: defect.paragraph, from: defect.from, to: defect.to, words, corrections: defect.correction === null ? [] : [defect.correction], category: defect.category };
    }
    const range = locateOnce(blockText(concern.paragraph!, concern.id), concern.words!, `${testCase.id}/${concern.id}`);
    return { id: concern.id, paragraph: concern.paragraph!, ...range, words: concern.words!, corrections: concern.corrections ?? [], category: concern.category ?? null };
  });
  const checks = testCase.falsePositiveChecks.map((check): TextAnchor => {
    if (check.trap !== undefined) {
      const trap = synthetic?.traps.find((candidate) => candidate.id === check.trap);
      if (trap === undefined) throw new Error(`EDITORIAL_CASE/trap-unknown: ${testCase.id}/${check.id}`);
      return { id: check.id, paragraph: trap.paragraph, from: trap.from, to: trap.to, words: '', corrections: [], category: null };
    }
    const range = locateOnce(blockText(check.paragraph!, check.id), check.words!, `${testCase.id}/${check.id}`);
    return { id: check.id, paragraph: check.paragraph!, ...range, words: check.words!, corrections: [], category: null };
  });
  return { concerns, checks, blocks };
}

export function scoreTextFindings(findings: ReadonlyArray<TextFinding>, resolution: TextResolution): {
  scored: ReadonlyArray<ScoredFinding>;
  counts: Omit<FindingCounts, 'listed' | 'located' | 'excluded'>;
  concerns: { met: ReadonlyArray<string>; missed: ReadonlyArray<string> };
  checks: { triggered: ReadonlyArray<string> };
} {
  const scored = findings.map((finding) => {
    const verdict = classifyFinding(finding, resolution.concerns, resolution.checks);
    const block = resolution.blocks.find((candidate) => candidate.position === finding.paragraph);
    return { finding, verdict, action: simulatedEditor(finding, verdict, resolution.concerns, block?.text ?? '') };
  });
  const met = new Set(scored.flatMap(({ verdict }) => (verdict.kind === 'useful' ? [verdict.concernId] : [])));
  const triggered = new Set(scored.flatMap(({ verdict }) => (verdict.kind === 'false-positive' ? [verdict.checkId] : [])));
  return {
    scored,
    counts: {
      useful: scored.filter(({ verdict }) => verdict.kind === 'useful').length,
      precise: scored.filter(({ verdict }) => verdict.kind === 'useful' && verdict.precise).length,
      unclassified: scored.filter(({ verdict }) => verdict.kind === 'unclassified').length,
      falsePositives: scored.filter(({ verdict }) => verdict.kind === 'false-positive').length,
    },
    concerns: { met: resolution.concerns.filter((concern) => met.has(concern.id)).map((concern) => concern.id),
      missed: resolution.concerns.filter((concern) => !met.has(concern.id)).map((concern) => concern.id) },
    checks: { triggered: resolution.checks.filter((check) => triggered.has(check.id)).map((check) => check.id) },
  };
}

/**
 * Take the simulated editor's actions through the product: adopt or edit a 修改建议 with 采纳并应用 (`applyChangeSuggestion`), reject
 * one with a recorded decision, resolve or ignore a 批注; then check each Apply put a correction in place, reverse every Apply
 * newest first, and compare every block's digest with the state before the first Apply.
 */
export async function applyAndReverse(
  store: EditorialStore,
  book: ImportedBook,
  scoring: ReturnType<typeof scoreTextFindings>,
  resolution: TextResolution,
  annotations: { resolveAnnotation(finding: TextFinding): void; ignoreAnnotation(finding: TextFinding): void },
): Promise<EditingEffort> {
  const effort: EditingEffort = { adopted: 0, edited: 0, rejected: 0, left: 0, applied: 0, appliedCorrect: 0, reversed: 0, restoredExactly: true };
  const before = workingBlocks(store, book).map((block) => ({ blockId: block.blockId, digest: block.digest }));
  const binding = () => ({ manuscriptId: book.manuscriptId, branchId: book.branchId,
    windowStartBlockId: store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks[0]!.blockId });
  const applied: string[] = [];
  for (const { finding, verdict, action } of scoring.scored) {
    if (action.action === 'leave' || finding.markId === null) { effort.left += 1; continue; }
    if (action.action === 'reject') {
      effort.rejected += 1;
      if (finding.replacement === null) annotations.ignoreAnnotation(finding);
      else store.recordChangeSuggestionDecision({ ...binding(), markId: finding.markId, clientDecisionId: randomUUID(), disposition: 'rejected', editedText: null, reason: '编辑价值证据：误报' });
      continue;
    }
    if (action.action === 'adopt') effort.adopted += 1; else effort.edited += 1;
    if (finding.replacement === null) { annotations.resolveAnnotation(finding); continue; }
    const blockBefore = workingBlocks(store, book).find((block) => block.position === finding.paragraph)!.text;
    const result = await store.applyChangeSuggestion({ ...binding(), markId: finding.markId, clientEffectId: randomUUID(),
      interaction: action.action === 'adopt' ? 'accept-and-apply' : 'accept-edited-and-apply', editedText: action.action === 'edit' ? action.editedText : null, reason: null });
    if (result.application === null) continue;
    effort.applied += 1;
    applied.push(finding.markId);
    const blockAfter = workingBlocks(store, book).find((block) => block.position === finding.paragraph)!.text;
    const concern = verdict.kind === 'useful' ? resolution.concerns.find((candidate) => candidate.id === verdict.concernId) : undefined;
    if (concern !== undefined && correctionInPlace(concern, blockBefore, blockAfter)) effort.appliedCorrect += 1;
  }
  for (const markId of applied.reverse()) {
    const reversed = await store.reverseAppliedChangeSuggestion({ ...binding(), markId, clientEffectId: randomUUID() });
    if (reversed.application !== null) effort.reversed += 1;
  }
  const after = workingBlocks(store, book).map((block) => ({ blockId: block.blockId, digest: block.digest }));
  effort.restoredExactly = JSON.stringify(after) === JSON.stringify(before);
  return effort;
}
