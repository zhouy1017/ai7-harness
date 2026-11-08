import type { SelectionSpanBlockPin } from '../shared/protocol/selection-span.js';

// 修改此处 (Issue #1411): the editor's own revision of the words they selected, recorded as a 修改建议 of theirs and applied at
// once. Words inside one paragraph are one revision. Words across paragraphs are one revision per paragraph they touch — the
// line of the rewritten text that stands for that paragraph — applied together as one Effect, so nothing of the selection is
// silently left out and one 撤销本次修改 takes the whole revision back.

export const QUICK_REVISE_LABEL = '修改此处';
export const QUICK_REVISE_HINT = '留痕并立即应用';
export const QUICK_REVISE_TITLE = '修改此处';
export const QUICK_REVISE_FIELD = '改为';
export const QUICK_REVISE_FIELD_HINT = '清空即删去这段文字；Ctrl+Enter 应用。';
export const QUICK_REVISE_SPAN_HINT = '跨段选择时每一行对应一段；少写的行表示删去那一段所选的文字。Ctrl+Enter 应用。';
export const QUICK_REVISE_RATIONALE = '修订说明 · 选填';
export const QUICK_REVISE_SUBMIT = '应用修改';
export const QUICK_REVISE_NOTE = '修改会留下一张「编辑修订」卡片并立即写入正文；卡片上可对照修改前后，也可撤销本次修改。';
export const EDITOR_REVISION_RATIONALE = '编辑修订';
export const QUICK_REVISE_UNCHANGED = '文字没有改动；没有记录修订。';
export const QUICK_REVISE_TOO_MANY_LINES = '改后的行数多于所选的段数；跨段修改请每段一行，或在单段内修改。';
export const QUICK_REVISE_APPLIED = '已应用修订；正文已更新，修订卡片可撤销。';
export const REVERSE_REVISION_LABEL = '撤销本次修改';
export const REVERSE_REVISION_DONE = '已撤销本次修改；原文已写回稿件。';

/** One paragraph's part of a revision: its pin, the words it holds there and what they become. */
export interface RevisionSegment {
  readonly blockId: string;
  readonly blockDigest: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  readonly text: string;
  readonly proposedText: string;
}

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
const graphemes = (text: string): string[] => Array.from(segmenter.segment(text), ({ segment }) => segment);

/**
 * The revision of a selection across paragraphs: the rewritten text's line `i` replaces the selected words of the span's paragraph
 * `i`; paragraphs past the last line lose their selected words. Paragraphs whose words do not change carry no revision. A string
 * is the reason nothing can be recorded.
 */
export function spanRevisionSegments(
  span: ReadonlyArray<SelectionSpanBlockPin>,
  textOf: (blockId: string) => string | undefined,
  proposed: string,
): RevisionSegment[] | string {
  const lines = proposed.replace(/\r\n?/gu, '\n').split('\n');
  if (lines.length > span.length) return QUICK_REVISE_TOO_MANY_LINES;
  const segments: RevisionSegment[] = [];
  for (const [index, pin] of span.entries()) {
    const text = textOf(pin.blockId);
    if (text === undefined) return '所选段落已不在当前窗口中，请重新选择。';
    const words = graphemes(text).slice(pin.fromGrapheme, pin.toGrapheme).join('');
    const next = lines[index] ?? '';
    if (next === words) continue;
    // An empty paragraph part that stays empty, or a part with no words to replace and nothing to write, is no revision.
    if (words.length === 0 && next.length === 0) continue;
    segments.push({ ...pin, text: words, proposedText: next });
  }
  return segments.length === 0 ? QUICK_REVISE_UNCHANGED : segments;
}
