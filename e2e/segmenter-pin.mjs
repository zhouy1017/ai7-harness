import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';

/**
 * The word-segmentation pin of local retrieval (#1623; ADR 0107 §4 point 1). Retrieval takes its Han word feature from
 * `Intl.Segmenter('zh', { granularity: 'word' })`, which reads the runtime's ICU dictionary. The unit test pins what the test
 * runtime (Node) does with this list, so a Node upgrade that moves a boundary is seen; J-16 runs the same list in the product's
 * own executable as the service runs it (`ELECTRON_RUN_AS_NODE`), so an Electron upgrade is seen.
 *
 * The passages are read from the admitted Public SampleBooks at run time and never copied: a pin records only boundaries.
 */
export const SEGMENTER_PIN_PASSAGES = Object.freeze([
  Object.freeze({ book: 'luxun-nahan.docx', paragraph: 13 }),
  Object.freeze({ book: 'luxun-zhaohua-xishi.docx', paragraph: 36 }),
  Object.freeze({ book: 'wujingzi-rulin-waishi.docx', paragraph: 34 }),
]);
/** The seven words the packaged runtime's dictionary holds and the test runtime's does not (ICU 78, Chromium's patch). */
export const SEGMENTER_DICTIONARY_DIFFERENCES = Object.freeze(['七国集团', '七國集團', '五大湖', '五大连池', '五大連池', '春运', '调控']);

/** What Node 24.18.1 (ICU 78.3) makes of `segmenterPinTexts`: it splits each of the seven words. */
export const TEST_RUNTIME_BOUNDARIES = Object.freeze([
  [2, 3, 4, 5, 6, 8, 10, 13, 14, 15, 16, 18, 20, 21, 22, 23, 24, 26, 27, 29, 32, 33, 34, 37, 39, 40, 43, 44, 45, 48, 50, 51, 52, 54, 55, 57],
  [2, 3, 5, 7, 8, 11, 12, 13, 14, 16, 17, 19, 20, 23, 26, 28, 29, 31, 33, 35, 38, 39, 40, 42, 44, 46, 47, 48, 49, 50, 52, 53, 54, 56, 57, 59, 60],
  [1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 17, 18, 19, 21, 22, 24, 27, 29, 31, 32, 34, 35, 36, 37, 40, 42, 43, 45, 48, 50, 51, 52],
  [2, 4], [2, 4], [2, 3], [1, 3, 4], [2, 3, 4], [1, 2], [1, 2],
].map((boundaries) => Object.freeze(boundaries)));
/** What the packaged runtime (Electron 43.4.1) makes of them: the same passages, and each of the seven words whole. */
export const PACKAGED_RUNTIME_BOUNDARIES = Object.freeze([
  ...TEST_RUNTIME_BOUNDARIES.slice(0, SEGMENTER_PIN_PASSAGES.length),
  ...SEGMENTER_DICTIONARY_DIFFERENCES.map((word) => Object.freeze([word.length])),
]);

const ENTITIES ={ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
/** The non-empty paragraphs of a DOCX body, as its text runs read them. */
export function docxParagraphs(path) {
  const xml = new TextDecoder().decode(unzipSync(readFileSync(path), { filter: (file) => file.name === 'word/document.xml' })['word/document.xml']);
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/gu)]
    .map((paragraph) => [...paragraph[0].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/gu)].map((run) => run[1]).join('').replace(/&(amp|lt|gt|quot|apos);/gu, (_, name) => ENTITIES[name]))
    .filter((text) => text.trim().length > 0);
}

/** The pinned texts: the passages, then the seven words. */
export function segmenterPinTexts(root) {
  return [...SEGMENTER_PIN_PASSAGES.map(({ book, paragraph }) => docxParagraphs(resolve(root, 'SampleBooks', book))[paragraph]), ...SEGMENTER_DICTIONARY_DIFFERENCES];
}

/**
 * Each text's Han word boundaries as retrieval reads them: the end offset (UTF-16) of every segment made only of Han characters.
 * Self-contained, so that J-16 can send its source to the product's executable.
 */
export function hanWordBoundaries(texts) {
  const words = new Intl.Segmenter('zh', { granularity: 'word' });
  return texts.map((text) => [...words.segment(text.normalize('NFKC'))].filter((part) => /^\p{Script=Han}+$/u.test(part.segment)).map((part) => part.index + part.segment.length));
}
