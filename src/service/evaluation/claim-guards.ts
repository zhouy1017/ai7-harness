/**
 * What AI7's evaluation words may not claim (Issue #429, plan slice S81b2; V2-UX-EVAL-008, EVAL-009). Each guard looks for one
 * kind of claim in one line of model text; the caller sets that line aside and keeps the rest, so one sentence never costs the
 * scores or the other lines beside it.
 *
 * - A market line or prediction may not state a quantity — sales, a print run, a price, a share or odds — since nothing read
 *   in the Book supports one and web search is not connected (ADR 0080 §7). A figure that is the Book's own, a chapter or a
 *   decade (「第3章」, 「80年代」), is no quantity claim.
 * - A rewritten 评语 or 总评 may not state a score or choose a conclusion: the numbers and the conclusion are the editor's.
 */

/** A numeral: Arabic or full-width digits, or the Chinese numerals and counting words a quantity is written with. */
const NUMERAL = '[\\p{Nd}〇零一二三四五六七八九十百千万亿两几]';
/** A numeral run followed by a unit a quantity is stated in, `百分之…`, or odds. */
const QUANTITY = new RegExp(`${NUMERAL}[\\p{Nd}〇零一二三四五六七八九十百千万亿两几.,，．]*\\s*(?:万|亿|册|元|块|成|%|％|倍|个百分点)|百分之|概率|几率`, 'u');

/** Whether one line of market text states a quantity nothing read in the Book can support. */
export function claimsQuantity(text: string): boolean {
  return QUANTITY.test(text);
}

/**
 * A score in a 评语: digits before 分 (「18分」, 「16.5 分」), a fraction against 满分 (「13 / 20」), the word 满分, or Chinese
 * numerals before 分 — but not the adverb 十分, the word 部分, a fraction 「三分之一」 or minutes 「5分钟」.
 */
const SCORE = /[\p{Nd}]+(?:[.．][\p{Nd}]+)?\s*分(?![之钟])|[\p{Nd}]+\s*[/／]\s*[\p{Nd}]+|满分|(?<![零一二三四五六七八九十两部])(?!十分)[零一二三四五六七八九十两]+分(?![之钟])/u;

/** Whether one rewritten line states a score. */
export function claimsScore(text: string): boolean {
  return SCORE.test(text);
}

/** Whether one rewritten line names one of the conclusions — the editor's to choose. */
export function claimsConclusion(text: string, conclusions: ReadonlyArray<string>): boolean {
  return conclusions.some((label) => label.length > 0 && text.includes(label));
}
