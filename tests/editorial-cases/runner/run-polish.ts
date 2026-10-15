import type { EditorialStore } from '../../../src/service/store.js';
import { FastRoleExecutionOwner } from '../../../src/service/fast-role/fast-role-execution.js';
import { FastRoleRequests, polishWordsOf } from '../../../src/service/fast-role/fast-role-suggestions.js';
import {
  EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST,
  editorialPolishContextDigest,
  editorialPolishRequestDigest,
  editorialPolishSelectionDigest,
} from '../../../src/service/fast-role/polish-contract.js';
import type { ResolvedModelFixture } from '../../../src/service/provider/model-fixture.js';
import { graphemesOf } from '../../../src/shared/mark-anchor.js';
import type { EditorialCase } from './case-file.js';
import type { ImportedBook } from './session.js';
import { applyAndReverse, type EditingEffort, type FindingCounts, scoreTextFindings, type TextResolution } from './text-cases.js';

/**
 * 润色这段 cases: the case's sentence selected exactly as an editor selects it, polished on the product's deterministic route,
 * each 修改建议 the answer produced scored, decided, applied and reversed like a review finding.
 */

export interface PolishObservation {
  readonly outcome: { state: string; outcomeUnknown: boolean };
  readonly findings: FindingCounts;
  readonly concerns: { met: ReadonlyArray<string>; missed: ReadonlyArray<string> };
  readonly checks: { triggered: ReadonlyArray<string> };
  readonly effort: EditingEffort;
  /** The request key the fixture answers this selection by: only the entries under it belong to the case. */
  readonly requestDigest: string;
}

export async function runPolishCase(
  store: EditorialStore,
  fixture: ResolvedModelFixture,
  book: ImportedBook,
  testCase: EditorialCase,
  resolution: TextResolution,
): Promise<PolishObservation> {
  const { paragraph, start, end } = testCase.input.selection as { paragraph: number; start: string; end: string };
  const blockId = resolution.blocks.find((candidate) => candidate.position === paragraph)?.blockId;
  if (blockId === undefined) throw new Error('EDITORIAL_CASE/selection-paragraph-absent');
  const window = store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId });
  const block = window.blocks.find((candidate) => candidate.blockId === blockId)!;
  const at = block.text.indexOf(start);
  const stop = at < 0 ? -1 : block.text.indexOf(end, at);
  if (at < 0 || stop < 0) throw new Error('EDITORIAL_CASE/selection-words-absent');
  const fromGrapheme = graphemesOf(block.text.slice(0, at)).length;
  const toGrapheme = graphemesOf(block.text.slice(0, stop + end.length)).length;
  const selection = {
    manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId, baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence, blockId, baseBlockDigest: block.digest, fromGrapheme, toGrapheme,
    selectedText: graphemesOf(block.text).slice(fromGrapheme, toGrapheme).join(''),
  };
  const words = polishWordsOf(block.text, fromGrapheme, toGrapheme);
  const requestDigest = editorialPolishRequestDigest(EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST, editorialPolishSelectionDigest(words.text),
    editorialPolishContextDigest(words.before, words.after));
  const owner = new FastRoleExecutionOwner({ fixture, live: null });
  const requests = new FastRoleRequests(owner, store);
  const started = requests.polish(book.bookId, { selection });
  await requests.settled();
  const read = requests.inspect(book.bookId, started.taskId);
  if (read.kind !== 'editorial-polish') throw new Error('EDITORIAL_CASE/polish-projection-unexpected');
  const polish = read.polish;
  const positions = new Map(resolution.blocks.map((candidate) => [candidate.blockId, candidate.position]));
  const findings = polish.markIds.map((markId) => {
    const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
    return { key: markId, categoryId: 'polish', paragraph: positions.get(card.blockId) ?? null, from: card.fromGrapheme, to: card.toGrapheme,
      quote: card.pinnedText, replacement: card.suggestion?.proposedText ?? null, markId };
  });
  const scored = scoreTextFindings(findings, resolution);
  const effort = await applyAndReverse(store, book, scored, resolution, {
    resolveAnnotation: () => { throw new Error('EDITORIAL_CASE/polish-annotation'); },
    ignoreAnnotation: () => { throw new Error('EDITORIAL_CASE/polish-annotation'); },
  });
  return {
    outcome: { state: polish.state, outcomeUnknown: polish.outcomeUnknown },
    findings: { listed: polish.markIds.length + polish.withheld.length, located: polish.markIds.length, excluded: polish.withheld.length, ...scored.counts },
    concerns: scored.concerns,
    checks: scored.checks,
    effort,
    requestDigest,
  };
}
