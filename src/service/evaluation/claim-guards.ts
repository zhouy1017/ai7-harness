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
 * the cost stays linear in the line however its numerals fall. Each exclusion is scoped to the numeral that opens the
 * ordinary word — 这一块, 二元对立, 一成不变, 万一, 亿万读者, 千万不要, 十万火急, 全十二册, 入木三分, 十二分的, 一分为二, 三分之一,
 * a fraction such as 2/3 — so the same unit after any other numeral is still a claim: 「九块九」, 「49元」, 「七成年轻读者」,
 * 「十八分的高分」. And each is scoped to the word itself, by what follows the unit, so a claim that begins the same way is
 * still one (Issue #696): 「一块五」, 「一成人会买」, 「十五分一项」, 「十八分之多」.
 *
 * They are heuristics over one line, not a parse of it: the claims a review found escaping them are must-claim tests, and an
 * ordinary word they must leave alone is a must-pass test, but neither list is every claim or every word.
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
/** 元 after a Chinese numeral that opens a word instead of a price: 二元对立, 一元论. Never after digits or a magnitude. */
const YUAN_WORDS = new Set('对论化素');
/**
 * 成 after 一 that opens a word instead of a share: 一成不变, 万一成功. Never after any other numeral (七成年轻读者), and never
 * 人 or 年, which follow a share as readily as they make 成人 and 成年 (「仅一成人会买」, 「一成年轻读者」; Issue #696).
 */
const CHENG_WORDS = new Set('不功为长熟就绩果立本员型形事交分色全了');
/**
 * What before a lone 一 makes it the end of a word, so a 成 after it is a verb or a word of its own, never a share: 统一成,
 * 唯一成年, 单一成分 (Issue #702 review). 万一 is a numeral run of its own and reads the same way.
 */
const YI_WORD_HEADS = new Set('统唯单同归专划逐');
/**
 * What before 单 leaves it opening the word 单一 — a word's end such as 的, 很, 较为, 过于, or the line's start — so 一成 after
 * it is no share: 「单一成年人物的视角」, 「视角过于单一成年读者会厌倦」. 单 after anything else ends a word of its own — 订单, 退单,
 * 接单, 提单 — and 一成 after it is a share (Issue #708: the rule inverted, so a word outside a closed list is still caught).
 */
const DAN_YI_LEADS = new Set('的很较太于为更最不是也都和与并而且又既偏略稍常对极颇些得过种个了');
/**
 * What after 一块多 or 一块左右 keeps it a price: 钱, a count, 点 (「一块多点儿」), a sentence particle (「卖一块多吧」), the end of
 * the line — not 「放在一块多有意思」 (Issue #702 re-review, Issue #708).
 */
const PRICE_AFTER_ROUGHLY = new Set('钱一本的点吧呢吗啊呀嘛啦哦');
/** What before a lone 一 makes 一块 a piece rather than a yuan: 这一块, 每一块, 另一块 (Issue #702 review). */
const YI_KUAI_PIECE = new Set('这那哪每另同整');
/** 千万 the adverb — 千万不要, 千万别, 千万小心, 千万注意 — rather than ten million. */
const QIANWAN_ADVERB = new Set('不别要莫勿记小注留务当谨');
/** What before a small numeral and 册 names the Book's own volumes: 「全十二册」, 「共三册」, 「分两册」, 「上下两册」. */
const VOLUME_WORDS = new Set('全共分下');
/** Words a run of magnitudes opens instead of an amount: 十万火急. */
const MAGNITUDE_IDIOMS: Readonly<Record<string, string>> = { 十万: '火急' };
/** The words a bare figure after which is a print run, a price or sales: 「首印3000」, 「定价39」. */
const FIGURE_WORDS = ['首印', '起印', '印数', '印量', '定价', '售价', '销量'];
/** What may stand between such a word and its figure: 「首印数量约 3,000」, 「定价为 ¥39」. */
const FIGURE_LINKS = new Set('约为是达：:在近超过逾仅可预计估大概有将能至少多数量定于¥￥$');
const MAX_FIGURE_LINKS = 6;
/** What after a bare figure makes it a date or the Book's own count, never sales: 「2026年」, 「12章」, 「3版」. */
const NOT_FIGURE_UNITS = new Set('年月日号章节页岁字版次期届');

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

/** Whether 单 at `at` opens the word 单一 rather than ending one: what stands before it is no character it makes a word with. */
const opensDanYi = (chars: ReadonlyArray<string>, at: number): boolean => isTerminal(chars[at - 1]) || DAN_YI_LEADS.has(chars[at - 1]!);

/** Whether what stands at `at` keeps 一块多 or 一块左右 a price: 钱, a count, 的, 点, a sentence particle or the line's end. */
const priceFollows = (chars: ReadonlyArray<string>, at: number): boolean => PRICE_AFTER_ROUGHLY.has(chars[at]!) || isTerminal(chars[at]);

/** Whether one numeral run, with what stands right after it and right before it, states a quantity. */
function runStatesQuantity(chars: ReadonlyArray<string>, run: NumeralRun): boolean {
  // The Book's own ordinal: 第3章, 第十二本.
  const before = chars[run.start - 1];
  if (before === '第') return false;
  const own = chars.slice(run.start, run.end);
  const word = own.join('');
  const digit = own.some(isDigit);
  const magnitude = own.some((char) => MAGNITUDES.has(char));
  // An amount: a digit, or a counting numeral before a magnitude (八千, 三万) — not 一 or 两 alone, which open words.
  const amount = digit || magnitude;
  const at = skipSpace(chars, run.end);
  const unit = chars[at];
  const after = chars[at + 1];
  if (ALWAYS_UNITS.some((entry) => startsWith(chars, at, entry))) return true;
  // 本 counts copies only after an amount: 「首印八千本」, 「3000本」 — not 「一本小说」, 「两本书」.
  if (unit === '本' && amount) return true;
  // 块 is yuan after any numeral but a lone 一: 「九块九」, 「两块钱」 — not 「这一块」, 「一块儿」; after 一 too when 钱 or a numeral
  // follows it, 「一块钱一本」, 「一块五」, or 多 or 左右 and then 钱, a count or the line's end, 「一块多一本」, 「一块左右。」 (Issue
  // #696, Issue #702 review) — but not 「一块一块地」, 「放在一块多有意思」, nor after 这, 每 or 另: 「这一块多数读者」.
  if (unit === '块' && (word !== '一' || (!YI_KUAI_PIECE.has(before!) && (after === '钱' ||
    (after === '多' && priceFollows(chars, at + 2)) || (startsWith(chars, at + 1, '左右') && priceFollows(chars, at + 3)) ||
    (isQuantityNumeral(after) && !(after === '一' && chars[at + 2] === '块')))))) return true;
  // 册 counts copies after any numeral, 「首印五册」, but the Book's own volumes are no claim: 「全十二册」, 「上下两册」.
  if (unit === '册' && !(VOLUME_WORDS.has(before!) && !digit && !own.some((char) => char !== '十' && MAGNITUDES.has(char)))) return true;
  // 元 is a price unless a Chinese numeral opens a word: 「49元对标同类」 is one, 二元对立 and 一元论 are not.
  if (unit === '元' && !(YUAN_WORDS.has(after!) && !amount)) return true;
  // 成 is a share unless 一 opens a word: 「七成年轻读者」, 「三成本」 are shares; 一成不变, 万一成功 are not.
  // 一 that ends a word — 万一, 统一, 唯一 — is no share before 成: 「万一成年读者不买账」, 「统一成人物视角」 (Issue #702 review).
  // 单 before 一 ends a word of its own — 订单一成, 退单一成 — and then the 成 is a share again, unless 单 opens 单一: at the line's
  // start, after a space or punctuation, or after a word's end such as 的 or 较为 (Issue #708).
  if (unit === '成' && (word === '万一' || (word === '一' && YI_WORD_HEADS.has(before!) && !(before === '单' && !opensDanYi(chars, run.start - 1))))) return false;
  if (unit === '成' && !(CHENG_WORDS.has(after!) && own.at(-1) === '一')) return true;
  // A number in 万 or 亿 with its coefficient: 5万, 三万, 十万, 百万 — not 万一, 亿万读者, the adverb 千万, 十万火急, and not
  // the Book's own length, 「二十万字」 or 「十万余字」.
  const last = own.at(-1);
  if (last === '万' || last === '亿') {
    if (word === '万' || word === '亿' || word === '亿万' || word === '万万') return false;
    if (word === '千万' && QIANWAN_ADVERB.has(unit!)) return false;
    const idiom = MAGNITUDE_IDIOMS[word];
    if (idiom !== undefined && startsWith(chars, at, idiom)) return false;
    if (unit === '字' || ((unit === '余' || unit === '多') && after === '字')) return false;
    return true;
  }
  // A bare figure after 首印, 定价, 销量 or 印数 — not a year or the Book's own count after it: 「销量将在2026年回升」.
  return amount && !NOT_FIGURE_UNITS.has(unit!) && followsFigureWord(chars, run.start);
}

/** Whether one line of market text states a quantity nothing read in the Book can support. */
export function claimsQuantity(text: string): boolean {
  if (QUANTITY_WORDS.some((entry) => text.includes(entry))) return true;
  const chars = Array.from(text);
  for (const run of numeralRuns(chars, isQuantityNumeral)) {
    if (runStatesQuantity(chars, run)) return true;
  }
  return false;
}

// ---- scores in rewritten words -----------------------------------------------------------------------------------

/** The Chinese numerals a score is written with. */
const SCORE_NUMERALS = new Set('零一二三四五六七八九十两');
/** 分 after digits that is a time or a volume, not points: 5分钟, 3分册. 之 is checked on its own: a fraction, 3分之1. */
const NOT_POINTS_AFTER_DIGITS = new Set('钟册');
/** 分 after Chinese numerals that opens another word: 一分钟, 三分天下, 一分钱. 之 and 一 are checked on their own: 三分之一, 一分一毫. */
const NOT_POINTS_AFTER_CHINESE = new Set('钟天钱秒册');
const isDecimalPoint = (char: string | undefined): boolean => char === '.' || char === '．';
const isTerminal = (char: string | undefined): boolean => char === undefined || SPACE.test(char) || PUNCTUATION.test(char);

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
 * Whether 分 at `at` opens a fraction — 之 and then a numeral, 「3分之1」, 「三分之一」 — rather than points: 「十八分之多」 is a
 * score (Issue #696).
 */
const fraction = (chars: ReadonlyArray<string>, at: number): boolean =>
  chars[at + 1] === '之' && (isDigit(chars[at + 2]) || SCORE_NUMERALS.has(chars[at + 2]!));

/** Words that make a line about a score: a fraction over 5 in it is one (Issue #702 review). */
const SCORE_CONTEXT = ['评分', '打分', '得分', '分数', '给分', '评价', '星级', '高分', '低分'];
/**
 * What after 高分 or 低分 makes the 分 begin another word, so the line names no score (Issue #708): 高分子, 低分辨率, 高分贝, 提高分段.
 */
const NOT_SCORE_AFTER_HIGH_LOW = new Set('子辨贝段');

/** Whether a line names a score (`SCORE_CONTEXT`), read once from start to end: 高分子 and 低分辨率 name none. */
function namesScore(chars: ReadonlyArray<string>): boolean {
  for (let at = 0; at + 1 < chars.length; at += 1) {
    const word = `${chars[at]}${chars[at + 1]}`;
    if (!SCORE_CONTEXT.includes(word)) continue;
    const next = chars[at + 2];
    if ((word === '高分' || word === '低分') && next !== undefined && NOT_SCORE_AFTER_HIGH_LOW.has(next)) continue;
    return true;
  }
  return false;
}
/** The rescaled 5: a denominator only for a score in its context, never for 「前1/5」 or 「约4/5的读者」. */
const RESCALED_FIVE = 5;

/**
 * Whether a fraction over the rescaled 5 is a score (Issue #696, Issue #702 review): its numerator at most 5, and a half point
 * in it (「4.5/5」), the line ending or 分 or 星 following it (「4/5。」, 「4/5分」), or a score named in the line (「4 ／ 5 的评价」).
 */
function scoreOverFive(chars: ReadonlyArray<string>, numerator: { end: number; whole: ReadonlyArray<string> }, start: number,
  denominatorEnd: number, context: () => boolean): boolean {
  if (digitsValue(numerator.whole) > RESCALED_FIVE) return false;
  if (numerator.end > start + numerator.whole.length) return true;
  const next = chars[skipSpace(chars, denominatorEnd)];
  return isTerminal(next) || next === '分' || next === '星' || (next === '颗' && chars[skipSpace(chars, denominatorEnd) + 1] === '星') || context();
}

/** Whether 分 at `at`, after a run of digits, is a time: 「3分30秒」. */
function minutesAndSeconds(chars: ReadonlyArray<string>, at: number): boolean {
  let end = at + 1;
  if (!isDigit(chars[end])) return false;
  while (isDigit(chars[end])) end += 1;
  return chars[end] === '秒';
}

/**
 * The denominators a score in a rewritten line is written over (Issue #689 review): each item's 满分, the total of every item and
 * of the rated ones — a version with an item 不评 shows its total over the rest — and the rescaled 10 and 100. A score over 5
 * is read by `claimsScore` in its context (Issue #696, Issue #702 review).
 */
export function scoreDenominators(items: ReadonlyArray<{ readonly fullMarks: number; readonly notRated: string | null }>): number[] {
  const all = items.reduce((sum, item) => sum + item.fullMarks, 0);
  const rated = items.reduce((sum, item) => sum + (item.notRated === null ? item.fullMarks : 0), 0);
  return [...new Set([...items.map((item) => item.fullMarks), all, rated, 10, 100])];
}

/**
 * Whether one rewritten line states a score: digits before 分 (「18分」, 「16.5 分」), a fraction over one of `fullMarks`
 * (「13 / 20」, 「68/80」, 「8.5/10」, never 「2/3」), the word 满分, or Chinese numerals before 分 (「十八分的高分」, 「九分半」) —
 * not where 分 opens another word (三分之一, 一分钟, 三分天下, 一分钱), 一分为二, 入木三分, the adverb 十分, 十二分 before more words
 * (「十二分的功夫」), a time 「3分30秒」 or 第3分册. `fullMarks` are the denominators a score is written over.
 */
export function claimsScore(text: string, fullMarks: ReadonlyArray<number>): boolean {
  if (text.includes('满分')) return true;
  const chars = Array.from(text);
  let named: boolean | undefined;
  // Read once, the first time a fraction over 5 asks: the cost stays linear.
  const context = (): boolean => (named ??= namesScore(chars));
  let index = 0;
  while (index < chars.length) {
    const char = chars[index]!;
    if (isDigit(char) && !isDigit(chars[index - 1]) && !isDecimalPoint(chars[index - 1])) {
      const numerator = digitsAt(chars, index);
      const at = skipSpace(chars, numerator.end);
      if (chars[at] === '分' && chars[index - 1] !== '第' && !NOT_POINTS_AFTER_DIGITS.has(chars[at + 1]!) && !fraction(chars, at) &&
        !minutesAndSeconds(chars, at)) return true;
      if (chars[at] === '/' || chars[at] === '／') {
        const from = skipSpace(chars, at + 1);
        if (isDigit(chars[from])) {
          const denominator = digitsAt(chars, from);
          const value = digitsValue(denominator.whole);
          if (Number.isNaN(value) || fullMarks.includes(value)) return true;
          if (value === RESCALED_FIVE && scoreOverFive(chars, numerator, index, denominator.end, context)) return true;
        }
      }
      index = numerator.end;
      continue;
    }
    if (SCORE_NUMERALS.has(char) && !SCORE_NUMERALS.has(chars[index - 1]!)) {
      let end = index;
      while (SCORE_NUMERALS.has(chars[end]!)) end += 1;
      if (chars[end] === '分' && claimsChineseScore(chars, index, end)) return true;
      index = end;
      continue;
    }
    index += 1;
  }
  return false;
}

/** Whether Chinese numerals `[start, end)` before 分 at `end` state a score. */
function claimsChineseScore(chars: ReadonlyArray<string>, start: number, end: number): boolean {
  const run = chars.slice(start, end).join('');
  const after = chars[end + 1];
  if (NOT_POINTS_AFTER_CHINESE.has(after!) || fraction(chars, end)) return false;
  // 一 after 分 opens a word only in 一分一秒 and 一分一毫 or after 一 itself: 「十五分一项」 is a score (Issue #696).
  if (after === '一' && (run === '一' || chars[end + 2] === '秒')) return false;
  if (run === '一' && after === '为') return false;
  if (chars[start - 2] === '入' && chars[start - 1] === '木') return false;
  // The adverbs: 十分 always — 「十分凝练」, 「真是十分！」 — and 十二分 before more words, 「十二分的功夫」.
  if (run === '十') return false;
  if (run === '十二' && !isTerminal(after)) return false;
  if (chars[start - 1] === '第') return false;
  return true;
}

/** Whether one rewritten line names one of the conclusions — the editor's to choose — anywhere in it: 「建议暂缓」, 「不推荐」. */
export function claimsConclusion(text: string, conclusions: ReadonlyArray<string>): boolean {
  return conclusions.some((label) => label.length > 0 && text.includes(label));
}
