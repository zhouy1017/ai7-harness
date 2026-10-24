import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  COMMENTS_REVISIONS_DETAIL,
  DOCX_PARSER_IDENTITY,
  DOCX_PARSER_IDENTITY_V2,
  REIMPORT_COMMENTS_REVISIONS_DETAIL,
  buildFidelityReport,
  deriveImportFidelityPlan,
  parseDocx,
  compileWordTrackedDocxBytes,
  reimportFidelityReport,
  withTextBoxDisposition,
  type DocumentSignals,
  type ParsedDocxBlock,
  type ParsedImportedMark,
} from '../../src/service/docx.js';
import {
  CROSS_PARAGRAPH_COMMENT_LINE,
  PARAGRAPH_DELETION_BODY,
  PARAGRAPH_MERGE_BODY,
  PARAGRAPH_SPLIT_BODY,
  commentReplyLine,
  moveBody,
  paragraphInsertionBody,
} from '../../src/service/docx-marks.js';
import {
  ADMITTED_BASELINE_DOCX,
  admittedSourcePath,
  composeRevisedDocx,
  sourceSpanText,
  type ComposedRevisedRequest,
  type SourceSpan,
} from '../support/composed-fixture.js';
import { buildSyntheticTrackedDocx } from '../support/synthetic-docx.js';
import { buildWordProfileRecipe, wordParagraphMoveBody } from '../fixtures/docx-fidelity/builder.js';
import { validateWordSampleCursor, wordSampleDetailDigest, wordTrackedSamples, type WordSampleDetailEntry } from '../../src/service/import-retention.js';
import classification from '../fixtures/docx-fidelity/classification.json' with { type: 'json' };

// Parser identity `ai7-docx-fflate-saxes/3` over composed documents (Issue #411): every word of every input is
// a span of exact `sample1`, and every author is a neutral name. Assertions compare digests, counts and
// positions, so a failure prints no excerpt's text.

const AUTHOR = '示例作者';
const OTHER = '另一位作者';
const SOURCE = ADMITTED_BASELINE_DOCX;
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

let sandbox: string;

describe('successor exact source correspondence (#1132)', () => {
  it('matches every additive technical recipe classification without changing the historical corpus pairs', () => {
    for (const recipe of ['replacement', 'paragraph-join', 'named-move', 'all-inserted', 'all-deleted', 'normalization'] as const) {
      const compiled = compileWordTrackedDocxBytes(buildWordProfileRecipe(recipe));
      if (compiled.kind !== 'ready') throw new Error(`expected supported technical recipe ${recipe}`);
      const expected = classification.wordTrackedProfile.recipes[recipe];
      expect(compiled.templates).toHaveLength(expected.samples);
      expect(compiled.readings.rejected.blocks.map((block) => block.text)).toEqual(expected.rejected);
      expect(compiled.readings.accepted.blocks.map((block) => block.text)).toEqual(expected.accepted);
    }
    expect(compileWordTrackedDocxBytes(buildWordProfileRecipe('ordinary')).kind).toBe('ordinary');
  });
  it('normalizes whole NFC/whitespace groups across atom boundaries and retains removed source spans', () => {
    const compiled = compileWordTrackedDocxBytes(buildWordProfileRecipe('normalization'));
    if (compiled.kind !== 'ready') throw new Error('expected supported graph');
    const block = compiled.readings.rejected.blocks[0]!;
    expect(block.text).toBe('é B');
    expect(block.groups.map((group) => group.normalizedText).join('')).toBe(block.text);
    const nfc = block.groups.find((group) => group.normalizedText === 'é')!;
    expect(nfc.fragments).toHaveLength(2);
    expect([nfc.fromGrapheme, nfc.toGrapheme]).toEqual([0, 1]);
    expect(block.groups.some((group) => group.fragments.length > 0 && group.fromGrapheme === group.toGrapheme)).toBe(true);
    expect(compiled.readings.rejected.segments.every((segment, index, all) => index === 0 || segment.segmentOrdinal === all[index - 1]!.segmentOrdinal + 1)).toBe(true);
  });

  it('uses a whole-block counterfactual for a proposal whose insertion combines with surviving text', () => {
    const compiled = compileWordTrackedDocxBytes(buildSyntheticTrackedDocx('<w:p><w:r><w:t>e</w:t></w:r>' +
      '<w:ins w:id="1" w:author="A"><w:r><w:t>\u0301</w:t></w:r></w:ins></w:p>'));
    if (compiled.kind !== 'ready') throw new Error('expected supported graph');
    const plan = compiled.readings.rejected.marks[0]!;
    expect([plan.mark.pinnedText, plan.mark.proposedText, plan.mark.fromGrapheme, plan.mark.toGrapheme]).toEqual(['e', 'é', 0, 1]);
    expect(compiled.readings.accepted.marks).toEqual([]);
    expect(compiled.templates[0]!.before).toEqual([]);
    expect(compiled.templates[0]!.after[0]).toMatchObject({ kind: 'text', codeUnits: 1 });
  });

  it('maps a main-story comment independently into every exact surviving block in each reading', () => {
    const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const originalBody = 'full 😀 comment';
    const compiled = compileWordTrackedDocxBytes(buildSyntheticTrackedDocx('<w:p><w:commentRangeStart w:id="0"/>' +
      '<w:r><w:t>A</w:t></w:r><w:ins w:id="1"><w:r><w:t>new</w:t></w:r></w:ins></w:p>' +
      '<w:p><w:r><w:t>B</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>', {
      'word/comments.xml': Buffer.from(`<w:comments xmlns:w="${word}"><w:comment w:id="0" w:author="Raw Author"><w:p><w:r><w:t>${originalBody}</w:t></w:r></w:p></w:comment></w:comments>`),
    }));
    if (compiled.kind !== 'ready') throw new Error('expected supported graph');
    expect(compiled.graph.comments[0]!.bodySha256).toBe(digest(originalBody));
    expect(compiled.decodedCommentBodies.get('0')).toBe(originalBody);
    for (const reading of [compiled.readings.rejected, compiled.readings.accepted]) {
      expect(reading.commentMarks).toHaveLength(2);
      expect(reading.commentMarks.map((entry) => entry.commentId)).toEqual(['0', '0']);
      expect(reading.commentMarks.every((entry) => entry.mark.body.includes(originalBody))).toBe(true);
      expect(reading.commentMarks.map((entry) => entry.mark.pinnedText)).toEqual(reading.blocks.map((block) => block.text));
    }
    expect(compiled.templates[0]!.eventMembership).toHaveLength(1);
    expect(compiled.readings.accepted.marks.every((entry) => entry.mark.origin === 'comment')).toBe(true);
  });

  it('makes only the reading that wholly removes a comment unavailable, and refuses point-only comments', () => {
    const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const parts = { 'word/comments.xml': Buffer.from(`<w:comments xmlns:w="${word}"><w:comment w:id="0"><w:p><w:r><w:t>body</w:t></w:r></w:p></w:comment></w:comments>`) };
    const compiled = compileWordTrackedDocxBytes(buildSyntheticTrackedDocx('<w:p><w:r><w:t>stable</w:t></w:r></w:p>' +
      '<w:p><w:commentRangeStart w:id="0"/><w:del w:id="1"><w:r><w:delText>removed</w:delText></w:r></w:del>' +
      '<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>', parts));
    if (compiled.kind !== 'ready') throw new Error('expected one available reading');
    expect(compiled.readings.rejected.usable).toBe(true);
    expect(compiled.readings.accepted.usable).toBe(false);
    expect(compiled.readings.accepted.refusals[0]!.code).toBe('unrepresentable-comment');
    const point = compileWordTrackedDocxBytes(buildSyntheticTrackedDocx('<w:p><w:r><w:t>stable</w:t></w:r><w:commentReference w:id="0"/>' +
      '<w:ins w:id="1"><w:r><w:t>new</w:t></w:r></w:ins></w:p>', parts));
    expect(point.kind).toBe('unsupported');
    expect(point.inventory.locations.every((location) => location.code === 'unrepresentable-comment')).toBe(true);
  });

  it('preserves the complete independent thousands-edit manifest without copying the graph into samples', () => {
    const count = 4_000;
    const body = Array.from({ length: count }, (_, index) => `<w:p><w:r><w:t>base</w:t></w:r>` +
      `<w:del w:id="d${index}" w:author="A"><w:r><w:delText>old${index}</w:delText></w:r></w:del>` +
      `<w:ins w:id="i${index}" w:author="B"><w:r><w:t>new${index}</w:t></w:r></w:ins></w:p>`).join('');
    const compiled = compileWordTrackedDocxBytes(buildSyntheticTrackedDocx(body));
    if (compiled.kind !== 'ready') throw new Error('expected complete supported graph');
    expect(compiled.templates).toHaveLength(count);
    expect(compiled.graph.events).toHaveLength(count * 2);
    expect(compiled.readings.rejected.marks).toHaveLength(count);
    const book = 'a5c38147-702d-447e-92d4-680c2b592740';
    const samples = wordTrackedSamples(book, compiled.graph, compiled.templates);
    const ids = new Set<string>();
    for (let index = 0; index < count; index += 1) {
      const template = compiled.templates[index]!;
      expect(template.operationKind).toBe('replace');
      expect(template.eventMembership).toEqual(compiled.graph.events.slice(index * 2, index * 2 + 2).map((event) => event.eventId));
      expect(template.before[0]!.paragraphIndex).toBe(index);
      expect(template.after[0]!.paragraphIndex).toBe(index);
      const before = template.before[0]!;
      const after = template.after[0]!;
      expect(compiled.decodedAtoms.get(before.atomOrdinal)).toBe(`old${index}`);
      expect(compiled.decodedAtoms.get(after.atomOrdinal)).toBe(`new${index}`);
      ids.add(samples[index]!.sampleId);
      expect(samples[index]!.sampleId).toBe(`wts_${digest(JSON.stringify({ bookId: book, schema: 'ai7.word-sample-id/1', templateKey: template.templateKey }))}`);
      expect(samples[index]!.graphDigest).toBe(compiled.graphDigest);
      expect('graph' in template).toBe(false);
    }
    expect(ids.size).toBe(count);
  });

  it('pins detail membership and validates flat UTF-16 cursors independently of grapheme anchors', () => {
    const sampleDigest = 'a'.repeat(64);
    const graphDigest = 'b'.repeat(64);
    const sourceVersionId = '10000000-0000-4000-8000-000000000001';
    const imports = [{ choiceDigest: 'c'.repeat(64), admissionDigest: 'd'.repeat(64) }];
    const detailDigest = wordSampleDetailDigest(sampleDigest, graphDigest, sourceVersionId, imports);
    expect(wordSampleDetailDigest(sampleDigest, graphDigest, sourceVersionId, [...imports, ...imports])).not.toBe(detailDigest);
    const text = '😀e\u0301';
    const entry: WordSampleDetailEntry = { kind: 'text', section: 'events', entryOrdinal: 7, sourceOrdinal: 1,
      childOrdinal: null, field: 'rawAuthor', text, sha256: digest(text), fragment: null };
    const lookup = (section: string, ordinal: number): WordSampleDetailEntry | null => section === 'events' && ordinal === 7 ? entry : null;
    const cursor = { schema: 'ai7.word-sample-cursor/1', sampleDigest, detailDigest, section: 'events', entryOrdinal: 7, field: 'rawAuthor', codeUnitOffset: 3 };
    // Offset 3 is inside the e + combining-accent grapheme, but on a valid Unicode scalar boundary.
    expect(validateWordSampleCursor(cursor, { sampleDigest, detailDigest }, lookup)).toEqual(cursor);
    for (const change of [{ codeUnitOffset: 1 }, { codeUnitOffset: 5 }, { entryOrdinal: 1 }, { field: 'rawId' },
      { sampleDigest: graphDigest }, { detailDigest: graphDigest }, { extra: true }]) {
      expect(() => validateWordSampleCursor({ ...cursor, ...change }, { sampleDigest, detailDigest }, lookup)).toThrow('Word');
    }
  });

  it('does not turn the existing imported-mark bound into an accepted-baseline sample cap', () => {
    const count = 20_001;
    const body = Array.from({ length: count }, (_, index) => `<w:p><w:r><w:t>b</w:t></w:r>` +
      `<w:ins w:id="${index}"><w:r><w:t>n</w:t></w:r></w:ins></w:p>`).join('');
    const compiled = compileWordTrackedDocxBytes(buildSyntheticTrackedDocx(body));
    if (compiled.kind !== 'ready') throw new Error('expected accepted mode to retain the complete template manifest');
    expect(compiled.templates).toHaveLength(count);
    expect(compiled.readings.rejected.usable).toBe(false);
    expect(compiled.readings.rejected.marks).toEqual([]);
    expect(compiled.readings.rejected.refusals.some((reason) => reason.code === 'resource-limit')).toBe(true);
    expect(compiled.readings.accepted.usable).toBe(true);
    expect(compiled.readings.accepted.blocks).toHaveLength(count);
    expect(compiled.readings.accepted.marks).toEqual([]);
    expect(compiled.previewReading).toBe('accepted');
  });

  it('keeps a hidden nested event non-visible when its shared hunk also contains a visible sibling', () => {
    const compiled = compileWordTrackedDocxBytes(buildSyntheticTrackedDocx('<w:p><w:r><w:t>base</w:t></w:r><w:ins w:id="1" w:author="A">' +
      '<w:del w:id="2" w:author="B"><w:r><w:delText>hidden</w:delText></w:r></w:del>' +
      '<w:r><w:t>visible</w:t></w:r></w:ins></w:p>'));
    if (compiled.kind !== 'ready') throw new Error('expected supported mixed nested graph');
    expect(compiled.templates).toHaveLength(1);
    expect(compiled.templates[0]!.eventMembership).toEqual(compiled.graph.events.map((event) => event.eventId));
    expect(compiled.graph.events.map((event) => event.disposition)).toEqual(['visible-transition', 'no-visible-transition']);
    expect(compiled.graph.atoms.find((atom) => compiled.decodedAtoms.get(atom.atomOrdinal) === 'hidden')).toMatchObject({ accepted: false, rejected: false });
    expect(compiled.readings.rejected.marks[0]!.mark.authorLabel).toBe('A');
  });

  it.each([true, false])('uses only actual moved runs as transition fragments while retaining paragraph move evidence (moved runs: %s)', (withMovedRuns) => {
    const compiled = compileWordTrackedDocxBytes(buildSyntheticTrackedDocx(wordParagraphMoveBody(withMovedRuns)));
    if (compiled.kind !== 'ready') throw new Error('expected supported paired paragraph move evidence');
    expect(compiled.templates).toHaveLength(withMovedRuns ? 1 : 0);
    expect(compiled.graph.events.map((event) => event.disposition)).toEqual(withMovedRuns
      ? ['range', 'no-visible-transition', 'visible-transition', 'range', 'range', 'no-visible-transition', 'visible-transition', 'range']
      : ['range', 'no-visible-transition', 'range', 'range', 'no-visible-transition', 'range']);
    const moveMarks = compiled.graph.events.filter((event) => event.context === 'paragraph-boundary');
    for (const event of moveMarks) {
      const start = compiled.graph.events.find((linked) => event.linkedEventIds.includes(linked.eventId))!;
      expect(start.kind).toBe(event.kind === 'moveFrom' ? 'moveFromRangeStart' : 'moveToRangeStart');
      expect(start.rangeName).toBe('paragraph move');
    }
    if (withMovedRuns) {
      const sample = compiled.templates[0]!;
      expect(sample.operationKind).toBe('move');
      expect(sample.eventMembership).toEqual(compiled.graph.events.map((event) => event.eventId));
      for (const fragments of [sample.before, sample.after]) {
        expect(fragments).toHaveLength(1);
        expect(fragments[0]).toMatchObject({ kind: 'text', fromCodeUnit: 0, toCodeUnit: 1, codeUnits: 1, sha256: digest('X') });
        expect(compiled.decodedAtoms.get(fragments[0]!.atomOrdinal)).toBe('X');
      }
      expect(sample.sourceLocation).toMatchObject({ paragraphIndex: 0, atomOrdinal: sample.before[0]!.atomOrdinal });
      expect(sample.destinationLocation).toMatchObject({ paragraphIndex: 2, atomOrdinal: sample.after[0]!.atomOrdinal });
      expect(compiled.readings.rejected.marks).toHaveLength(1);
      expect(compiled.readings.rejected.marks[0]!.mark.kind).toBe('annotation');
    } else {
      expect(compiled.readings.rejected.marks).toEqual([]);
    }
    expect(compiled.readings.accepted.marks).toEqual([]);
  });
});

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'ai7-docx-marks-'));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function parseRevised(request: Omit<ComposedRevisedRequest, 'source' | 'title'>) {
  const path = join(sandbox, 'revised.docx');
  await composeRevisedDocx(path, { source: SOURCE, title: '修订组稿', ...request });
  const blocks: ParsedDocxBlock[] = [];
  const parsed = await parseDocx(path, 'revised.docx', (block) => blocks.push(block));
  return { parsed, blocks };
}

const span = (block: number, from?: number, to?: number): SourceSpan => ({ block, ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) });
const text = (value: SourceSpan) => ({ text: value });
const revised = (value: SourceSpan, kind: 'ins' | 'del' | 'moveFrom' | 'moveTo', author: string, date: string) =>
  ({ text: value, revision: { kind, author, date } });
const spanDigest = async (value: SourceSpan): Promise<string> => digest(await sourceSpanText(SOURCE, value));

/** A mark reduced to what a test compares: every text as its digest. */
function shape(mark: ParsedImportedMark) {
  return {
    blockPosition: mark.blockPosition,
    fromGrapheme: mark.fromGrapheme,
    toGrapheme: mark.toGrapheme,
    pinned: digest(mark.pinnedText),
    kind: mark.kind,
    origin: mark.origin,
    authorLabel: mark.authorLabel,
    body: digest(mark.body),
    proposed: mark.proposedText === null ? null : digest(mark.proposedText),
    status: mark.status,
  };
}

async function blockDigestsOf(...sources: number[]): Promise<string[]> {
  return Promise.all(sources.map(async (block) => digest(await sourceSpanText(SOURCE, span(block)))));
}

describe('parser identity /3 reads a revised file as it reads with every revision rejected', () => {
  it('turns a deletion, an insertion and a same-author, same-time replacement into one 修改建议 each', async () => {
    const { parsed, blocks } = await parseRevised({
      paragraphs: [
        { runs: [text(span(8, 0, 10)), revised(span(8, 10, 14), 'del', AUTHOR, '2026-09-01T10:00:00Z'), text(span(8, 14))] },
        { runs: [text(span(10, 0, 20)), revised(span(11, 0, 5), 'ins', AUTHOR, '2026-09-01T10:01:00Z'), text(span(10, 20))] },
        {
          runs: [
            text(span(13, 0, 5)),
            revised(span(13, 5, 9), 'del', AUTHOR, '2026-09-01T10:02:00Z'),
            revised(span(14, 0, 6), 'ins', AUTHOR, '2026-09-01T10:02:00Z'),
            text(span(13, 9)),
          ],
        },
        // Two authors side by side are two intents, never merged for their proximity (V2-UX-PROP-020).
        {
          runs: [
            text(span(15, 0, 30)),
            revised(span(15, 30, 34), 'del', AUTHOR, '2026-09-01T10:03:00Z'),
            revised(span(16, 0, 4), 'ins', OTHER, '2026-09-01T10:03:00Z'),
            text(span(15, 34)),
          ],
        },
      ],
    });
    expect(parsed.parserIdentity).toBe(DOCX_PARSER_IDENTITY);
    expect(DOCX_PARSER_IDENTITY).toBe('ai7-docx-fflate-saxes/3');
    // The rejected reading is the source text itself: deleted words present, inserted words absent.
    expect(blocks.map((block) => digest(block.text))).toEqual(await blockDigestsOf(8, 10, 13, 15));
    expect(parsed.importedMarks.map(shape)).toEqual([
      {
        blockPosition: 1, fromGrapheme: 10, toGrapheme: 14, pinned: await spanDigest(span(8, 10, 14)), kind: 'change-suggestion',
        origin: 'deletion', authorLabel: AUTHOR, body: digest(''), proposed: digest(''), status: 'open',
      },
      {
        blockPosition: 2, fromGrapheme: 20, toGrapheme: 20, pinned: digest(''), kind: 'change-suggestion',
        origin: 'insertion', authorLabel: AUTHOR, body: digest(''), proposed: await spanDigest(span(11, 0, 5)), status: 'open',
      },
      {
        blockPosition: 3, fromGrapheme: 5, toGrapheme: 9, pinned: await spanDigest(span(13, 5, 9)), kind: 'change-suggestion',
        origin: 'replacement', authorLabel: AUTHOR, body: digest(''), proposed: await spanDigest(span(14, 0, 6)), status: 'open',
      },
      {
        blockPosition: 4, fromGrapheme: 30, toGrapheme: 34, pinned: await spanDigest(span(15, 30, 34)), kind: 'change-suggestion',
        origin: 'deletion', authorLabel: AUTHOR, body: digest(''), proposed: digest(''), status: 'open',
      },
      {
        blockPosition: 4, fromGrapheme: 34, toGrapheme: 34, pinned: digest(''), kind: 'change-suggestion',
        origin: 'insertion', authorLabel: OTHER, body: digest(''), proposed: await spanDigest(span(16, 0, 4)), status: 'open',
      },
    ]);
    expect(parsed.importedMarks.map((mark) => mark.ordinal)).toEqual([1, 2, 3, 4, 5]);
  });

  it('reads text inserted and then deleted, in either nesting, as nothing at all', async () => {
    const { parsed, blocks } = await parseRevised({
      paragraphs: [
        {
          runs: [
            text(span(19, 0, 10)),
            { text: span(16, 10, 20), revision: { kind: 'ins', author: AUTHOR, date: '2026-09-01T10:04:00Z', inner: { kind: 'del', author: OTHER, date: '2026-09-01T10:05:00Z' } } },
            text(span(19, 10)),
          ],
        },
        {
          runs: [
            text(span(20, 0, 5)),
            { text: span(16, 20, 30), revision: { kind: 'del', author: OTHER, date: '2026-09-01T10:05:00Z', inner: { kind: 'ins', author: AUTHOR, date: '2026-09-01T10:04:00Z' } } },
            text(span(20, 5)),
          ],
        },
      ],
    });
    expect(blocks.map((block) => digest(block.text))).toEqual(await blockDigestsOf(19, 20));
    expect(parsed.importedMarks).toEqual([]);
    // Nothing became a mark, but the file still carries revisions: the class is present with no count.
    expect(parsed.fidelity[1]).toEqual({
      key: 'comments-revisions', label: '批注与修订', count: 0, status: 'preserved', statusLabel: '完整保留', detail: COMMENTS_REVISIONS_DETAIL,
    });
  });

  it('describes a whole paragraph inserted or deleted, a split and a join as 批注 on the nearest paragraph', async () => {
    const { parsed, blocks } = await parseRevised({
      paragraphs: [
        // Inserted before any paragraph that stands: described on the next one's first grapheme.
        { markRevision: { kind: 'ins', author: AUTHOR, date: '2026-09-01T11:00:00Z' }, runs: [revised(span(6), 'ins', AUTHOR, '2026-09-01T11:00:00Z')] },
        { runs: [text(span(7))] },
        { markRevision: { kind: 'ins', author: AUTHOR, date: '2026-09-01T11:01:00Z' }, runs: [revised(span(9), 'ins', AUTHOR, '2026-09-01T11:01:00Z')] },
        { markRevision: { kind: 'del', author: OTHER, date: '2026-09-01T11:02:00Z' }, runs: [revised(span(12), 'del', OTHER, '2026-09-01T11:02:00Z')] },
        { markRevision: { kind: 'ins', author: OTHER, date: '2026-09-01T11:03:00Z' }, runs: [text(span(17))] },
        { markRevision: { kind: 'del', author: AUTHOR, date: '2026-09-01T11:04:00Z' }, runs: [text(span(18))] },
        { runs: [text(span(20))] },
      ],
    });
    // The inserted paragraphs are not in the rejected reading; the deleted one is.
    expect(blocks.map((block) => digest(block.text))).toEqual(await blockDigestsOf(7, 12, 17, 18, 20));
    const [length7, length12, length17, length18] = (await Promise.all([7, 12, 17, 18].map((block) => sourceSpanText(SOURCE, span(block)))))
      .map((value) => Array.from(segmenter.segment(value)).length);
    const note = async (blockPosition: number, from: number, sourceBlock: number, body: string, author: string, origin: ParsedImportedMark['origin']) => ({
      blockPosition, fromGrapheme: from, toGrapheme: from + 1, pinned: await spanDigest(span(sourceBlock, from, from + 1)), kind: 'annotation',
      origin, authorLabel: author, body: digest(body), proposed: null, status: 'open',
    });
    expect(parsed.importedMarks.map(shape)).toEqual([
      await note(1, 0, 7, paragraphInsertionBody(await sourceSpanText(SOURCE, span(6)), true), AUTHOR, 'paragraph-insertion'),
      await note(1, length7! - 1, 7, paragraphInsertionBody(await sourceSpanText(SOURCE, span(9)), false), AUTHOR, 'paragraph-insertion'),
      {
        blockPosition: 2, fromGrapheme: 0, toGrapheme: length12!, pinned: await spanDigest(span(12)), kind: 'annotation',
        origin: 'paragraph-deletion', authorLabel: OTHER, body: digest(PARAGRAPH_DELETION_BODY), proposed: null, status: 'open',
      },
      await note(3, length17! - 1, 17, PARAGRAPH_SPLIT_BODY, OTHER, 'paragraph-split'),
      await note(4, length18! - 1, 18, PARAGRAPH_MERGE_BODY, AUTHOR, 'paragraph-merge'),
    ]);
  });

  it('keeps moved text at its origin and describes it where it arrives', async () => {
    const date = '2026-09-01T12:00:00Z';
    const { parsed, blocks } = await parseRevised({
      paragraphs: [
        { runs: [text(span(11, 0, 40)), revised(span(11, 40, 50), 'moveFrom', AUTHOR, date), text(span(11, 50))] },
        { runs: [text(span(13, 0, 20)), revised(span(11, 40, 50), 'moveTo', AUTHOR, date), text(span(13, 20))] },
        { markRevision: { kind: 'moveTo', author: OTHER, date }, runs: [revised(span(9), 'moveTo', OTHER, date)] },
      ],
    });
    expect(blocks.map((block) => digest(block.text))).toEqual(await blockDigestsOf(11, 13));
    const [length13] = [Array.from(segmenter.segment(await sourceSpanText(SOURCE, span(13)))).length];
    expect(parsed.importedMarks.map(shape)).toEqual([
      {
        blockPosition: 2, fromGrapheme: 20, toGrapheme: 21, pinned: await spanDigest(span(13, 20, 21)), kind: 'annotation', origin: 'move',
        authorLabel: AUTHOR, body: digest(moveBody(await sourceSpanText(SOURCE, span(11, 40, 50)))), proposed: null, status: 'open',
      },
      {
        blockPosition: 2, fromGrapheme: length13! - 1, toGrapheme: length13!, pinned: await spanDigest(span(13, length13! - 1, length13!)),
        kind: 'annotation', origin: 'move', authorLabel: OTHER, body: digest(moveBody(await sourceSpanText(SOURCE, span(9)))), proposed: null,
        status: 'open',
      },
    ]);
  });

  // The Owner's review of 2026-09-23: a table row or cell inserted or deleted as a whole is read as the paragraphs it
  // holds — an inserted one's words leave the rejected reading and are described where they would stand, a deleted
  // one's stay and are described on themselves — and a revision that changes no text, a merge, stays with the file.
  it('reads a table row or cell inserted or deleted as the paragraphs it holds, and keeps a merge with the file', async () => {
    const { parsed, blocks } = await parseRevised({
      paragraphs: [
        { runs: [text(span(7))] },
        {
          table: [
            { cells: [{ paragraphs: [{ runs: [text(span(8))] }] }, { revision: { kind: 'cellIns', author: AUTHOR, date: '2026-09-01T14:00:00Z' }, paragraphs: [{ runs: [text(span(9))] }] }] },
            { revision: { kind: 'ins', author: OTHER, date: '2026-09-01T14:01:00Z' }, cells: [{ paragraphs: [{ runs: [text(span(6))] }] }] },
            { revision: { kind: 'del', author: AUTHOR, date: '2026-09-01T14:02:00Z' }, cells: [{ paragraphs: [{ runs: [text(span(11))] }] }] },
            {
              cells: [
                { revision: { kind: 'cellDel', author: OTHER, date: '2026-09-01T14:03:00Z' }, paragraphs: [{ runs: [text(span(12))] }] },
                { revision: { kind: 'cellMerge', author: AUTHOR, date: '2026-09-01T14:04:00Z' }, paragraphs: [] },
              ],
            },
          ],
        },
        { runs: [text(span(13))] },
      ],
    });
    // The rejected reading: the inserted cell and row are not there; the deleted row and cell are; a merged cell holds no text.
    expect(blocks.map((block) => digest(block.text))).toEqual(await blockDigestsOf(7, 8, 11, 12, 13));
    const [length8, length11, length12] = (await Promise.all([8, 11, 12].map((block) => sourceSpanText(SOURCE, span(block)))))
      .map((value) => Array.from(segmenter.segment(value)).length);
    const note = async (body: string, author: string) => ({
      blockPosition: 2, fromGrapheme: length8! - 1, toGrapheme: length8!, pinned: await spanDigest(span(8, length8! - 1, length8!)), kind: 'annotation',
      origin: 'paragraph-insertion', authorLabel: author, body: digest(body), proposed: null, status: 'open',
    });
    const deletion = async (blockPosition: number, sourceBlock: number, length: number, author: string) => ({
      blockPosition, fromGrapheme: 0, toGrapheme: length, pinned: await spanDigest(span(sourceBlock)), kind: 'annotation',
      origin: 'paragraph-deletion', authorLabel: author, body: digest(PARAGRAPH_DELETION_BODY), proposed: null, status: 'open',
    });
    expect(parsed.importedMarks.map(shape)).toEqual([
      await note(paragraphInsertionBody(await sourceSpanText(SOURCE, span(9)), false), AUTHOR),
      await note(paragraphInsertionBody(await sourceSpanText(SOURCE, span(6)), false), OTHER),
      await deletion(3, 11, length11!, AUTHOR),
      await deletion(4, 12, length12!, OTHER),
    ]);
    // The row counts exactly the marks the import creates, so a persisted review rebuilds from it byte for byte.
    expect(parsed.fidelity[1]).toMatchObject({ count: 4, detail: COMMENTS_REVISIONS_DETAIL });
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)).toMatchObject({ importedMarks: 4 });
    expect(parsed.fidelity.find((category) => category.key === 'tables')?.count).toBe(1);
  });

  it('keeps a file whose only revision is a merge, which changes no text, and says so', async () => {
    const { parsed, blocks } = await parseRevised({
      paragraphs: [
        { runs: [text(span(7))] },
        { table: [{ cells: [{ paragraphs: [{ runs: [text(span(8))] }] }, { revision: { kind: 'cellMerge', author: AUTHOR, date: '2026-09-01T15:00:00Z' }, paragraphs: [] }] }] },
      ],
    });
    expect(blocks.map((block) => digest(block.text))).toEqual(await blockDigestsOf(7, 8));
    expect(parsed.importedMarks).toEqual([]);
    // Present, converted into nothing: the row names what stays with the file rather than saying none was found.
    expect(parsed.fidelity[1]).toMatchObject({ count: 0, detail: COMMENTS_REVISIONS_DETAIL });
  });

  // The review of PR #498: a row one author inserted and another deleted carries two revisions in its `w:trPr`, and
  // both end with the row. Were one left open, the plain rows and paragraphs after it would read as that author's
  // insertion — dropped from the manuscript and described as a 批注 — or the file would be refused as incomplete.
  it('ends both revisions of a row inserted by one author and deleted by another with the row', async () => {
    const both = [
      { kind: 'ins' as const, author: OTHER, date: '2026-09-01T14:10:00Z' },
      { kind: 'del' as const, author: AUTHOR, date: '2026-09-01T14:11:00Z' },
    ];
    const { parsed, blocks } = await parseRevised({
      paragraphs: [
        { runs: [text(span(7))] },
        {
          table: [
            { cells: [{ paragraphs: [{ runs: [text(span(8))] }] }] },
            { revision: both, cells: [{ paragraphs: [{ runs: [text(span(9))] }] }] },
            { cells: [{ paragraphs: [{ runs: [text(span(11))] }] }] },
          ],
        },
        { runs: [text(span(13))] },
        // The same row as the table's last: the paragraph after the table is still the body's own.
        {
          table: [
            { cells: [{ paragraphs: [{ runs: [text(span(12))] }] }] },
            { revision: both, cells: [{ paragraphs: [{ runs: [text(span(14))] }] }] },
          ],
        },
        { runs: [text(span(15))] },
      ],
    });
    // Inserted and then deleted, the row is in neither reading; every row and paragraph around it stands as written.
    expect(blocks.map((block) => digest(block.text))).toEqual(await blockDigestsOf(7, 8, 11, 13, 12, 15));
    expect(parsed.importedMarks).toEqual([]);
    expect(parsed.fidelity[1]).toMatchObject({ count: 0, status: 'preserved', detail: COMMENTS_REVISIONS_DETAIL });
  });

  // A tracked change in a note, header or footer becomes no mark; the row says it stays with the file rather than
  // that the file carries none.
  it('says a tracked change in a footnote stays with the file, rather than that none was found', async () => {
    const { parsed, blocks } = await parseRevised({
      paragraphs: [{ runs: [text(span(7))] }],
      footnoteRevision: { text: span(8, 0, 10), author: AUTHOR, date: '2026-09-01T16:00:00Z' },
    });
    expect(blocks.map((block) => digest(block.text))).toEqual(await blockDigestsOf(7));
    expect(parsed.importedMarks).toEqual([]);
    expect(parsed.fidelity[1]).toMatchObject({ count: 0, statusLabel: '完整保留', detail: COMMENTS_REVISIONS_DETAIL });
    const plain = await parseRevised({ paragraphs: [{ runs: [text(span(7))] }] });
    expect(plain.parsed.fidelity[1]!.detail).not.toBe(COMMENTS_REVISIONS_DETAIL);
  });

  it('keeps a formatting revision with the file instead of refusing it', async () => {
    const formatting = { author: AUTHOR, date: '2026-09-01T13:00:00Z' };
    const { parsed, blocks } = await parseRevised({
      paragraphs: [{ runs: [text(span(8, 0, 20)), text(span(8, 20))], formattingRevision: formatting }, { runs: [text(span(10))] }],
      sectionRevision: formatting,
    });
    // The style the paragraph had before the revision does not come back: the text reads as it stands.
    expect(blocks.map((block) => [block.kind, block.level])).toEqual([['paragraph', null], ['paragraph', null]]);
    expect(blocks.map((block) => digest(block.text))).toEqual(await blockDigestsOf(8, 10));
    expect(parsed.importedMarks).toEqual([]);
    expect(parsed.fidelity.filter((category) => category.count > 0).map((category) => [category.key, category.count]))
      .toEqual([['inline-styles', 1], ['sections', 1]]);
    expect(parsed.fidelity[1]!.detail).toBe(COMMENTS_REVISIONS_DETAIL);
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes))
      .toEqual({ outcome: 'clean-import-no-round-trip', degradations: [], textBoxDisposition: null, importedMarks: 0 });
  });
});

describe('parser identity /3 reads comments into 批注', () => {
  it('anchors a ranged comment, folds a reply by another author into it, and brings a done comment 已处理', async () => {
    const { parsed } = await parseRevised({
      paragraphs: [
        {
          runs: [
            text(span(8, 0, 10)), { comment: 'start', id: 1 }, { comment: 'start', id: 2 }, text(span(8, 10, 20)),
            { comment: 'end', id: 1 }, { comment: 'reference', id: 1 }, { comment: 'end', id: 2 }, { comment: 'reference', id: 2 }, text(span(8, 20)),
          ],
        },
        { runs: [text(span(10, 0, 5)), { comment: 'start', id: 3 }, text(span(10, 5, 9)), { comment: 'end', id: 3 }, { comment: 'reference', id: 3 }, text(span(10, 9))] },
      ],
      comments: [
        { id: 1, author: AUTHOR, text: [span(14, 0, 10)] },
        { id: 2, author: OTHER, text: [span(15, 0, 8)], replyTo: 1 },
        { id: 3, author: AUTHOR, text: [span(16, 0, 6), span(16, 6, 12)], done: true },
      ],
    });
    const reply = commentReplyLine(OTHER, await sourceSpanText(SOURCE, span(15, 0, 8)));
    expect(parsed.importedMarks.map(shape)).toEqual([
      {
        blockPosition: 1, fromGrapheme: 10, toGrapheme: 20, pinned: await spanDigest(span(8, 10, 20)), kind: 'annotation', origin: 'comment',
        authorLabel: AUTHOR, body: digest(`${await sourceSpanText(SOURCE, span(14, 0, 10))}\n${reply}`), proposed: null, status: 'open',
      },
      {
        blockPosition: 2, fromGrapheme: 5, toGrapheme: 9, pinned: await spanDigest(span(10, 5, 9)), kind: 'annotation', origin: 'comment',
        authorLabel: AUTHOR,
        body: digest(`${await sourceSpanText(SOURCE, span(16, 0, 6))}\n${await sourceSpanText(SOURCE, span(16, 6, 12))}`),
        proposed: null, status: 'resolved',
      },
    ]);
    expect(parsed.fidelity[1]).toEqual({
      key: 'comments-revisions', label: '批注与修订', count: 2, status: 'preserved', statusLabel: '完整保留', detail: COMMENTS_REVISIONS_DETAIL,
    });
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)?.importedMarks).toBe(2);
  });

  it('clips a comment across paragraphs to its first and gives a point comment its adjacent grapheme', async () => {
    const { parsed } = await parseRevised({
      paragraphs: [
        { runs: [text(span(7, 0, 10)), { comment: 'start', id: 5 }, text(span(7, 10))] },
        { runs: [text(span(9, 0, 5)), { comment: 'end', id: 5 }, { comment: 'reference', id: 5 }, text(span(9, 5))] },
        { runs: [text(span(12)), { comment: 'reference', id: 6 }] },
        { runs: [{ comment: 'reference', id: 7 }, text(span(17))] },
      ],
      comments: [
        { id: 5, author: AUTHOR, text: [span(14, 0, 4)] },
        { id: 6, author: OTHER, text: [span(14, 4, 8)] },
        { id: 7, author: AUTHOR, text: [] },
      ],
    });
    const length12 = Array.from(segmenter.segment(await sourceSpanText(SOURCE, span(12)))).length;
    expect(parsed.importedMarks.map((mark) => [mark.blockPosition, mark.fromGrapheme, mark.toGrapheme, digest(mark.body)])).toEqual([
      [1, 10, 17, digest(`${await sourceSpanText(SOURCE, span(14, 0, 4))}\n${CROSS_PARAGRAPH_COMMENT_LINE}`)],
      [3, length12 - 1, length12, digest(await sourceSpanText(SOURCE, span(14, 4, 8)))],
      [4, 0, 1, digest('（空批注）')],
    ]);
  });

  it('leaves comments and revisions inside a text box with the file', async () => {
    const { parsed, blocks } = await parseRevised({
      paragraphs: [
        {
          runs: [text(span(8))],
          textBox: [{ runs: [{ comment: 'start', id: 9 }, text(span(9, 0, 10)), revised(span(9, 10, 14), 'del', AUTHOR, '2026-09-01T14:00:00Z'), { comment: 'end', id: 9 }, text(span(9, 14))] }],
        },
      ],
      comments: [{ id: 9, author: AUTHOR, text: [span(14, 0, 4)] }],
    });
    expect(blocks.map((block) => digest(block.text))).toEqual(await blockDigestsOf(8));
    // The box's paragraph reads rejected as well: its deleted words are still there.
    expect(parsed.textBoxes.map((box) => box.paragraphs.map((paragraph) => digest(paragraph.text)))).toEqual([await blockDigestsOf(9)]);
    expect(parsed.importedMarks).toEqual([]);
    expect(parsed.fidelity[1]!.detail).toBe(COMMENTS_REVISIONS_DETAIL);
  });
});

describe('the /3 report and the reports recorded before it', () => {
  const NO_SIGNALS: DocumentSignals = {
    inlineStyles: 0, commentsRevisions: 0, notes: 0, tables: 0, imagesCaptions: 0, sections: 0, textBoxes: 0, fields: 0,
  };

  it('reads exact sample1 as revision 2 read it, with nothing to convert', async () => {
    const blocks: ParsedDocxBlock[] = [];
    const parsed = await parseDocx(admittedSourcePath(SOURCE), SOURCE, (block) => blocks.push(block));
    expect([parsed.blockCount, parsed.characterCount, parsed.importedMarks.length]).toEqual([97, 8289, 0]);
    expect(parsed.fidelity).toEqual(buildFidelityReport({ ...NO_SIGNALS, inlineStyles: 266, sections: 1 }, 0));
  });

  it('still rebuilds a revision-2 review, whose comments and revisions were 不支持导入, only under its own identity', () => {
    const v3 = buildFidelityReport({ ...NO_SIGNALS, commentsRevisions: 3 }, 0);
    expect(v3[1]).toMatchObject({ count: 3, status: 'preserved', detail: COMMENTS_REVISIONS_DETAIL });
    const v2 = v3.map((category) => category.key === 'comments-revisions'
      ? { ...category, status: 'unsupported' as const, statusLabel: '不支持导入' as const, detail: '本次受限导入不导入批注或修订标记。' }
      : category);
    expect(deriveImportFidelityPlan(v2, 'digest', 1, undefined, DOCX_PARSER_IDENTITY_V2)).toEqual({
      outcome: 'degraded-import-no-round-trip',
      degradations: [{ categoryKey: 'comments-revisions', label: '批注与修订', count: 3 }],
      textBoxDisposition: null,
      importedMarks: 0,
    });
    expect(deriveImportFidelityPlan(v2, 'digest', 1)).toBeUndefined();
    expect(deriveImportFidelityPlan(v3, 'digest', 1, undefined, DOCX_PARSER_IDENTITY_V2)).toBeUndefined();
    expect(deriveImportFidelityPlan(v3, 'digest', 1)).toEqual({
      outcome: 'clean-import-no-round-trip', degradations: [], textBoxDisposition: null, importedMarks: 3,
    });
  });

  it('states the class 不支持导入 for a reimport, which makes no mark, and keeps each form through the text-box choice', () => {
    const report = buildFidelityReport({ ...NO_SIGNALS, commentsRevisions: 4, textBoxes: 1 }, 0);
    const reimport = reimportFidelityReport(report)!;
    expect(reimport[1]).toEqual({
      key: 'comments-revisions', label: '批注与修订', count: 4, status: 'unsupported', statusLabel: '不支持导入',
      detail: REIMPORT_COMMENTS_REVISIONS_DETAIL,
    });
    expect(deriveImportFidelityPlan(reimport, 'digest', 1)).toEqual({
      outcome: 'degraded-import-no-round-trip',
      degradations: [{ categoryKey: 'comments-revisions', label: '批注与修订', count: 4 }],
      textBoxDisposition: 'retain',
      importedMarks: 0,
    });
    expect(withTextBoxDisposition(report, 'merge')![1]).toEqual(report[1]);
    expect(withTextBoxDisposition(reimport, 'merge')![1]).toEqual(reimport[1]);
    // A report with nothing to convert is the same report for a reimport.
    const absent = buildFidelityReport(NO_SIGNALS, 0);
    expect(reimportFidelityReport(absent)).toEqual(absent);
  });
});
