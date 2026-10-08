/**
 * What AI7's evaluation words may not claim (Issue #429, plan slice S81b2; V2-UX-EVAL-008, EVAL-009). Each guard looks for one
 * kind of claim in one line of model text; the caller sets that line aside and keeps the rest, so one sentence never costs the
 * scores or the other lines beside it.
 *
 * - A market line or prediction may not state a quantity — sales, a print run, a price, a share or odds — since nothing read
 *   in the Book supports one and web search is not connected (ADR 0080 §7). A figure that is the Book's own, a chapter or a
 *   decade (「第3章」, 「80年代」), is no quantity claim.
 * - A rewritten 评语 or 总评 may not state a score or choose a conclusion: the numbers and the conclusion are the editor's.
 *
 * Both read a line once, numeral run by numeral run, and look only a few characters to either side of each run (Issue #689):
 * the cost stays linear in the line however its numerals fall. A numeral is a claim only in a quantity's or a score's
 * context, so the ordinary words that hold one — 这一块, 二元对立, 一成不变, 万一, 亿万读者, 千万不要, 入木三分, 十二分的,
 * 一分为二, 三分之一, a fraction such as 2/3 — pass.
 */

const CHINESE_NUMERALS = new Set('〇零一二三四五六七八九十百千万亿两几');
/** The numerals that multiply rather than count: a run of these alone names no amount. */
const MAGNITUDES = new Set('十百千万亿');
/** A thousands separator or a decimal point, read as part of a number only between two numerals. */
const SEPARATORS = new Set('.,，．');
const DIGIT = /^\p{Nd}$/u;
const SPACE = /^\s$/u;
const PUNCTUATION = /^\p{P}$/u;

const isDigit = (char: string | undefined): boolean => char !== undefined && DIGIT.test(char);
const isQuantityNumeral = (char: string | undefined): boolean => char !== undefined && (isDigit(char) || CHINESE_NUMERALS.has(char));

/** One maximal run of numerals in a line, as indexes into its characters: `[start, end)`. */
interface NumeralRun {
  readonly start: number;
  readonly end: number;
}

/** Each maximal run of the given numerals, a separator kept only between two of them; every character is visited once. */
function* numeralRuns(chars: ReadonlyArray<string>, isNumeral: (char: string | undefined) => boolean): Generator<NumeralRun> {
  let index = 0;
  while (index < chars.length) {
    if (!isNumeral(chars[index])) {
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    for (;;) {
      if (isNumeral(chars[index])) index += 1;
      else if (SEPARATORS.has(chars[index]!) && isNumeral(chars[index + 1])) index += 2;
      else break;
    }
    yield { start, end: index };
  }
}

/** The first index at or after `index` that is not white space. */
function skipSpace(chars: ReadonlyArray<string>, index: number): number {
  let at = index;
  while (at < chars.length && SPACE.test(chars[at]!)) at += 1;
  return at;
}

const startsWith = (chars: ReadonlyArray<string>, at: number, word: string): boolean => {
  const wanted = Array.from(word);
  return wanted.every((char, offset) => chars[at + offset] === char);
};

// ---- quantities in market words ----------------------------------------------------------------------------------

/** Odds and a percentage written out in words: a claim wherever they stand. */
const QUANTITY_WORDS = ['百分之', '概率', '几率'];
/** The units a number before them always states a quantity in. */
const ALWAYS_UNITS = ['个百分点', '%', '％', '倍'];
/** 元 after a numeral that opens a word instead of a price: 二元对立, 一元论, 多元化. */
const YUAN_WORDS = new Set('对论化素');
/** 成 after a numeral that opens a word instead of a share: 一成不变, 万一成功, and 成为, 成长, 成熟… */
const CHENG_WORDS = new Set('不功为长熟就绩果立本员型形年人事交分色全了');
/** 千万 the adverb — 千万不要, 千万别 — rather than ten million. */
const QIANWAN_ADVERB = new Set('不别要莫勿记');
/** The words a bare figure after which is a print run, a price or sales: 「首印3000」, 「定价39」. */
const FIGURE_WORDS = ['首印', '起印', '印数', '印量', '定价', '售价', '销量'];
/** What may stand between such a word and its figure: 「首印数量约 3,000」, 「定价为 ¥39」. */
const FIGURE_LINKS = new Set('约为是达：:在近超过逾仅可预计估大概有将能至少多数量定于¥￥$');
const MAX_FIGURE_LINKS = 6;

/** Whether the figure starting at `start` follows one of the figure words, across at most a few linking characters. */
function followsFigureWord(chars: ReadonlyArray<string>, start: number): boolean {
  let at = start;
  for (let links = 0; links <= MAX_FIGURE_LINKS; links += 1) {
    if (FIGURE_WORDS.some((word) => at >= word.length && startsWith(chars, at - word.length, word))) return true;
    const before = chars[at - 1];
    if (before === undefined || !(FIGURE_LINKS.has(before) || SPACE.test(before))) return false;
    at -= 1;
  }
  return false;
}

/** Whether one numeral run, with what stands right after it and right before it, states a quantity. */
function runStatesQuantity(chars: ReadonlyArray<string>, run: NumeralRun): boolean {
  // The Book's own ordinal: 第3章, 第十二本.
  if (chars[run.start - 1] === '第') return false;
  const own = chars.slice(run.start, run.end);
  const magnitude = own.some((char) => MAGNITUDES.has(char));
  // An amount: a digit, or a counting numeral before a magnitude (八千, 三万) — not 一 or 两 alone, which open words.
  const amount = own.some(isDigit) || magnitude;
  const at = skipSpace(chars, run.end);
  const unit = chars[at];
  const after = chars[at + 1];
  if (ALWAYS_UNITS.some((word) => startsWith(chars, at, word))) return true;
  // 册, 本 and 块 count copies or yuan only after an amount: 「首印八千本」, 「3000本」 — not 「一本小说」, 「这一块」, 「上下两册」.
  if ((unit === '册' || unit === '本' || unit === '块') && amount) return true;
  if (unit === '元' && !YUAN_WORDS.has(after!)) return true;
  if (unit === '成' && !CHENG_WORDS.has(after!)) return true;
  // A number in 万 or 亿 with its coefficient: 5万, 三万, 十万, 百万 — not 万一, 亿万读者 or the adverb 千万, and not the
  // Book's own length, 「二十万字」 or 「十万余字」.
  const last = own.at(-1);
  if (last === '万' || last === '亿') {
    const word = own.join('');
    if (word === '万' || word === '亿' || word === '亿万' || word === '万万') return false;
    if (word === '千万' && QIANWAN_ADVERB.has(unit!)) return false;
    if (unit === '字' || ((unit === '余' || unit === '多') && after === '字')) return false;
    return true;
  }
  // A bare figure after 首印, 定价, 销量 or 印数.
  return amount && followsFigureWord(chars, run.start);
}

/** Whether one line of market text states a quantity nothing read in the Book can support. */
export function claimsQuantity(text: string): boolean {
  if (QUANTITY_WORDS.some((word) => text.includes(word))) return true;
  const chars = Array.from(text);
  for (const run of numeralRuns(chars, isQuantityNumeral)) {
    if (runStatesQuantity(chars, run)) return true;
  }
  return false;
}

// ---- scores in rewritten words -----------------------------------------------------------------------------------

/** The Chinese numerals a score is written with. */
const SCORE_NUMERALS = new Set('零一二三四五六七八九十两');
/** 分 after digits that is a fraction or a time, not points: 三分之一, 5分钟. */
const NOT_POINTS = new Set('之钟');
/** What may follow 分 in a score written in Chinese numerals: the line's end, a mark, or 以上 / 左右 and the like. */
const AFTER_CHINESE_SCORE = new Set('以左上下或至到及和与满');
const isDecimalPoint = (char: string | undefined): boolean => char === '.' || char === '．';

/** The value of a run of ASCII or full-width digits; `NaN` for any other script. */
function digitsValue(chars: ReadonlyArray<string>): number {
  let value = 0;
  for (const char of chars) {
    const code = char.codePointAt(0)!;
    const digit = code >= 0x30 && code <= 0x39 ? code - 0x30 : code >= 0xff10 && code <= 0xff19 ? code - 0xff10 : Number.NaN;
    value = value * 10 + digit;
  }
  return value;
}

/** The digits run starting at `start`, with one decimal part: its end and its whole-number value. */
function digitsAt(chars: ReadonlyArray<string>, start: number): { end: number; whole: ReadonlyArray<string> } {
  let end = start;
  while (isDigit(chars[end])) end += 1;
  const whole = chars.slice(start, end);
  if (isDecimalPoint(chars[end]) && isDigit(chars[end + 1])) {
    end += 1;
    while (isDigit(chars[end])) end += 1;
  }
  return { end, whole };
}

/**
 * Whether one rewritten line states a score: digits before 分 (「18分」, 「16.5 分」), a fraction over one of the profile's 满分
 * (「13 / 20」, never 「2/3」), the word 满分, or Chinese numerals before 分 where a score ends (「应给十八分。」) — not the adverb
 * 十分 or 十二分, 部分, 三分之一, 一分为二, 入木三分, or minutes 「5分钟」. `fullMarks` are the denominators a score is written
 * over: each item's 满分 and the total.
 */
export function claimsScore(text: string, fullMarks: ReadonlyArray<number>): boolean {
  if (text.includes('满分')) return true;
  const chars = Array.from(text);
  let index = 0;
  while (index < chars.length) {
    const char = chars[index]!;
    if (isDigit(char) && !isDigit(chars[index - 1]) && !isDecimalPoint(chars[index - 1])) {
      const numerator = digitsAt(chars, index);
      const at = skipSpace(chars, numerator.end);
      if (chars[at] === '分' && !NOT_POINTS.has(chars[at + 1]!)) return true;
      if (chars[at] === '/' || chars[at] === '／') {
        const from = skipSpace(chars, at + 1);
        if (isDigit(chars[from])) {
          const denominator = digitsAt(chars, from);
          const value = digitsValue(denominator.whole);
          if (Number.isNaN(value) || fullMarks.includes(value)) return true;
        }
      }
      index = numerator.end;
      continue;
    }
    if (SCORE_NUMERALS.has(char) && !SCORE_NUMERALS.has(chars[index - 1]!)) {
      let end = index;
      while (SCORE_NUMERALS.has(chars[end]!)) end += 1;
      const after = chars[end + 1];
      if (chars[end] === '分' && !(chars[index - 2] === '入' && chars[index - 1] === '木') &&
          (after === undefined || SPACE.test(after) || PUNCTUATION.test(after) || AFTER_CHINESE_SCORE.has(after))) {
        return true;
      }
      index = end;
      continue;
    }
    index += 1;
  }
  return false;
}

/** Whether one rewritten line names one of the conclusions — the editor's to choose — anywhere in it: 「建议暂缓」, 「不推荐」. */
export function claimsConclusion(text: string, conclusions: ReadonlyArray<string>): boolean {
  return conclusions.some((label) => label.length > 0 && text.includes(label));
}
