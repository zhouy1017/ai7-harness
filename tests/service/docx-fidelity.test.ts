import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { SaxesParser } from 'saxes';
import { describe, expect, it } from 'vitest';
import { parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { EditorialStore } from '../../src/service/store.js';
import { DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, type ManuscriptWindowProjection } from '../../src/shared/protocol.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import { buildCorpusSource, type CorpusSource, type CorpusVariant } from '../fixtures/docx-fidelity/builder.js';
import classification from '../fixtures/docx-fidelity/classification.json' with { type: 'json' };
import { createServiceTestRoots } from '../support/temp-data-root.js';

// Issue #814 / J-01 and J-07, L2: use the actual import, edit, review, preparation, approval,
// atomic file and receipt owners. Assertions emit only digests, counts and container classifications.
const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const count = (xml: string, local: string): number => [...xml.matchAll(new RegExp(`<w:${local}(?=[\\s/>])`, 'g'))].length;
const target = { kind: 'current' } as const;

/** Digest each first-paragraph grapheme together with its actual run properties, without exposing words. */
function firstParagraphStyles(xml: string): Array<[string, string]> {
  const parser = new SaxesParser({ xmlns: true });
  const stack: string[] = [];
  const result: Array<[string, string]> = [];
  let paragraphs = 0;
  let activeDepth = -1;
  let run: { words: string; properties: string[] } | null = null;
  parser.on('opentag', (tag) => {
    if (tag.local === 'p' && paragraphs++ === 0) activeDepth = stack.length;
    if (activeDepth >= 0 && !stack.some((local) => ['drawing', 'pict', 'txbxContent'].includes(local))) {
      if (tag.local === 'r') run = { words: '', properties: [] };
      if (run !== null && stack.includes('rPr') && !stack.includes('rPrChange') &&
          ['b', 'i', 'u', 'rFonts', 'color', 'vertAlign'].includes(tag.local)) {
        run.properties.push(JSON.stringify([tag.local, Object.values(tag.attributes).map((attribute) => [attribute.local, attribute.value])]));
      }
    }
    stack.push(tag.local);
  });
  parser.on('text', (words) => {
    if (run !== null && stack.at(-1) === 't' && !stack.some((local) => ['drawing', 'pict', 'txbxContent'].includes(local))) run.words += words;
  });
  parser.on('closetag', (tag) => {
    stack.pop();
    if (tag.local === 'r' && run !== null) {
      for (const grapheme of graphemesOf(run.words)) result.push([digest(grapheme), digest(JSON.stringify(run.properties.sort()))]);
      run = null;
    }
    if (tag.local === 'p' && stack.length === activeDepth) activeDepth = -1;
  });
  parser.write(xml).close();
  return result;
}

function actualClasses(before: Record<string, Uint8Array>, after: Record<string, Uint8Array>, variant: CorpusVariant): Record<string, string> {
  const xml = strFromU8(after['word/document.xml']!);
  const unchanged = (parts: string[]): boolean => parts.every((part) => before[part] !== undefined && after[part] !== undefined && digest(before[part]!) === digest(after[part]!));
  const classify = (condition: boolean, result = 'rebuilt'): string => condition ? result : 'lost';
  const allRunProperties = ['b', 'i', 'color', 'u', 'vertAlign'].every((tag) => count(xml, tag) > 0);
  return {
    'run-properties': variant === 'edited'
      ? classify(count(xml, 'b') > 0 && count(xml, 'i') === 0 && count(xml, 'color') === 0, 'intentionally-excluded')
      : classify(allRunProperties),
    drawings: classify(count(xml, 'drawing') === 1 && xml.includes('r:embed="rImage"') && unchanged(['word/media/pixel.png'])),
    'text-boxes': classify(count(xml, 'txbxContent') === 1 && count(xml, 'pict') === 1),
    'footnotes-endnotes': classify(count(xml, 'footnoteReference') === 1 && count(xml, 'endnoteReference') === 1 && unchanged(['word/footnotes.xml', 'word/endnotes.xml']), 'preserved'),
    fields: variant === 'unchanged'
      ? classify(count(xml, 'fldSimple') === 1 && count(xml, 'instrText') === 1 && count(xml, 'fldChar') === 3)
      : classify(count(xml, 'fldSimple') === 0 && count(xml, 'instrText') === 0 && count(xml, 'fldChar') === 0, 'intentionally-excluded'),
    'comments-tracked-changes': classify(after['word/comments.xml'] !== undefined && count(xml, 'commentRangeStart') >= 1 && count(xml, 'del') === 1 && count(xml, 'ins') === 1),
    tables: classify(['tbl', 'tblPr', 'tblGrid', 'tr', 'tc', 'tcPr'].every((tag) => count(xml, tag) === 1)),
    numbering: classify(unchanged(['word/numbering.xml']) && count(xml, 'numPr') === 1 && xml.includes('<w:numId w:val="1"/>'), 'preserved'),
    sections: classify(count(xml, 'sectPr') === 1 && xml.includes('<w:pgSz w:w="11906" w:h="16838"/>') && count(xml, 'pgMar') === 1),
    'headers-footers': classify(unchanged(['word/header1.xml', 'word/footer1.xml']) && count(xml, 'headerReference') === 1 && count(xml, 'footerReference') === 1, 'preserved'),
    styles: classify(unchanged(['word/styles.xml']) && xml.includes('<w:pStyle w:val="Normal"/>'), 'preserved'),
    hyperlinks: variant === 'unchanged' ? classify(count(xml, 'hyperlink') === 1)
      : classify(count(xml, 'hyperlink') === 0, 'intentionally-excluded'),
    'unrepresented-revisions': classify(count(xml, 'rPrChange') === 0, 'intentionally-excluded'),
  };
}

describe('edited DOCX fidelity corpus (#814)', () => {
  for (const source of classification.sources as CorpusSource[]) {
    for (const variant of Object.keys(classification.pairs) as CorpusVariant[]) {
      it(`${source} / ${variant}: classify the written file and freeze the same disclosure through restart`, async () => {
        const roots = await createServiceTestRoots('ai7-docx-fidelity-');
        let store: EditorialStore | null = null;
        try {
          const original = await buildCorpusSource(source);
          const selected = join(roots.inputRoot, 'source.docx');
          await writeFile(selected, original);
          store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
          const staged = await store.stageSelectedManuscript(randomUUID(), selected);
          const importing = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
            { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '保真容器' }, true);
          const commitId = randomUUID();
          const book = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: importing.draftVersion, reviewDigest: importing.reviewDigest!, commitId });
          await store.acknowledgeImportCompletion(commitId);
          const view = (): ManuscriptWindowProjection => store!.getManuscriptWindow(book.manuscriptId, book.branchId, null);
          expect(view().blocks).toHaveLength(4);
          if (variant === 'edited') {
            for (let index = 0; index < 3; index += 1) {
              const current = view();
              const block = current.blocks[index]!;
              store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId,
                baseRevisionId: current.revisionId, blockId: block.blockId, windowStartBlockId: current.blocks[0]!.blockId,
                baseBlockDigest: block.digest, expectedJournalSequence: current.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: '〔编辑〕' });
            }
          }
          if (variant === 'mark-exported') {
            for (let index = 0; index < 3; index += 1) {
              const current = view();
              const block = current.blocks[index]!;
              store.createEditorialMark({ manuscriptId: book.manuscriptId, branchId: book.branchId,
                windowStartBlockId: current.blocks[0]!.blockId, clientMarkId: randomUUID(), baseRevisionId: current.revisionId,
                expectedJournalSequence: current.journalSequence, blockId: block.blockId, baseBlockDigest: block.digest,
                fromGrapheme: 1, toGrapheme: 5, selectedText: graphemesOf(block.text).slice(1, 5).join(''),
                kind: 'annotation', highlightColor: null, body: '核对格式。', proposedText: null, rationale: null });
            }
          }
          const reviewed = await store.reviewManuscriptExport({ bookId: book.bookId, target, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS } }, true);
          expect(reviewed.retention).not.toBeNull();
          expect(reviewed.retentionSummary?.startsWith('本次 DOCX：')).toBe(true);
          const destination = join(roots.inputRoot, `${source}-${variant}.docx`);
          const preparation = await store.prepareManuscriptExport({ bookId: book.bookId, revisionId: reviewed.target.revisionId, target,
            options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS }, reviewDigest: reviewed.reviewDigest, destination }, true);
          expect(preparation.retention).toEqual(reviewed.retention);
          expect(preparation.retentionSummary).toBe(reviewed.retentionSummary);
          const receipt = await store.approveManuscriptExport({ bookId: book.bookId, preparationId: preparation.preparationId }, true);
          expect(receipt.outcome).toBe('created');
          expect(receipt.retention).toEqual(reviewed.retention);
          expect(receipt.retentionSummary).toBe(reviewed.retentionSummary);
          const written = new Uint8Array(await readFile(destination));
          expect(digest(written)).toBe(receipt.technical.fileSha256);
          const before = unzipSync(original);
          const after = unzipSync(written);
          expect(actualClasses(before, after, variant)).toEqual(classification.pairs[variant]);
          const originalStyles = firstParagraphStyles(strFromU8(before['word/document.xml']!));
          const writtenStyles = firstParagraphStyles(strFromU8(after['word/document.xml']!));
          if (variant === 'edited') expect([...new Set(writtenStyles.map(([, properties]) => properties))]).toEqual([originalStyles[0]![1]]);
          else expect(writtenStyles).toEqual(originalStyles);
          // Retained box text and properties stay with that exact box; no duplicate body block appears.
          const box = (xml: string): string => xml.match(/<w:txbxContent>.*?<\/w:txbxContent>/s)?.[0] ?? '';
          expect(digest(box(strFromU8(after['word/document.xml']!)))).toBe(digest(box(strFromU8(before['word/document.xml']!))));
          const reread: ParsedDocxBlock[] = [];
          const parsed = await parseDocx(destination, 'written.docx', (block) => reread.push(block));
          expect(reread.map((block) => block.digest)).toEqual(view().blocks.map((block) => block.digest));
          expect(parsed.importedMarks.filter((mark) => mark.kind === 'change-suggestion').map((mark) => mark.origin)).toEqual(['replacement']);
          expect(parsed.importedMarks.filter((mark) => mark.kind === 'annotation')).toHaveLength(variant === 'mark-exported' ? 4 : 1);
          expect(parsed.textBoxes).toHaveLength(1);
          const exclusions = receipt.retention!.excluded.join(' ');
          expect(exclusions.includes('#874')).toBe(true);
          expect(exclusions.includes('原文件中的修订')).toBe(true);
          if (variant !== 'unchanged') expect(exclusions.includes('不再更新')).toBe(true);
          if (variant === 'edited') expect(exclusions.includes('部分格式')).toBe(true);
          expect(receipt.retention!.preserved.some((item) => item.includes('编号定义'))).toBe(true);
          if (variant !== 'unchanged') expect(receipt.retention!.rebuilt.some((item) => item.includes('引用移到该段末尾'))).toBe(true);
          store.markCleanShutdown();
          store.close();
          store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
          const held = store.inspectManuscriptExportReceipt({ bookId: book.bookId, preparationId: preparation.preparationId });
          expect(held).toEqual(receipt);
          store.markCleanShutdown();
        } finally {
          store?.close();
          await roots.dispose();
        }
      }, 60_000);
    }
  }
});
