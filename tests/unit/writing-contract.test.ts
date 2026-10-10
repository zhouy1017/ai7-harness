import { describe, expect, it } from 'vitest';
import {
  EXEMPLAR_COPY_WINDOW,
  EXEMPLAR_COPY_WINDOW_ACROSS,
  EXEMPLAR_COPY_WORDS,
  EXEMPLAR_COPY_WORDS_ACROSS,
  EXEMPLAR_SHINGLE,
  EXEMPLAR_SHINGLE_SHARE,
  EXEMPLAR_SPAN,
  EXEMPLAR_SPAN_SHARE,
  EXEMPLAR_WORD_SHINGLE,
  EXEMPLAR_WORD_SPAN,
  MAX_EXEMPLAR_GRAPHEMES,
  WRITING_COPY_SIZES,
  WRITING_COPY_SIZES_V1,
  WRITING_PROMPT_CONTRACT_SCHEMA,
  WRITING_PROMPT_CONTRACT_SCHEMA_V1,
  WRITING_PROMPT_CONTRACT_SCHEMA_V3,
  MAX_WRITING_MATERIALS,
  MAX_WRITING_MATERIAL_GRAPHEMES,
  MAX_WRITING_MATERIALS_TOTAL_GRAPHEMES,
  WRITING_SYNTHESIS_RESULT_SCHEMA,
  WRITING_UNIT_RESULT_SCHEMA,
  exemplarCopied,
  exemplarCopyDetail,
  referenceCopied,
  parseWritingSynthesis,
  parseWritingSynthesisMessageHeader,
  parseWritingUnitMessageHeader,
  parseWritingUnitResult,
  writingContract,
  writingContractDigest,
  writingContractRules,
  writingCopySizes,
  writingExemplarLine,
  writingMaterialGraphemes,
  writingMaterialLine,
  writingRequestDigest,
  writingTypeGuidance,
  type WritingContractInput,
} from '../../src/service/writing/writing-contract.js';
import { WRITING_MATERIAL_GONE_LABEL, writingCopyNotDo, writingMaterialCopyNotDo, writingMaterialReferenceLine, writingReferenceLines } from '../../src/service/task-plan.js';
import { WRITING_MATERIAL_REFUSAL_PREFIX, writingKindDefinition, writingRecordedKindDefinition, writingSchemaDigest } from '../../src/service/writing/writing-kind.js';
import {
  WRITING_EXEMPLAR_ABSENT_TEXT,
  WRITING_EXEMPLAR_MOVED,
  WRITING_MATERIALS_STATEMENT,
  WRITING_MATERIALS_TOO_MANY,
  WRITING_MATERIAL_ABSENT_TEXT,
  writingMaterialDigest,
  writingMaterialMoved,
  writingMaterialOverBound,
  writingMaterialParagraph,
  writingMaterialsOverTotal,
} from '../../src/service/writing-tasks.js';
import { graphemeLength, writingDraftBlocks, writingWords } from '../../src/service/writing-tasks.js';
import {
  WRITING_CONSEQUENCE_TERMS,
  WRITING_REFERENCE_TERMS,
  WRITING_QUICK_PICK_TYPE,
  WRITING_STATUS,
  writingDraftedLine,
  writingFieldTooLong,
  writingMaterialLabel,
  writingMaterialsMore,
  writingOpenTaskTone,
  writingQuickFailed,
  writingQuickNote,
  writingQuickStarted,
  writingQuickStarting,
  writingTaskLine,
} from '../../src/renderer/writing-task-labels.js';

// Unit suite for Writing Contract v1 (Issue #432, plan slice S84a; V2-UX-DELIV-007, KB-004): the frozen input, the parsers, the
// reference bound that refuses a copied exemplar, and the words the plan and the page say. Synthetic words only.

const EXEMPLAR = '这是一份本社既有的宣传文章，讲述一位老学者与一封神秘来信的故事，文字简洁，结构分明。';

function input(overrides: Partial<WritingContractInput> = {}): WritingContractInput {
  return {
    type: { typeId: 'promotion-article', label: '宣传文章' },
    book: { title: '合成书名', authors: ['作者甲'], editors: [], series: [] },
    audience: '历史爱好者',
    channel: '公众号',
    requirements: null,
    synopsis: { text: '一位学者收到一封古怪的信。', excerpt: false, characters: [{ name: '学者甲', note: null }] },
    evaluation: { conclusion: '推荐出版', strengths: ['结构完整'], market: { readers: ['青年读者'], sellingPoints: ['悬疑'], channels: ['线上'] } },
    exemplars: [{ bookTitle: '范例书', version: 2, text: EXEMPLAR, excerpt: false }],
    ...overrides,
  };
}

/** A synthesis parsed under the contract a Task prepared now freezes. */
function parse(text: string, given: WritingContractInput) {
  return parseWritingSynthesis(text, writingContract(given));
}

function synthesis(paragraphs: ReadonlyArray<string>, title = '合成标题'): string {
  return JSON.stringify({ schema: WRITING_SYNTHESIS_RESULT_SCHEMA, title, sections: [{ heading: '一', paragraphs }] });
}

function code(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    return error instanceof Error && 'code' in error ? String((error as { code: unknown }).code) : 'thrown';
  }
  return 'no-error';
}

describe('Writing Contract v1 — the frozen input', () => {
  it('freezes words only, so the same request is the same contract and any changed word another', () => {
    const digest = writingContractDigest(writingContract(input()));
    expect(writingContractDigest(writingContract(input()))).toBe(digest);
    expect(writingContractDigest(writingContract(input({ audience: '历史爱好者们' })))).not.toBe(digest);
    expect(writingContractDigest(writingContract(input({ exemplars: [] })))).not.toBe(digest);
    expect(writingContractDigest(writingContract(input({ evaluation: null })))).not.toBe(digest);
    expect(writingContractDigest(writingContract(input({ synopsis: null })))).not.toBe(digest);
  });

  it('refuses an input outside its bounds', () => {
    expect(code(() => writingContract(input({ audience: '' })))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(input({ audience: '读'.repeat(61) })))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(input({ channel: '公众号\u0007' })))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(input({ requirements: '要'.repeat(301) })))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(input({ type: { typeId: '', label: '宣传文章' } })))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(input({ exemplars: [input().exemplars[0]!, input().exemplars[0]!, input().exemplars[0]!] })))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(input({ exemplars: [{ ...input().exemplars[0]!, version: 0 }] })))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(input({ exemplars: [{ ...input().exemplars[0]!, text: '文'.repeat(MAX_EXEMPLAR_GRAPHEMES + 1) }] })))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(input({ synopsis: { text: '梗概', excerpt: false, characters: Array.from({ length: 13 }, (_, index) => ({ name: `人${index}`, note: null })) } })))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(input({ evaluation: { conclusion: '推荐出版', strengths: [], market: { readers: ['一', '二', '三', '四', '五', '六'], sellingPoints: [], channels: [] } } })))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(input()))).toBe('no-error');
  });

  it('says what it references: each part, or that the Book has none, and the house\'s exemplars of the type', () => {
    const contract = writingContract(input());
    expect(contract.systemPrompt).toContain('起草一份「宣传文章」');
    expect(contract.systemPrompt).not.toContain(EXEMPLAR);
    expect(contract.synthesisInstruction).toContain(EXEMPLAR);
    // `/2` tells the model the Chinese and the English rules plainly (#704 P2-2).
    expect(contract.synthesisInstruction).toContain(`中文与一份范例在一句之内有连续 ${EXEMPLAR_COPY_WINDOW} 个字相同，或跨标点、空格有连续 ${EXEMPLAR_COPY_WINDOW_ACROSS} 个字相同`);
    expect(contract.synthesisInstruction).toContain(`英文等拉丁字母文字与一份范例在一句之内有连续 ${EXEMPLAR_COPY_WORDS} 个词相同，或跨标点有连续 ${EXEMPLAR_COPY_WORDS_ACROSS} 个词相同`);
    expect(contract.synthesisInstruction).toContain(`草稿的 ${EXEMPLAR_SHINGLE} 字片段与 ${EXEMPLAR_WORD_SHINGLE} 词片段合计有 25% 出现在这份范例中，或草稿任一 ${EXEMPLAR_SPAN} 字、${EXEMPLAR_WORD_SPAN} 词的段落中有 30% 的片段出现在这份范例中`);
    expect(contract.synthesisInstruction).toContain(writingTypeGuidance('promotion-article'));
    const bare = writingContract(input({ synopsis: null, evaluation: null, exemplars: [] }));
    expect(bare.synthesisInstruction).toContain('- 梗概与人物：本书尚无基线分析，本次不参考梗概与人物');
    expect(bare.synthesisInstruction).toContain('- 评估：本书尚无定稿的评估，本次不参考评估结论与营销要点');
    expect(bare.synthesisInstruction).toContain('本社暂无其他图书的宣传文章范例，本次不参考范例。');
    // An opening is said to be one, in the prompt and so in the contract.
    const cut = writingContract(input({
      synopsis: { text: '一位学者收到一封古怪的信。', excerpt: true, characters: [] },
      exemplars: [{ bookTitle: '范例书', version: 2, text: EXEMPLAR, excerpt: true }],
    }));
    expect(cut.input.synopsis?.excerpt).toBe(true);
    expect(cut.synthesisInstruction).toContain('- 梗概（节选开头）：一位学者收到一封古怪的信。');
    expect(cut.synthesisInstruction).toContain(`《范例书》版本 2（节选开头）：${EXEMPLAR}`);
    expect(writingContractDigest(cut)).not.toBe(writingContractDigest(writingContract(input({
      synopsis: { text: '一位学者收到一封古怪的信。', excerpt: false, characters: [] },
      exemplars: [{ bookTitle: '范例书', version: 2, text: EXEMPLAR, excerpt: true }],
    }))));
    expect(writingTypeGuidance('house-own-type')).toBe('按这一类文档的通常写法组织标题与各部分，语气贴合所写的受众与渠道。');
    expect(writingExemplarLine('新闻稿', [])).toBe('本社暂无其他图书的新闻稿范例，本次不参考范例');
    expect(writingExemplarLine('新闻稿', [{ bookTitle: '甲书', version: 3 }, { bookTitle: '乙书', version: 1 }]))
      .toBe('参照本社 2 份新闻稿范例（只参照，不照抄）：《甲书》版本 3、《乙书》版本 1');
    expect(writingReferenceLines(input())).toEqual([
      '基线分析的梗概与 1 位人物：学者甲',
      '定稿评估的结论「推荐出版」与主要优点 1 条，营销要点：目标读者 1 条、差异化卖点 1 条、渠道与策略 1 条',
      '参照本社 1 份宣传文章范例（只参照，不照抄）：《范例书》版本 2',
      '图书信息：《合成书名》 · 作者：作者甲 · 责编：未填写 · 书系：不在任何书系中',
      '你写的受众「历史爱好者」、渠道「公众号」',
    ]);
    expect(writingReferenceLines(input({ synopsis: { text: '梗', excerpt: true, characters: [] }, evaluation: { conclusion: '暂缓', strengths: [], market: null }, requirements: '一千字' }))).toEqual([
      '基线分析的梗概（节选开头）与 0 位人物',
      '定稿评估的结论「暂缓」与主要优点 0 条（这一版没有 AI7 初评的市场部分）',
      '参照本社 1 份宣传文章范例（只参照，不照抄）：《范例书》版本 2',
      '图书信息：《合成书名》 · 作者：作者甲 · 责编：未填写 · 书系：不在任何书系中',
      '你写的受众「历史爱好者」、渠道「公众号」与其他要求「一千字」',
    ]);
  });
});

describe('Writing Contract v1 — the reference bound (KB-004)', () => {
  // A verbatim run of twelve characters within punctuation: the bound's first rule.
  const verbatim = (exemplar = 0) => ({ exemplar, kind: 'verbatim', unit: 'character', run: EXEMPLAR_COPY_WINDOW });
  const draft = (paragraph: string) => ({ title: '标题', sections: [{ heading: '一', paragraphs: [paragraph] }] });
  // Synthetic text with no repeated run: `length` distinct ideographs from `from` on, in a scattered order.
  const synthetic = (length: number, from = 0x4e00) => Array.from({ length }, (_, index) => String.fromCodePoint(from + ((index * 37) % 2000))).join('');
  const FRESH = synthetic(240, 0x6000);

  it('refuses a draft holding twelve consecutive characters of an exemplar, and takes eleven among its own words', () => {
    const twelve = Array.from(EXEMPLAR).slice(0, EXEMPLAR_COPY_WINDOW).join('');
    const eleven = Array.from(EXEMPLAR).slice(0, EXEMPLAR_COPY_WINDOW - 1).join('');
    expect(exemplarCopied(draft(`开头${twelve}结尾`), input())).toEqual(verbatim());
    expect(exemplarCopied(draft(`${FRESH}${eleven}结尾`), input())).toBeNull();
  });

  it('sees through spaces and compatibility forms, and through punctuation from sixteen characters (#698)', () => {
    const copied = '一位老学者与一封神秘来信的故事';
    expect(exemplarCopied(draft(copied), input())).toEqual(verbatim());
    // A space between two clauses is a soft break, as punctuation is (#704 P3-3): 2, 8 and 5 characters are no run.
    expect(exemplarCopied(draft(`${FRESH}一位 老学者与一封神秘 来信的故事`), input())).toBeNull();
    const tagline = input({ exemplars: [{ bookTitle: '范例书', version: 1, text: '本书看点：人物形象鲜明 情节跌宕起伏', excerpt: false }] });
    expect(exemplarCopied(draft(`${FRESH}这本书人物形象鲜明 情节跌宕起伏`), tagline)).toBeNull();
    // A space beside a number is no clause break: 「他在 1998 年…」 is one run.
    const year = input({ exemplars: [{ bookTitle: '范例书', version: 1, text: '他在 1998 年收到一封来自远方的信', excerpt: false }] });
    expect(exemplarCopied(draft(`${FRESH}他在 1998 年收到一封来自远方的信`), year)).toEqual(verbatim());
    // A line break — a part's or a paragraph's edge — is none: a copy cut there is still a copy.
    expect(exemplarCopied({ title: '标题', sections: [{ heading: '一', paragraphs: [FRESH, '一位老学者与一封', '神秘来信的故事'] }] }, input())).toEqual(verbatim());
    // Punctuation inside a run raises it to sixteen: fifteen characters across it pass, seventeen are a copy.
    expect(exemplarCopied(draft(`${FRESH}一位老学者——与一封「神秘」来信的故事`), input())).toBeNull();
    expect(exemplarCopied(draft(`${FRESH}讲述一位老学者——与一封「神秘」来信的故事`), input()))
      .toEqual({ exemplar: 0, kind: 'verbatim', unit: 'character', run: EXEMPLAR_COPY_WINDOW_ACROSS, breaks: ['punctuation'] });
    // Fullwidth digits read as the exemplar's own digits.
    const numbered = input({ exemplars: [{ bookTitle: '范例书', version: 1, text: '首印一万二千册于2026年发行完毕后加印', excerpt: false }] });
    expect(exemplarCopied(draft('首印一万二千册于２０２６年发行完毕'), numbered)).toEqual(verbatim());
  });

  it('reads whitespace beside a line break as the paragraph edge\'s own, never as a space between clauses (#707)', () => {
    // An exemplar whose second paragraph is indented with U+3000, and one whose first ends in a trailing space: the fourteen
    // characters across the edge are a copy, as they are across a bare line break.
    const across = '老学者收到一封神秘来信的故事';
    const edge = (first: string, second: string) => input({ exemplars: [{ bookTitle: '范例书', version: 1, text: `${synthetic(30, 0x5000)}${first}\n${second}${synthetic(30, 0x5800)}`, excerpt: false }] });
    expect(exemplarCopied(draft(`${FRESH}${across}`), edge('老学者收到一封', '神秘来信的故事'))).toEqual(verbatim());
    expect(exemplarCopied(draft(`${FRESH}${across}`), edge('老学者收到一封', '　　神秘来信的故事'))).toEqual(verbatim());
    expect(exemplarCopied(draft(`${FRESH}${across}`), edge('老学者收到一封 ', '神秘来信的故事'))).toEqual(verbatim());
    expect(exemplarCopied(draft(`${FRESH}${across}`), edge('老学者收到一封　', '  神秘来信的故事'))).toEqual(verbatim());
    // The same in the draft: an indented paragraph of the draft is still one text with the one before it.
    expect(exemplarCopied({ title: '标题', sections: [{ heading: '一', paragraphs: [`${FRESH}老学者收到一封`, '　　神秘来信的故事'] }] }, input({ exemplars: [{ bookTitle: '范例书', version: 1, text: across, excerpt: false }] }))).toEqual(verbatim());
    // A space between two clauses on one line is still a soft break: the same fourteen characters across it are no run of twelve.
    expect(exemplarCopied(draft(`${FRESH}${across}`), edge('老学者收到一封 神秘来信的故事', ''))).toBeNull();
  });

  it('leaves an ISBN-10 ending in X, as `/1` did (#707)', () => {
    // Under `/2` the X went to the words and the nine digits before it fell short of the ISBN-like run, so the sixteen characters
    // around the number were a copy across an 外文词.
    const isbn = input({ exemplars: [{ bookTitle: '范例书', version: 1, text: '统一书号：7-5321-3456-X，定价三十八元，全国各地新华书店经销。', excerpt: false }] });
    expect(exemplarCopied(draft(`${FRESH}统一书号：7-5321-3456-X，定价三十八元`), isbn)).toBeNull();
    expect(exemplarCopied(draft(`${FRESH}统一书号：753213456X，定价三十八元`), isbn)).toBeNull();
    expect(exemplarCopied(draft(`${FRESH}统一书号：7-5321-3456-X，定价三十八元`), isbn, WRITING_COPY_SIZES_V1)).toBeNull();
    // A lower-case x is the same check digit; nine digits and a letter that is no X are a code, and no one's either.
    expect(exemplarCopied(draft(`${FRESH}统一书号：7-5321-3456-x，定价三十八元`), isbn)).toBeNull();
    // …while the words around it stay someone's: sixteen characters across the comma are a copy.
    expect(exemplarCopied(draft(`${FRESH}定价三十八元，全国各地新华书店经销。`), isbn))
      .toEqual({ exemplar: 0, kind: 'verbatim', unit: 'character', run: EXEMPLAR_COPY_WINDOW_ACROSS, breaks: ['punctuation'] });
  });

  it('names the breaks a run was copied across: 标点, 空格, an 外文词, a 数字 or an 编号 (#707)', () => {
    const detail = (text: string, given: WritingContractInput) => { const parsed = parse(synthesis([text]), given); return parsed.ok ? 'ok' : parsed.detail; };
    const sixteen = (middle: string) => `一位老学者与一封${middle}神秘来信的故事讲完`;
    const one = (text: string) => input({ exemplars: [{ bookTitle: '范例书', version: 1, text, excerpt: false }] });
    expect(exemplarCopied(draft(`${FRESH}${sixteen(' ')}`), one(sixteen(' '))))
      .toEqual({ exemplar: 0, kind: 'verbatim', unit: 'character', run: EXEMPLAR_COPY_WINDOW_ACROSS, breaks: ['space'] });
    expect(detail(`${FRESH}${sixteen(' ')}`, one(sixteen(' ')))).toBe(`草稿与范例《范例书》版本 1 有跨空格连续 ${EXEMPLAR_COPY_WINDOW_ACROSS} 个字以上相同；范例只参照，不复制，这份草稿不予采用。`);
    expect(exemplarCopied(draft(`${FRESH}${sixteen('Letter')}`), one(sixteen('Letter'))))
      .toEqual({ exemplar: 0, kind: 'verbatim', unit: 'character', run: EXEMPLAR_COPY_WINDOW_ACROSS, breaks: ['latin-word'] });
    expect(detail(`${FRESH}${sixteen('，又一 Letter ')}`, one(sixteen('，又一 Letter ')))).toBe(`草稿与范例《范例书》版本 1 有跨标点、空格、外文词连续 ${EXEMPLAR_COPY_WINDOW_ACROSS} 个字以上相同；范例只参照，不复制，这份草稿不予采用。`);
    // 「family farm was sold in 1987 and the orchard was cut down」: five words and six across a number, no eight within.
    const words = 'the family farm was sold in 1987 and the orchard was cut down for timber';
    const copyingWords = 'Their family farm was sold in 1987 and the orchard was cut down.';
    expect(exemplarCopied(draft(copyingWords), one(words))).toEqual({ exemplar: 0, kind: 'verbatim', unit: 'word', run: EXEMPLAR_COPY_WORDS_ACROSS, breaks: ['number'] });
    expect(detail(copyingWords, one(words))).toBe(`草稿与范例《范例书》版本 1 有跨数字连续 ${EXEMPLAR_COPY_WORDS_ACROSS} 个外文词以上相同；范例只参照，不复制，这份草稿不予采用。`);
    // 「big family farm, lot AB2026CX, was sold and the orchard was cut」: three, one and seven words across punctuation and a code.
    const coded = 'the big family farm, lot AB2026CX, was sold and the orchard was cut down for timber';
    expect(detail('Their big family farm, lot AB2026CX, was sold and the orchard was cut.', one(coded)))
      .toBe(`草稿与范例《范例书》版本 1 有跨标点、编号连续 ${EXEMPLAR_COPY_WORDS_ACROSS} 个外文词以上相同；范例只参照，不复制，这份草稿不予采用。`);
    // A run within punctuation names no break, under `/2` as under `/1`.
    expect(detail(EXEMPLAR, input())).toBe(`草稿与范例《范例书》版本 2 有连续 ${EXEMPLAR_COPY_WINDOW} 个字以上相同；范例只参照，不复制，这份草稿不予采用。`);
  });

  it('(a) compares the draft as one stream: a copy split across paragraphs, a heading or the title is still a copy', () => {
    expect(exemplarCopied({ title: '标题', sections: [{ heading: '一', paragraphs: ['一位老学者与一', '封神秘来信的故事'] }] }, input())).toEqual(verbatim());
    expect(exemplarCopied({ title: '标题', sections: [{ heading: '一位老学者与一封', paragraphs: ['神秘来信的故事'] }] }, input())).toEqual(verbatim());
    expect(exemplarCopied({ title: '一位老学者与一封神秘', sections: [{ heading: '来信的故事', paragraphs: [FRESH] }] }, input())).toEqual(verbatim());
  });

  // One edit every `period` characters: the character at each period's end replaced by one no exemplar holds.
  const edited = (text: string, period: number) => Array.from(text).map((character, index) => (index % period === period - 1 ? String.fromCodePoint(0x9f00 + index) : character)).join('');

  it('(b) refuses a draft that is mostly a lightly edited exemplar: a quarter of its six-character shingles', () => {
    const source = synthetic(240);
    const exemplar = input({ exemplars: [{ bookTitle: '范例书', version: 3, text: source, excerpt: false }] });
    // An edit every eleven characters leaves no twelve-character run, and five clean shingles of every eleven.
    const copied = exemplarCopied(draft(edited(source, 11)), exemplar);
    expect(copied).toMatchObject({ exemplar: 0, kind: 'near' });
    expect(copied?.kind === 'near' ? copied.share : 0).toBeGreaterThanOrEqual(EXEMPLAR_SHINGLE_SHARE);
    const detail = parse(synthesis([edited(source, 11)]), exemplar);
    expect(detail.ok ? '' : detail.detail).toMatch(new RegExp(`^草稿与范例《范例书》版本 3 的 ${EXEMPLAR_SHINGLE} 字片段重合达 \\d+%（不少于 25% 即算照抄）；范例只参照，不复制，这份草稿不予采用。$`, 'u'));
    // The known limit: an edit every five characters or fewer leaves no shingle in common.
    expect(exemplarCopied(draft(edited(source, 5)), exemplar)).toBeNull();
  });

  it('(b) refuses a near-copied paragraph inside a long draft: 30% of the shingles of one 200-character span', () => {
    const source = synthetic(700);
    const exemplar = input({ exemplars: [{ bookTitle: '范例书', version: 3, text: source, excerpt: false }] });
    const long = synthetic(1800, 0x6000);
    // 600 characters of the exemplar, an edit every twelve — no twelve-character run — amid 1,800 of the draft's own.
    const embedded = { title: '标题', sections: [{ heading: '一', paragraphs: [long.slice(0, 900), edited(source.slice(0, 600), 12), long.slice(900)] }] };
    const copied = exemplarCopied(embedded, exemplar);
    expect(copied).toMatchObject({ exemplar: 0, kind: 'span' });
    expect(copied?.kind === 'span' ? copied.share : 0).toBeGreaterThanOrEqual(EXEMPLAR_SPAN_SHARE);
    const detail = parse(JSON.stringify({ schema: WRITING_SYNTHESIS_RESULT_SCHEMA, title: '标题', sections: [{ heading: '一', paragraphs: [long.slice(0, 500), edited(source.slice(0, 590), 12), long.slice(500, 1000)] }] }), exemplar);
    expect(detail.ok ? '' : detail.detail).toMatch(new RegExp(`^草稿与范例《范例书》版本 3 在草稿的一段 ${EXEMPLAR_SPAN} 字中，${EXEMPLAR_SHINGLE} 字片段重合达 \\d+%（不少于 30% 即算照抄）；范例只参照，不复制，这份草稿不予采用。$`, 'u'));
    // Edits every nine characters are still caught inside a long draft; every eight pass there (a known limit).
    const within = (period: number) => ({ title: '标题', sections: [{ heading: '一', paragraphs: [long.slice(0, 900), edited(source.slice(0, 600), period), long.slice(900)] }] });
    expect(exemplarCopied(within(9), exemplar)).toMatchObject({ exemplar: 0, kind: 'span' });
    expect(exemplarCopied(within(8), exemplar)).toBeNull();
    // Ordinary prose that shares a few common phrases with the exemplar, here and there, is the draft's own.
    const phrases = [0, 120, 260, 400, 530].map((at) => source.slice(at, at + 8));
    const prose = { title: '标题', sections: [{ heading: '一', paragraphs: phrases.map((phrase, index) => `${long.slice(index * 300, index * 300 + 280)}${phrase}`) }] };
    expect(exemplarCopied(prose, exemplar)).toBeNull();
  });

  it('(c) leaves the house\'s boilerplate: a run in the exemplars of two different Books, letters and digits, an ISBN', () => {
    const notice = '本书由本社出版发行欢迎各地读者选购';
    const two = input({ exemplars: [
      { bookTitle: '范例书', version: 1, text: `${synthetic(40, 0x5000)}${notice}`, excerpt: false },
      { bookTitle: '另一本书', version: 1, text: `${synthetic(40, 0x5800)}${notice}`, excerpt: false },
    ] });
    expect(exemplarCopied(draft(`${FRESH}${notice}`), two)).toBeNull();
    // Two different Books that share a title are still two Books: each exemplar is one Book's, one per Book.
    const sameTitle = input({ exemplars: two.exemplars.map((exemplar) => ({ ...exemplar, bookTitle: '范例书' })) });
    expect(exemplarCopied(draft(`${FRESH}${notice}`), sameTitle)).toBeNull();
    // One Book's phrasing alone is that Book's words.
    expect(exemplarCopied(draft(`${FRESH}${notice}`), input({ exemplars: [two.exemplars[0]!] }))).toEqual(verbatim());
    const numbers = input({ exemplars: [{ bookTitle: '范例书', version: 1, text: '书号ISBN978-7-02-000220-7，网址WWWEXAMPLECOM。', excerpt: false }] });
    expect(exemplarCopied(draft(`${FRESH}书号：ISBN 978-7-02-000220-7，${synthetic(30, 0x7000)}WWWEXAMPLECOM。`), numbers)).toBeNull();
    // The same words with a Book's own phrase beside the address are a copy.
    // A Latin word is weighed on words, not characters (#704 P3-1): 「网址」 and one word are no copy.
    expect(exemplarCopied(draft(`${FRESH}网址WWWEXAMPLECOM。`), numbers)).toBeNull();
    // Only an ASCII run that looks like an identifier is no one's (#698): a URL, an e-mail address, a code of letters and digits.
    const addresses = input({ exemplars: [{ bookTitle: '范例书', version: 1, text: '详见官网www.example-press.com或来信editor@example-press.com索取样书编号AB2026CX请认准', excerpt: false }] });
    expect(exemplarCopied(draft(`${FRESH}详见官网www.example-press.com或来信editor@example-press.com索取样书编号AB2026CX请认准`), addresses)).toBeNull();
    // A URL keeps the Chinese on either side of it apart: no run of sixteen joins them across it.
    const site = input({ exemplars: [{ bookTitle: '范例书', version: 1, text: '欢迎读者登录本社官网www.example-press.com查询全部新书的出版信息', excerpt: false }] });
    expect(exemplarCopied(draft(`${FRESH}欢迎读者登录本社官网www.example-press.com查询全部新书的出版信息`), site)).toBeNull();
    // …while the words around them stay someone's: twelve characters of them are a copy.
    const around = input({ exemplars: [{ bookTitle: '范例书', version: 1, text: '编号AB2026CX的这套丛书收录了作者三十年来的全部散文', excerpt: false }] });
    expect(exemplarCopied(draft(`${FRESH}编号AB2026CX的这套丛书收录了作者三十年来的全部散文`), around)).toEqual(verbatim());
  });

  it('(d) leaves a run the Book\'s own words share — its title, a character — and never the editor\'s 其他要求', () => {
    const shared = '合成书名讲述学者甲的一生故事';
    const own = input({
      book: { title: '合成书名讲述学者甲的一生故事', authors: [], editors: [], series: [] },
      exemplars: [{ bookTitle: '范例书', version: 1, text: `本社推荐${shared}，敬请期待。`, excerpt: false }],
    });
    expect(exemplarCopied(draft(`${shared}。`), own)).toBeNull();
    const notOwn = input({ exemplars: own.exemplars });
    expect(exemplarCopied(draft(`${shared}。`), notOwn)).toEqual(verbatim());
    // Words pasted into 其他要求, 受众 or 渠道 from an exemplar whitelist nothing: they are the editor's, not the Book's.
    expect(exemplarCopied(draft(EXEMPLAR), input({ requirements: EXEMPLAR }))).toEqual(verbatim());
    const pasted = '一位老学者与一封神秘来信的故事';
    expect(exemplarCopied(draft(pasted), input({ audience: pasted }))).toEqual(verbatim());
    expect(exemplarCopied(draft(pasted), input({ channel: pasted }))).toEqual(verbatim());
  });

  it('checks every part of the draft and every exemplar, and none when there is no exemplar', () => {
    const second = input({ exemplars: [input().exemplars[0]!, { bookTitle: '第二范例', version: 1, text: '第二份范例写着青铜重器与人心的长篇故事。', excerpt: false }] });
    expect(exemplarCopied({ title: '青铜重器与人心的长篇故事', sections: [{ heading: '一', paragraphs: ['无关'] }] }, second)).toEqual(verbatim(1));
    expect(exemplarCopied({ title: '标题', sections: [{ heading: '一', paragraphs: ['无关', '青铜重器与人心的长篇故事。'] }] }, second)).toEqual(verbatim(1));
    expect(exemplarCopied(draft(EXEMPLAR), input({ exemplars: [] }))).toBeNull();
  });

  it('is part of the parse: a copying synthesis is refused whole, never trimmed', () => {
    const parsed = parse(synthesis([EXEMPLAR]), input());
    expect(parsed).toMatchObject({ ok: false, code: 'exemplar-copied' });
    expect(parsed.ok ? '' : parsed.detail).toBe(`草稿与范例《范例书》版本 2 有连续 ${EXEMPLAR_COPY_WINDOW} 个字以上相同；范例只参照，不复制，这份草稿不予采用。`);
    expect(parse(synthesis(['全新的文字，与范例无关。']), input())).toMatchObject({ ok: true });
  });
});

describe('Writing Contract v1 — the reference bound on realistic prose (#698)', () => {
  const draft = (...paragraphs: string[]) => ({ title: '标题', sections: [{ heading: '一', paragraphs }] });
  const one = (text: string, bookTitle = '远山') => input({ exemplars: [{ bookTitle, version: 1, text, excerpt: false }] });
  // The draft's own words around what it shares, written for this suite: a short draft that is mostly an exemplar is a near copy.
  const OWN_ZH = '这本书写的是江南小镇上一家老字号茶馆的百年兴衰。掌柜一家四代人守着祖传的手艺，在时代的风浪里几度沉浮，'
    + '却始终没有放下那把紫砂壶。作者用平实的口吻讲述街坊邻里的悲欢离合，让读者看见普通人如何在变迁中守住自己的本分。';
  const OWN_EN = 'This book tells the story of a small harbour town and the lighthouse keeper who kept its lamp burning for forty years. '
    + 'Through storms, shipwrecks and the slow arrival of modern radar, he writes letters to a daughter he has never met.';

  // A house's 宣传文章, written for this suite: two short clauses of stock praise among the Book's own words.
  const CHINESE = '《远山》是一部感人至深的长篇小说。作者以细腻的笔触描绘了一个山村家族三代人的命运沉浮。书中人物形象鲜明，情节跌宕起伏，语言质朴而有力量。这是一本值得反复品读的好书。';

  it('takes stock praise of two short clauses that one exemplar also holds: no run of sixteen across punctuation', () => {
    const own = draft(OWN_ZH, '这部作品讲述了一位乡村教师的半生经历，书中人物形象鲜明，情节跌宕起伏，值得每一位读者细细品味。');
    expect(exemplarCopied(own, one(CHINESE))).toBeNull();
    // Under the twelve-character rule alone, 「人物形象鲜明情节跌宕起伏」 refused the whole draft.
    expect(Array.from('人物形象鲜明情节跌宕起伏').length).toBe(EXEMPLAR_COPY_WINDOW);
    const parsed = parse(synthesis(own.sections[0]!.paragraphs), one(CHINESE));
    expect(parsed.ok).toBe(true);
  });

  it('refuses the same praise copied on past it: sixteen characters across punctuation', () => {
    const copying = draft(OWN_ZH, '这部作品讲述了一位乡村教师的半生经历。书中人物形象鲜明，情节跌宕起伏，语言质朴而有力量。');
    expect(exemplarCopied(copying, one(CHINESE))).toEqual({ exemplar: 0, kind: 'verbatim', unit: 'character', run: EXEMPLAR_COPY_WINDOW_ACROSS, breaks: ['punctuation'] });
    const parsed = parse(synthesis(copying.sections[0]!.paragraphs), one(CHINESE));
    expect(parsed.ok ? '' : parsed.detail).toBe(`草稿与范例《远山》版本 1 有跨标点连续 ${EXEMPLAR_COPY_WINDOW_ACROSS} 个字以上相同；范例只参照，不复制，这份草稿不予采用。`);
  });

  it('refuses a clause copied whole within its punctuation: twelve characters', () => {
    const copying = draft(OWN_ZH, '本书以细腻的笔触描绘了一个山村家族三代人的命运沉浮，读来令人动容。');
    expect(exemplarCopied(copying, one(CHINESE))).toEqual({ exemplar: 0, kind: 'verbatim', unit: 'character', run: EXEMPLAR_COPY_WINDOW });
    // A run within the draft's punctuation that the exemplar holds across its own counts from sixteen as well.
    const exemplar = one('他说：一个山村家族，三代人的命运沉浮，都在这里。');
    expect(exemplarCopied(draft(`${OWN_ZH}这是一个山村家族三代人的命运沉浮的故事。`), exemplar)).toBeNull();
  });

  // The same house's English copy, written for this suite.
  const ENGLISH = 'The Distant Hills is a quiet, luminous novel about three generations of a farming family. Told in alternating voices, '
    + 'it follows the family through drought, war and reconciliation, and asks what we owe to the land that raised us. '
    + 'A must-read for anyone who loves literary fiction. Order online at www.distant-hills.example.com, ISBN 978-7-5321-1234-5.';

  it('refuses English copied from an exemplar, which passed whole before: eight words within punctuation', () => {
    const copying = draft(OWN_EN, 'This novel follows one family over many years and asks what we owe to the land that raised us.');
    expect(exemplarCopied(copying, one(ENGLISH, 'Distant Hills'))).toEqual({ exemplar: 0, kind: 'verbatim', unit: 'word', run: EXEMPLAR_COPY_WORDS });
    const parsed = parse(synthesis(copying.sections[0]!.paragraphs), one(ENGLISH, 'Distant Hills'));
    expect(parsed.ok ? '' : parsed.detail).toBe(`草稿与范例《Distant Hills》版本 1 有连续 ${EXEMPLAR_COPY_WORDS} 个外文词以上相同；范例只参照，不复制，这份草稿不予采用。`);
    // Inside a Chinese draft, too.
    expect(exemplarCopied(draft(`这本书追问：what we owe to the land that raised us。`), one(ENGLISH))).toMatchObject({ kind: 'verbatim', unit: 'word' });
  });

  it('refuses English copied across punctuation from eleven words', () => {
    const copying = draft(OWN_EN, 'Told in alternating voices, it follows the family through drought, war and peace.');
    expect(exemplarCopied(copying, one(ENGLISH))).toEqual({ exemplar: 0, kind: 'verbatim', unit: 'word', run: EXEMPLAR_COPY_WORDS_ACROSS, breaks: ['punctuation'] });
    const parsed = parse(synthesis(copying.sections[0]!.paragraphs), one(ENGLISH));
    expect(parsed.ok ? '' : parsed.detail).toBe(`草稿与范例《远山》版本 1 有跨标点连续 ${EXEMPLAR_COPY_WORDS_ACROSS} 个外文词以上相同；范例只参照，不复制，这份草稿不予采用。`);
  });

  it('reads a hyphenated word as one word, and a curly apostrophe as a straight one', () => {
    // 「heart-warming and page-turning story of a」 is six words, not eight.
    const hyphens = one('This heart-warming and page-turning story of a village doctor won the hearts of its readers.');
    expect(exemplarCopied(draft(OWN_EN, 'Here is a heart-warming and page-turning story of a different kind.'), hyphens)).toBeNull();
    // …and eight words, two of them hyphenated, are a copy: 「the kind-hearted doctor who never turned sick-looking strangers」.
    const eight = one('Every reader will remember the kind-hearted doctor who never turned sick-looking strangers from her door.');
    expect(exemplarCopied(draft(OWN_EN, 'Readers meet the kind-hearted doctor who never turned sick-looking strangers into a story.'), eight))
      .toEqual({ exemplar: 0, kind: 'verbatim', unit: 'word', run: EXEMPLAR_COPY_WORDS });
    // The same words with either apostrophe are the same words: ten of them in a row are a copy.
    const apostrophes = one('It\u2019s the story of a village that wouldn\u2019t give up its doctor.');
    expect(exemplarCopied(draft(OWN_EN, "It's the story of a village that wouldn't give up on anything."), apostrophes))
      .toEqual({ exemplar: 0, kind: 'verbatim', unit: 'word', run: EXEMPLAR_COPY_WORDS });
  });

  // More of the draft's own words, written for this suite: with OWN_ZH, about 250 characters a near share does not mask.
  const OWN_ZH_MORE = '书里的每一章都从茶馆的一张旧桌子写起：谁坐过，谁在这里谈成了生意，谁又在这里与故人告别。'
    + '老掌柜记账用的毛笔、墙上褪色的价目牌、雨天屋檐下排队的挑夫，都在作者笔下一一复活，读来像翻开一本泛黄的家族相册。';
  const PAD = `${OWN_ZH}${OWN_ZH_MORE}`;

  it('never joins Latin words across Chinese text: terms that two texts name in the same order are no run (#704 P2-1)', () => {
    const terms = one('本书介绍 machine learning 与 deep learning 的基础，涵盖 neural network、computer vision 和 natural language processing 等主题。');
    expect(exemplarCopied(draft(PAD, '这本新书讲解 machine learning 和 deep learning，以 neural network 为主线，结合 computer vision 与 natural language processing 的案例。'), terms)).toBeNull();
    const scattered = one('他读过 the 也读过 old 还有 man 以及 and 加上 the 还有 sea 这是 a 然后 short 再是 novel 又 by 最后 hemingway。');
    expect(exemplarCopied(draft(PAD, '我们看 the 你们看 old 她们看 man 大家看 and 他们看 the 都来看 sea 也看 a 再看 short 又看 novel 来看 by 去看 hemingway。'), scattered)).toBeNull();
    // Nor is any word shingle: words that each stand between Chinese characters make no 4-word shingle, even of words an
    // exemplar holds in a row.
    const words = ['the', 'old', 'man', 'and', 'the', 'sea', 'is', 'a', 'short', 'novel', 'by', 'hemingway'];
    expect(exemplarCopied(draft(words.join(' 看 ')), one(words.join(' ')))).toBeNull();
    expect(exemplarCopied(draft(words.join(' 看 ')), one(words.join(' 读 ')))).toBeNull();
    // An English sentence copied whole inside Chinese text is still a copy, and so are eleven words across 「。」.
    expect(exemplarCopied(draft(PAD, '书中写道：and asks what we owe to the land that raised us。'), one('It asks what we owe to the land that raised us.')))
      .toEqual({ exemplar: 0, kind: 'verbatim', unit: 'word', run: EXEMPLAR_COPY_WORDS });
    expect(exemplarCopied(draft(PAD, '英文简介：Set in a quiet coastal town。The novel follows a retired 教师。'), one('Set in a quiet coastal town。The novel follows a retired teacher who receives a letter.')))
      .toEqual({ exemplar: 0, kind: 'verbatim', unit: 'word', run: EXEMPLAR_COPY_WORDS_ACROSS, breaks: ['punctuation'] });
  });

  it('weighs a Latin-script name or phrase inside Chinese text on its words, and only the Chinese on characters (#704 P3-1)', () => {
    expect(exemplarCopied(draft(PAD, '这部电影改编自 Stephen King 的同名小说。'), one('本片改编自 Stephen King 的同名小说，由新人导演执导。'))).toBeNull();
    expect(exemplarCopied(draft(PAD, '这是 Gabriel García Márquez 的代表作之一。'), one('《百年孤独》是 Gabriel García Márquez 的代表作之一。'))).toBeNull();
    // Accented words are words, compared without their accents: eight of them copied are a copy, with or without the accents.
    const french = one('Le roman raconte comment une institutrice à la retraite reçoit une lettre de son ancien élève.');
    expect(exemplarCopied(draft(PAD, 'Dans ce livre, une institutrice à la retraite reçoit une lettre inattendue.'), french))
      .toEqual({ exemplar: 0, kind: 'verbatim', unit: 'word', run: EXEMPLAR_COPY_WORDS });
    expect(exemplarCopied(draft(PAD, 'Dans ce livre, une institutrice a la retraite recoit une lettre inattendue.'), french))
      .toEqual({ exemplar: 0, kind: 'verbatim', unit: 'word', run: EXEMPLAR_COPY_WORDS });
    expect(exemplarCopied(draft(PAD, 'Une institutrice à la retraite, dans un village.'), french)).toBeNull();
  });

  it('takes English stock phrasing, numbers and identifiers that one exemplar also holds', () => {
    const own = draft(
      OWN_EN,
      'A sweeping saga of a fishing village, told with warmth and humour. A must-read for anyone who loves a good family story. '
      + 'Order online at www.distant-hills.example.com, ISBN 978-7-5321-1234-5.',
    );
    expect(exemplarCopied(own, one(ENGLISH))).toBeNull();
    // A number is no word: 「family farm was sold in 1987 and the」 is five words and two, no run of eight.
    const exemplar = one('the family farm was sold in 1987 and the orchard was cut down for timber');
    expect(exemplarCopied(draft(`${OWN_EN} Their family farm was sold in 1987 and the old orchard was cut down.`), exemplar)).toBeNull();
    // …and words copied on across it are a copy from eleven.
    expect(exemplarCopied(draft(`${OWN_EN} Their family farm was sold in 1987 and the orchard was cut down.`), exemplar))
      .toEqual({ exemplar: 0, kind: 'verbatim', unit: 'word', run: EXEMPLAR_COPY_WORDS_ACROSS, breaks: ['number'] });
  });

  // Synthetic English: distinct letter-only words, `count` of them from `from` on.
  const SYLLABLES = ['ba', 'ke', 'li', 'mo', 'nu', 'pa', 're', 'si', 'to', 'vu', 'da', 'fe', 'gi', 'ho', 'ju', 'la', 'me', 'ni', 'po', 'ru'];
  const english = (count: number, from = 0) => Array.from({ length: count }, (_, index) => {
    const n = from + index;
    return `${SYLLABLES[n % 20]}${SYLLABLES[Math.floor(n / 20) % 20]}${SYLLABLES[Math.floor(n / 400) % 20]}`;
  });
  const paragraphs = (words: ReadonlyArray<string>) => Array.from({ length: Math.ceil(words.length / 50) }, (_, index) => words.slice(index * 50, index * 50 + 50).join(' '));
  // One edit every `period` words: the word at each period's end replaced by one no exemplar holds.
  const editedWords = (words: ReadonlyArray<string>, period: number) => words.map((word, index) => (index % period === period - 1 ? `zz${SYLLABLES[index % 20]}${SYLLABLES[Math.floor(index / 20) % 20]}` : word));

  it('refuses a lightly edited English exemplar on word shingles: a quarter of its four-word shingles', () => {
    const source = english(300);
    const exemplar = one(source.join(' '));
    const copied = exemplarCopied(draft(editedWords(source, 6).join(' ')), exemplar);
    expect(copied).toMatchObject({ exemplar: 0, kind: 'near', unit: 'word' });
    expect(copied?.kind === 'near' ? copied.share : 0).toBeGreaterThanOrEqual(EXEMPLAR_SHINGLE_SHARE);
    const parsed = parse(synthesis(paragraphs(editedWords(source, 6).slice(0, 100))), exemplar);
    expect(parsed.ok ? '' : parsed.detail).toMatch(new RegExp(`^草稿与范例《远山》版本 1 的 ${EXEMPLAR_WORD_SHINGLE} 词片段重合达 \\d+%（不少于 25% 即算照抄）；范例只参照，不复制，这份草稿不予采用。$`, 'u'));
    // An edit every four words or fewer leaves no shingle in common.
    expect(exemplarCopied(draft(editedWords(source, 4).join(' ')), exemplar)).toBeNull();
  });

  it('refuses a near-copied English paragraph inside a long draft: 30% of the shingles of one 130-word span', () => {
    const source = english(300);
    const exemplar = one(source.join(' '));
    const long = english(2400, 1000);
    const within = (period: number, length: number) => draft(long.slice(0, 1200).join(' '), editedWords(source.slice(0, length), period).join(' '), long.slice(1200).join(' '));
    const copied = exemplarCopied(within(7, 200), exemplar);
    expect(copied).toMatchObject({ exemplar: 0, kind: 'span', unit: 'word' });
    const sections = [long.slice(0, 90), editedWords(source.slice(0, 95), 7), long.slice(90, 180)].map((words, index) => ({ heading: `Part ${index + 1}`, paragraphs: paragraphs(words) }));
    const parsed = parse(JSON.stringify({ schema: WRITING_SYNTHESIS_RESULT_SCHEMA, title: '标题', sections }), exemplar);
    expect(parsed.ok ? '' : parsed.detail).toMatch(new RegExp(`^草稿与范例《远山》版本 1 在草稿的一段 ${EXEMPLAR_WORD_SPAN} 个外文词中，${EXEMPLAR_WORD_SHINGLE} 词片段重合达 \\d+%（不少于 30% 即算照抄）；范例只参照，不复制，这份草稿不予采用。$`, 'u'));
    // A word span never spans Chinese text (#704 P2-1): under Chinese headings the copied section's 95 words hold no 130-word span.
    const chinese = sections.map((section, index) => ({ ...section, heading: `第${index + 1}部分` }));
    expect(exemplarCopied({ title: '标题', sections: chinese }, exemplar)).toBeNull();
    // The floor: a near-copied paragraph inside a long draft is caught only from a certain length — 90 words edited every 7.
    expect(exemplarCopied(within(7, 90), exemplar)).toMatchObject({ kind: 'span', unit: 'word' });
    expect(exemplarCopied(within(7, 89), exemplar)).toBeNull();
    expect(exemplarCopied(within(6, 118), exemplar)).toMatchObject({ kind: 'span', unit: 'word' });
    expect(exemplarCopied(within(6, 117), exemplar)).toBeNull();
  });
});

describe('Writing Contract v1 — the span rule\'s floor inside a long draft (#698)', () => {
  const synthetic = (length: number, from = 0x4e00) => Array.from({ length }, (_, index) => String.fromCodePoint(from + ((index * 37) % 2000))).join('');
  const edited = (text: string, period: number) => Array.from(text).map((character, index) => (index % period === period - 1 ? String.fromCodePoint(0x9f00 + index) : character)).join('');
  const source = synthetic(700);
  const exemplar = input({ exemplars: [{ bookTitle: '范例书', version: 3, text: source, excerpt: false }] });
  const long = synthetic(1800, 0x6000);
  const within = (period: number, length: number) => ({ title: '标题', sections: [{ heading: '一', paragraphs: [long.slice(0, 900), edited(source.slice(0, length), period), long.slice(900)] }] });

  it.each([[9, 178], [10, 148], [11, 130], [12, 118]])('catches a paragraph edited every %i characters from %i characters, and not one shorter', (period, floor) => {
    expect(exemplarCopied(within(period, floor), exemplar)).toMatchObject({ kind: 'span', unit: 'character' });
    expect(exemplarCopied(within(period, floor - 1), exemplar)).toBeNull();
  });

  // Punctuation every seven characters of the copy: no clean run of twelve stands within it, so edits every 13 to 16 are left
  // to the span rule; from 17 a clean run of 16 is verbatim.
  const punctuated = (text: string) => Array.from(text).map((character, index) => (index % 7 === 6 ? `${character}，` : character)).join('');
  const across = (period: number, length: number) => ({ title: '标题', sections: [{ heading: '一', paragraphs: [long.slice(0, 900), punctuated(edited(source.slice(0, length), period)), long.slice(900)] }] });

  it.each([[13, 112], [14, 106], [15, 100], [16, 94]])('catches a punctuated paragraph edited every %i characters from %i characters, and not one shorter', (period, floor) => {
    expect(exemplarCopied(across(period, floor), exemplar)).toMatchObject({ kind: 'span', unit: 'character' });
    expect(exemplarCopied(across(period, floor - 1), exemplar)).toBeNull();
  });

  it('catches a punctuated copy edited every 17 characters as verbatim, sixteen across punctuation', () => {
    expect(exemplarCopied(across(17, 60), exemplar)).toEqual({ exemplar: 0, kind: 'verbatim', unit: 'character', run: EXEMPLAR_COPY_WINDOW_ACROSS, breaks: ['punctuation'] });
  });

  it('lets a 120-character paragraph edited every ten characters pass, as the doc says', () => {
    expect(exemplarCopied(within(10, 120), exemplar)).toBeNull();
  });
});

describe('Writing Contract v1 — the parsers', () => {
  it('admits a synthesis of the closed shape within its bounds and nothing else', () => {
    const ok = parse(synthesis(['一段。']), input({ exemplars: [] }));
    expect(ok).toEqual({ ok: true, result: { schema: WRITING_SYNTHESIS_RESULT_SCHEMA, title: '合成标题', sections: [{ heading: '一', paragraphs: ['一段。'] }] } });
    const refusedCode = (text: string) => { const parsed = parse(text, input({ exemplars: [] })); return parsed.ok ? 'ok' : parsed.code; };
    expect(refusedCode('not json')).toBe('not-json');
    expect(refusedCode(JSON.stringify({ schema: WRITING_SYNTHESIS_RESULT_SCHEMA, title: '题', sections: [{ heading: '一', paragraphs: ['段'] }], extra: 1 }))).toBe('schema-invalid');
    expect(refusedCode(synthesis(['段'], '题'.repeat(61)))).toBe('schema-invalid');
    expect(refusedCode(synthesis(['段'], ' 题'))).toBe('schema-invalid');
    expect(refusedCode(synthesis([]))).toBe('schema-invalid');
    expect(refusedCode(synthesis(['段'.repeat(601)]))).toBe('schema-invalid');
    expect(refusedCode(synthesis(['一行\n两行']))).toBe('schema-invalid');
    expect(refusedCode(synthesis(Array.from({ length: 7 }, () => '段')))).toBe('schema-invalid');
    expect(refusedCode(JSON.stringify({ schema: WRITING_SYNTHESIS_RESULT_SCHEMA, title: '题', sections: [] }))).toBe('schema-invalid');
    expect(refusedCode(JSON.stringify({ schema: WRITING_SYNTHESIS_RESULT_SCHEMA, title: '题', sections: Array.from({ length: 9 }, () => ({ heading: '一', paragraphs: ['段'] })) }))).toBe('schema-invalid');
    expect(refusedCode(JSON.stringify({ schema: WRITING_SYNTHESIS_RESULT_SCHEMA, title: '题', sections: [{ heading: '标'.repeat(31), paragraphs: ['段'] }] }))).toBe('schema-invalid');
    expect(refusedCode(JSON.stringify({ schema: 'ai7.writing.synthesis-result/2', title: '题', sections: [{ heading: '一', paragraphs: ['段'] }] }))).toBe('schema-invalid');
    expect(refusedCode(`\`\`\`json\n${synthesis(['段'])}\n\`\`\``)).toBe('ok');
  });

  it('admits a unit result of known kinds within the unit, and refuses the rest', () => {
    const unit = (passages: unknown, unitOrdinal = 2) => JSON.stringify({ schema: WRITING_UNIT_RESULT_SCHEMA, unitOrdinal, passages });
    const passage = { kind: 'highlight', note: '看点', blockOrdinals: [1, 3] };
    expect(parseWritingUnitResult(unit([passage]), { unitOrdinal: 2, blockCount: 3 })).toMatchObject({ ok: true, result: { unitOrdinal: 2, passages: [passage] } });
    const failure = (text: string, blockCount = 3) => { const parsed = parseWritingUnitResult(text, { unitOrdinal: 2, blockCount }); return parsed.ok ? 'ok' : parsed.code; };
    expect(failure('{')).toBe('not-json');
    expect(failure(unit([passage], 3))).toBe('unit-mismatch');
    expect(failure(unit([{ ...passage, kind: 'quote' }]))).toBe('kind-unknown');
    expect(failure(unit([{ ...passage, blockOrdinals: [4] }]))).toBe('block-out-of-unit');
    expect(failure(unit([{ ...passage, blockOrdinals: [] }]))).toBe('schema-invalid');
    expect(failure(unit([{ ...passage, blockOrdinals: [1, 1] }]))).toBe('schema-invalid');
    expect(failure(unit([{ ...passage, note: '注'.repeat(201) }]))).toBe('schema-invalid');
    expect(failure(unit(Array.from({ length: 13 }, () => passage)))).toBe('schema-invalid');
    expect(failure(unit([{ ...passage, extra: true }]))).toBe('schema-invalid');
    expect(failure(unit([]))).toBe('ok');
  });

  it('tells its own headers apart from every other kind\'s', () => {
    const digest = 'a'.repeat(64);
    expect(parseWritingUnitMessageHeader(`写作单元 2/8 · 单元摘要 ${digest}\n…`)).toEqual({ ordinal: 2, total: 8, unitDigest: digest });
    expect(parseWritingUnitMessageHeader(`审稿意见单元 2/8 · 单元摘要 ${digest}`)).toBeNull();
    expect(parseWritingUnitMessageHeader(`写作单元 9/8 · 单元摘要 ${digest}`)).toBeNull();
    expect(parseWritingSynthesisMessageHeader(`写作综合 8/8 · 段落摘要 ${digest}`)).toEqual({ closed: 8, total: 8, setDigest: digest });
    expect(parseWritingSynthesisMessageHeader(`审稿意见综合 8/8 · 段落摘要 ${digest}`)).toBeNull();
  });
});

describe('the copy rules a frozen contract carries (the Commander\'s ruling on #704 P2-2)', () => {
  it('composes `/1` byte for byte as #688 froze it, and `/2` with every size', () => {
    // The digests #688's code gave these two inputs at dev@8415dd79: a Task recorded then still reads under its own contract.
    expect(writingContractDigest(writingContract(input(), 1))).toBe('074bbc8696b2157eaf3a427abc0e82a50ff91e5479db9d4efd6cde224f5fce08');
    expect(writingContractDigest(writingContract(input({ exemplars: [] }), 1))).toBe('055bd2e9c7167e3bc2490c968e8b8010aa2a9db263c1ee68f4f14114e0b6e61d');
    const v1 = writingContract(input(), 1);
    expect(v1.schema).toBe(WRITING_PROMPT_CONTRACT_SCHEMA_V1);
    expect(v1.synthesisInstruction).toContain('与范例相同的连续 12 个字以上的文字，或与一份范例大段近似的写法，都会让整份草稿被拒绝');
    expect(writingCopySizes(v1)).toEqual(WRITING_COPY_SIZES_V1);
    const v2 = writingContract(input());
    expect(v2.schema).toBe(WRITING_PROMPT_CONTRACT_SCHEMA);
    expect(writingCopySizes(v2)).toEqual(WRITING_COPY_SIZES);
    expect(v2).toMatchObject({
      exemplarCopyWindow: 12, exemplarCopyWindowAcross: 16, exemplarShingle: 6, exemplarShingleShare: 0.25, exemplarSpan: 200, exemplarSpanShare: 0.3,
      exemplarCopyWords: 8, exemplarCopyWordsAcross: 11, exemplarWordShingle: 4, exemplarWordSpan: 130,
    });
    expect(writingContractDigest(v2)).not.toBe(writingContractDigest(v1));
    expect([writingContractRules(v1), writingContractRules(v2)]).toEqual([1, 2]);
  });

  it('judges a `/1` Task under `/1`: 12 characters whatever stands inside them, and no English rule', () => {
    const praise = input({ exemplars: [{ bookTitle: '远山', version: 1, text: '《远山》是一部长篇小说。书中人物形象鲜明，情节跌宕起伏，语言质朴。', excerpt: false }] });
    const stock = synthesis([`${'这部作品讲述了江南小镇上一家老字号茶馆的百年兴衰，掌柜一家四代人守着祖传的手艺。'.repeat(3)}书中人物形象鲜明，情节跌宕起伏，值得一读。`]);
    const underV1 = parseWritingSynthesis(stock, writingContract(praise, 1));
    expect(underV1.ok ? '' : underV1.detail).toBe('草稿与范例《远山》版本 1 有连续 12 个字以上相同；范例只参照，不复制，这份草稿不予采用。');
    expect(parseWritingSynthesis(stock, writingContract(praise, 2))).toMatchObject({ ok: true });
    const english = input({ exemplars: [{ bookTitle: 'Hills', version: 1, text: 'It asks what we owe to the land that raised us, and who we become.', excerpt: false }] });
    const copied = synthesis(['This novel follows one family and asks what we owe to the land that raised us.']);
    expect(parseWritingSynthesis(copied, writingContract(english, 1))).toMatchObject({ ok: true });
    expect(parseWritingSynthesis(copied, writingContract(english, 2))).toMatchObject({ ok: false, code: 'exemplar-copied' });
    expect(exemplarCopied({ title: 't', sections: [{ heading: 'h', paragraphs: ['书中人物形象鲜明，情节跌宕起伏'] }] }, praise, WRITING_COPY_SIZES_V1))
      .toEqual({ exemplar: 0, kind: 'verbatim', unit: 'character', run: 12 });
  });

  it('words the plan\'s 不会做 line in the Task\'s own rules', () => {
    expect(writingCopyNotDo(1)).toBe('不照抄范例：与范例有连续 12 个字以上相同的草稿不予采用');
    expect(writingCopyNotDo(2)).toBe('不照抄范例：与范例有连续 12 个字以上相同（跨标点、空格或外文词时 16 个字；拉丁字母文字为 8 个词，跨标点、数字或编号时 11 个词）的草稿不予采用');
  });
});

describe('资料库 under 允许参考 — `ai7.writing.prompt-contract/3` (Issue #428)', () => {
  const MATERIAL = { title: '参考资料甲', paragraphs: ['这份资料记录了一座古城在战火中保存青铜器的经过，馆员连夜把器物装箱转移。', '转移途中遭遇暴雨，木箱浸水，修复工作持续了三年。'] };
  const withMaterials = (materials: NonNullable<WritingContractInput['materials']>, overrides: Partial<WritingContractInput> = {}) => input({ ...overrides, materials });
  const draft = (paragraph: string) => ({ title: '标题', sections: [{ heading: '一', paragraphs: [paragraph] }] });
  const synthetic = (length: number, from = 0x4e00) => Array.from({ length }, (_, index) => String.fromCodePoint(from + ((index * 37) % 2000))).join('');
  const FRESH = synthetic(240, 0x6000);

  it('keeps `/1` and `/2` byte for byte: a Task that lists no item has no `materials` and its digest is the one dev@799e73a0 gave', () => {
    // The digests the code before Issue #428 gave these inputs (origin/dev 799e73a0): `/1` and `/2` Tasks keep their contracts.
    expect(writingContractDigest(writingContract(input(), 1))).toBe('074bbc8696b2157eaf3a427abc0e82a50ff91e5479db9d4efd6cde224f5fce08');
    expect(writingContractDigest(writingContract(input(), 2))).toBe('076f78acd70cf7987f6f43c9fd35f2d4d83f546903c532b903c94ee9339f4bf6');
    expect(writingContractDigest(writingContract(input({ exemplars: [] }), 1))).toBe('055bd2e9c7167e3bc2490c968e8b8010aa2a9db263c1ee68f4f14114e0b6e61d');
    expect(writingContractDigest(writingContract(input({ exemplars: [] }), 2))).toBe('929e4a334a92987c183e9e38c28bd6d3d4176dd80ec8216b6cc9eba9207686f3');
    expect('materials' in writingContract(input()).input).toBe(false);
    expect(writingContract(input()).schema).toBe(WRITING_PROMPT_CONTRACT_SCHEMA);
  });

  it('composes `/3` with the items\' paragraphs as reference material, under `/2`\'s sizes, and its own exact bytes', () => {
    const v3 = writingContract(withMaterials([MATERIAL]));
    const v2 = writingContract(input());
    expect(v3.schema).toBe(WRITING_PROMPT_CONTRACT_SCHEMA_V3);
    expect(writingContractRules(v3)).toBe(2);
    expect(writingCopySizes(v3)).toEqual(WRITING_COPY_SIZES);
    // The unit step reads the manuscript as `/2`'s does: the items reach only the synthesis.
    expect(v3.systemPrompt).toBe(v2.systemPrompt);
    expect(v3.synthesisInstruction).toContain('参照资料库的 1 份资料（只参照，不照抄）：《参考资料甲》。它们是编辑自己收集的资料，只用来核对事实与背景');
    expect(v3.synthesisInstruction).toContain(`中文与一份资料在一句之内有连续 ${EXEMPLAR_COPY_WINDOW} 个字相同，或跨标点、空格有连续 ${EXEMPLAR_COPY_WINDOW_ACROSS} 个字相同`);
    expect(v3.synthesisInstruction).toContain(`《参考资料甲》第 1 段：${MATERIAL.paragraphs[0]}`);
    expect(v3.synthesisInstruction).toContain(`《参考资料甲》第 2 段：${MATERIAL.paragraphs[1]}`);
    // `/2`'s instruction is `/3`'s without the item lines.
    expect(v3.synthesisInstruction.split('\n').filter((line) => !line.includes('资料')).join('\n')).toBe(v2.synthesisInstruction.split('\n').filter((line) => !line.includes('资料')).join('\n'));
    // The same words are the same contract; any changed word of an item another. `/3`'s bytes are pinned as `/1`'s and `/2`'s are.
    const digest = writingContractDigest(v3);
    expect(digest).toBe('8a24b882fd2eefb4ac08c977f54260c9c76c94275664784117cd29ba492a0150');
    expect(writingContractDigest(writingContract(withMaterials([{ ...MATERIAL }])))).toBe(digest);
    expect(writingContractDigest(writingContract(withMaterials([{ ...MATERIAL, title: '参考资料乙' }])))).not.toBe(digest);
    expect(writingContractDigest(writingContract(withMaterials([{ ...MATERIAL, paragraphs: [MATERIAL.paragraphs[0]!] }])))).not.toBe(digest);
    expect(writingContractDigest(v3)).not.toBe(writingContractDigest(v2));
    // A paragraph's own line break reads as `／` inside the prompt, as an exemplar's does.
    expect(writingContract(withMaterials([{ title: '甲', paragraphs: ['上一行\n下一行'] }])).synthesisInstruction).toContain('《甲》第 1 段：上一行／下一行');
  });

  it('bounds the items whole: four at most, each 3,000 characters, 6,000 together — and never under `/1`', () => {
    expect([MAX_WRITING_MATERIALS, MAX_WRITING_MATERIAL_GRAPHEMES, MAX_WRITING_MATERIALS_TOTAL_GRAPHEMES]).toEqual([4, 3_000, 6_000]);
    const sized = (characters: number, title = '甲') => ({ title, paragraphs: ['文'.repeat(characters - 1), '字'] });
    expect(writingMaterialGraphemes(sized(3_000).paragraphs)).toBe(3_000);
    expect(writingMaterialGraphemes(['👩‍👩‍👧中'])).toBe(2);
    expect(code(() => writingContract(withMaterials([sized(3_000)])))).toBe('no-error');
    expect(code(() => writingContract(withMaterials([sized(3_001)])))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(withMaterials([sized(3_000, '甲'), sized(3_000, '乙')])))).toBe('no-error');
    expect(code(() => writingContract(withMaterials([sized(3_000, '甲'), sized(2_999, '乙'), sized(2, '丙')])))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(withMaterials(['甲', '乙', '丙', '丁'].map((title) => sized(10, title)))))).toBe('no-error');
    expect(code(() => writingContract(withMaterials(['甲', '乙', '丙', '丁', '戊'].map((title) => sized(10, title)))))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(withMaterials([])))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(withMaterials([{ title: '甲', paragraphs: [] }])))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(withMaterials([{ title: '甲', paragraphs: ['  '] }])))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(withMaterials([{ title: '甲', paragraphs: ['控制\u0007字符'] }])))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(withMaterials([{ title: '', paragraphs: ['一段'] }])))).toBe('WRITING_INPUT_INVALID');
    expect(code(() => writingContract(withMaterials([MATERIAL]), 1))).toBe('WRITING_INPUT_INVALID');
  });

  it('judges a 资料库 item exactly as a 范例: the same verdict, kind, unit and share for every rule', () => {
    const text = MATERIAL.paragraphs.join('\n');
    const asExemplar = input({ exemplars: [{ bookTitle: '参考资料甲', version: 1, text, excerpt: false }] });
    const asMaterial = withMaterials([MATERIAL], { exemplars: [] });
    const edited = (value: string, period: number) => Array.from(value).map((character, index) => (index % period === period - 1 ? String.fromCodePoint(0x9f00 + index) : character)).join('');
    const long = synthetic(240);
    const longExemplar = input({ exemplars: [{ bookTitle: '长资料', version: 1, text: long, excerpt: false }] });
    const longMaterial = withMaterials([{ title: '长资料', paragraphs: [long] }], { exemplars: [] });
    const english = 'The archive kept every letter the old curator wrote to the museum during the long winter of the war.';
    const englishExemplar = input({ exemplars: [{ bookTitle: 'Archive', version: 1, text: english, excerpt: false }] });
    const englishMaterial = withMaterials([{ title: 'Archive', paragraphs: [english] }], { exemplars: [] });
    const cases: Array<[ReturnType<typeof draft>, WritingContractInput, WritingContractInput]> = [
      // Twelve characters within punctuation; eleven; sixteen across it.
      [draft(`${FRESH}在战火中保存青铜器的经过`), asExemplar, asMaterial],
      [draft(`${FRESH}${Array.from('在战火中保存青铜器的经过').slice(0, 11).join('')}`), asExemplar, asMaterial],
      [draft(`${FRESH}转移途中遭遇暴雨，木箱浸水，修复工作`), asExemplar, asMaterial],
      // A lightly edited copy (near), and an edited paragraph inside a long draft (span).
      [draft(edited(long, 10)), longExemplar, longMaterial],
      [draft(`${synthetic(400, 0x7000)}${edited(long.slice(0, 180), 9)}`), longExemplar, longMaterial],
      // Latin-script words: eight within punctuation.
      [draft('In those years the old curator wrote to the museum during the long winter.'), englishExemplar, englishMaterial],
      // Nothing copied.
      [draft(FRESH), asExemplar, asMaterial],
    ];
    for (const [given, exemplar, material] of cases) {
      const byExemplar = exemplarCopied(given, exemplar);
      const byMaterial = referenceCopied(given, material);
      expect(byMaterial === null ? null : { ...byMaterial, source: undefined }).toEqual(byExemplar === null ? null : { ...byExemplar, source: undefined });
      if (byMaterial !== null) expect(byMaterial.source).toBe('material');
    }
    expect(cases.filter(([given, , material]) => referenceCopied(given, material) !== null)).toHaveLength(5);
  });

  it('refuses a draft that copies an item — material-copied, in words naming it — and lets the Book\'s own words stand', () => {
    const contract = writingContract(withMaterials([MATERIAL]));
    const copied = parseWritingSynthesis(synthesis([`${FRESH}在战火中保存青铜器的经过`]), contract);
    expect(copied).toEqual({ ok: false, code: 'material-copied', detail: `草稿与资料库资料《参考资料甲》有连续 ${EXEMPLAR_COPY_WINDOW} 个字以上相同；资料只参照，不复制，这份草稿不予采用。` });
    const across = parseWritingSynthesis(synthesis([`${FRESH}转移途中遭遇暴雨，木箱浸水，修复工作`]), contract);
    expect(across.ok ? '' : across.detail).toBe(`草稿与资料库资料《参考资料甲》有跨标点连续 ${EXEMPLAR_COPY_WINDOW_ACROSS} 个字以上相同；资料只参照，不复制，这份草稿不予采用。`);
    expect(parseWritingSynthesis(synthesis([FRESH]), contract)).toMatchObject({ ok: true });
    // An exemplar copied is still the exemplar's refusal, judged first.
    expect(parseWritingSynthesis(synthesis([EXEMPLAR]), contract)).toMatchObject({ ok: false, code: 'exemplar-copied' });
    // The second item is named as the second.
    const second = withMaterials([{ title: '无关资料', paragraphs: [synthetic(40, 0x8000)] }, MATERIAL]);
    const named = referenceCopied(draft(`${FRESH}在战火中保存青铜器的经过`), second)!;
    expect(named).toMatchObject({ exemplar: 1, source: 'material' });
    expect(exemplarCopyDetail(named, second)).toContain('《参考资料甲》');
    // A run the Book's own reference words hold is the Book's, for an item as for a 范例.
    const own = withMaterials([{ title: '甲', paragraphs: ['一位学者收到一封古怪的信，信里只有四个字。'] }], { exemplars: [] });
    expect(referenceCopied(draft(`${FRESH}一位学者收到一封古怪的信`), own)).toBeNull();
    // Words two items share exempt nothing — unlike the house phrasing two other Books' exemplars share.
    const twice = '书中人物形象鲜明而情节跌宕起伏引人入胜';
    const twoItems = withMaterials([{ title: '甲', paragraphs: [`${synthetic(20, 0x5000)}${twice}`] }, { title: '乙', paragraphs: [`${synthetic(20, 0x5400)}${twice}`] }], { exemplars: [] });
    expect(referenceCopied(draft(`${FRESH}${twice}`), twoItems)).toMatchObject({ exemplar: 0, kind: 'verbatim', source: 'material' });
    const twoExemplars = input({ exemplars: [{ bookTitle: '甲书', version: 1, text: `${synthetic(20, 0x5000)}${twice}`, excerpt: false }, { bookTitle: '乙书', version: 1, text: `${synthetic(20, 0x5400)}${twice}`, excerpt: false }] });
    expect(exemplarCopied(draft(`${FRESH}${twice}`), twoExemplars)).toBeNull();
    // The kind reads a refused draft as its own gap reason.
    const step = writingKindDefinition(withMaterials([MATERIAL])).crossUnit!.step!;
    expect(step.refusalReason!('material-copied', 'x')).toBe(`${WRITING_MATERIAL_REFUSAL_PREFIX}x`);
    expect(WRITING_MATERIAL_REFUSAL_PREFIX).toBe('全书综合写出的草稿被拒绝（material-copied），AI7 没有写出可以打开的草稿：');
  });

  it('says what the plan lists and refuses in words, and reads a Task whose pinned build is gone as one that builds nothing', () => {
    const source = { materialId: '11111111-1111-4111-8111-111111111111', indexDigest: 'c'.repeat(64), title: '参考资料甲', characters: 1234, sha256: 'd'.repeat(64) };
    expect(writingMaterialLine([MATERIAL])).toBe('参照资料库的 1 份资料（只参照，不照抄）：《参考资料甲》');
    expect(writingMaterialReferenceLine({ source, refusal: null })).toBe('资料库资料《参考资料甲》：已提取 1,234 字，按计划冻结的索引版本读取（只参照，不照抄）');
    expect(writingMaterialReferenceLine({ source, refusal: { code: 'MATERIAL_INDEX_MOVED', message: 'x' } }))
      .toBe('资料库资料《参考资料甲》：已提取 1,234 字，按计划冻结的索引版本读取（只参照，不照抄）——计划冻结的索引版本已不在本机，这次起草不能开始');
    expect(writingMaterialReferenceLine({ source, refusal: { code: 'MATERIAL_REFERENCE_UNAVAILABLE', message: 'x' } }))
      .toBe('资料库资料《参考资料甲》：已提取 1,234 字，按计划冻结的索引版本读取（只参照，不照抄）——这份资料现在不能列进这本书任务的「允许参考」，这次起草不能开始');
    // The item's line follows the 范例's, and a plan without items has none.
    const lines = writingReferenceLines(withMaterials([MATERIAL]), true, [{ source, refusal: null }]);
    expect(lines[3]).toBe(writingMaterialReferenceLine({ source, refusal: null }));
    expect(writingReferenceLines(input())).toHaveLength(5);
    expect(lines).toHaveLength(6);
    expect(writingMaterialCopyNotDo()).toBe(`不照抄资料库资料：与任何一份资料有连续 ${EXEMPLAR_COPY_WINDOW} 个字以上相同（规则与范例相同，每份资料各自比较）的草稿不予采用`);
    expect(WRITING_MATERIAL_GONE_LABEL).toBe('不能开始 · 参考资料已不在本机');
    expect(writingMaterialMoved('参考资料甲')).toBe('这次起草参考的资料《参考资料甲》，计划冻结的索引版本已不在本机，不能开始；请改计划重做：在「交付物」的新建文档 · 写作任务里重新准备计划。');
    expect(WRITING_MATERIALS_STATEMENT).toBe('勾选的资料列进这次计划的「允许参考」，按计划冻结的索引版本读取：每份不超过 3,000 字，合计不超过 6,000 字，最多 4 份；只参照，不照抄。');
    expect(writingMaterialOverBound(12_345)).toBe('这份资料已提取 12,345 字，超过每份 3,000 字的上限，不能列进「允许参考」。');
    expect(writingMaterialsOverTotal(6_001)).toBe('所选资料合计已提取 6,001 字，超过合计 6,000 字的上限；请少选几份。');
    expect(WRITING_MATERIALS_TOO_MANY).toBe('写作任务最多参考 4 份资料库资料；请少选几份。');
    // A paragraph is taken as the Book's own words are, never cut; the reference pins the words taken.
    expect(writingMaterialParagraph(' 甲\t乙 ')).toBe('甲 乙');
    expect(writingMaterialParagraph('文'.repeat(5_000))).toHaveLength(5_000);
    expect(writingMaterialDigest(['一'])).not.toBe(writingMaterialDigest(['一', '二']));
    // Gone at its pinned build: the row's digest, and nothing built or read.
    const recorded = writingRecordedKindDefinition(withMaterials([{ title: '参考资料甲', paragraphs: [WRITING_MATERIAL_ABSENT_TEXT] }]), 'a'.repeat(64), 2,
      { code: 'MATERIAL_INDEX_MOVED', message: writingMaterialMoved('参考资料甲') });
    expect(recorded.promptContractDigest).toBe('a'.repeat(64));
    expect(code(() => recorded.buildUnitMessage({} as never, 1, new Map()))).toBe('MATERIAL_INDEX_MOVED');
    expect(code(() => recorded.crossUnit!.step!.buildMessage([], 1))).toBe('MATERIAL_INDEX_MOVED');
  });
});

describe('a recorded Task whose 范例 is no longer here (#688 re-review)', () => {
  it('reads under the row\'s own contract digest, and builds no request and reads no answer', () => {
    const recorded = writingRecordedKindDefinition(input({ exemplars: [{ bookTitle: '范例书', version: 2, text: WRITING_EXEMPLAR_ABSENT_TEXT, excerpt: false }] }), 'a'.repeat(64), 2);
    expect(recorded.promptContractDigest).toBe('a'.repeat(64));
    expect(recorded.crossUnit!.promptContractDigest).toBe('a'.repeat(64));
    expect(recorded.schemaDigest).toBe(writingSchemaDigest('a'.repeat(64)));
    expect(recorded.requestDigest(1, 'b'.repeat(64))).toBe(writingRequestDigest('a'.repeat(64), 1, 'b'.repeat(64)));
    expect(recorded.requestDigest(1, 'b'.repeat(64))).not.toBe(writingKindDefinition(input()).requestDigest(1, 'b'.repeat(64)));
    expect(code(() => recorded.buildUnitMessage({} as never, 1, new Map()))).toBe('WRITING_EXEMPLAR_MOVED');
    expect(code(() => recorded.crossUnit!.step!.buildMessage([], 1))).toBe('WRITING_EXEMPLAR_MOVED');
    expect(code(() => recorded.crossUnit!.step!.parse('{}', []))).toBe('WRITING_EXEMPLAR_MOVED');
    expect(WRITING_EXEMPLAR_MOVED).toBe('这次起草参照的范例已不在本机，不能再开始；可以用「新建文档…」重新准备。');
  });
});

describe('the draft and the page\'s words', () => {
  it('opens the draft as a title, then each heading with its paragraphs', () => {
    expect(writingDraftBlocks({ title: '题', sections: [{ heading: '甲', paragraphs: ['一', '二'] }, { heading: '乙', paragraphs: ['三'] }] }))
      .toEqual([
        { kind: 'title', level: 1, text: '题' },
        { kind: 'heading', level: 1, text: '甲' },
        { kind: 'paragraph', level: null, text: '一' },
        { kind: 'paragraph', level: null, text: '二' },
        { kind: 'heading', level: 1, text: '乙' },
        { kind: 'paragraph', level: null, text: '三' },
      ]);
  });

  it('takes the Book\'s words as the contract can: stray characters as spaces, the opening when longer', () => {
    expect(writingWords('  甲 乙\t丙  ', 10)).toBe('甲 乙 丙');
    expect(writingWords('一二三四五', 3)).toBe('一二三');
    expect(graphemeLength('👩‍👩‍👧中')).toBe(2);
  });

  it('speaks editor-surfaces §9\'s words', () => {
    expect(WRITING_CONSEQUENCE_TERMS).toEqual(['会读取', '会发送', '不会做', '费用']);
    expect(WRITING_REFERENCE_TERMS).toEqual(['梗概与人物', '评估结论与营销要点', '范例', '资料库', '图书信息']);
    // 资料库 under 允许参考 (Issue #428): one box per item, and how many more were not listed.
    expect(writingMaterialLabel({ title: '参考资料甲', characters: 1234, scope: 'book' })).toBe('《参考资料甲》 · 已提取 1,234 字 · 本书资料');
    expect(writingMaterialLabel({ title: '社级资料', characters: 80, scope: 'house' })).toBe('《社级资料》 · 已提取 80 字 · 社级资料');
    expect(writingMaterialsMore(3)).toBe('另有 3 份资料没有列出：这里只列最近收进的几份。');
    expect(writingTaskLine({ taskIntentId: 'x', typeId: 'promotion-article', typeLabel: '宣传文章', state: 'settled', label: '已完成', refusal: null, planEnvelopeDigest: null })).toBe('写作任务「宣传文章」：已完成');
    // 查看任务 is the page's next step only for a prepared Task nothing refuses; a Task whose 范例 is gone is quiet (#698).
    expect(writingOpenTaskTone({ state: 'prepared', refusal: null })).toBe('primary');
    expect(writingOpenTaskTone({ state: 'prepared', refusal: WRITING_EXEMPLAR_MOVED })).toBe('quiet');
    expect(writingOpenTaskTone({ state: 'settled', refusal: null })).toBe('quiet');
    expect(writingOpenTaskTone({ state: 'executing', refusal: null })).toBe('quiet');
    expect(writingFieldTooLong('requirements')).toBe('其他要求最多 300 个字，只能写在一行里。');
    expect(writingFieldTooLong('audience')).toBe('受众最多 60 个字，只能写在一行里。');
    expect(writingDraftedLine('宣传文章', '10月9日 03:30')).toBe('「宣传文章」的草稿已写好（10月9日 03:30）；打开后成为这本书的宣传文章，处于「起草」阶段。');
    // 快速开始 under the writing 默认执行规则 (S84b).
    expect(writingQuickNote('写作任务 · 第 1 版')).toBe('按默认执行规则「写作任务 · 第 1 版」：先准备计划，与规则一致时直接开始；有任何不同都会停在计划上。');
    expect(writingQuickStarting('写作任务 · 第 1 版')).toBe('正在按默认执行规则「写作任务 · 第 1 版」开始…');
    expect(writingQuickStarted('写作任务 · 第 1 版', false)).toBe('已按默认执行规则「写作任务 · 第 1 版」开始写作任务。');
    expect(writingQuickStarted('写作任务 · 第 1 版', true)).toBe('已按默认执行规则「写作任务 · 第 1 版」记下这项写作任务；当前启动没有可执行的路由，派发前已阻止。');
    expect(WRITING_STATUS.quickFailed).toBe('快速开始没有开始任务；计划已准备，可在任务计划里开始。');
    // A failed call keeps where the plan stands after the service's words (#701 review P3-5).
    // The service's words may say the plan can no longer start: nothing promises that it can (#701 re-review P3-2).
    expect(writingQuickFailed('任务计划已经变化；无法记录该授权。')).toBe('任务计划已经变化；无法记录该授权。快速开始没有开始任务；请在任务计划里查看。');
    expect(writingQuickFailed('这项任务已经开始了。')).not.toContain('可在任务计划里开始');
    expect(writingQuickFailed('  ')).toBe(WRITING_STATUS.quickFailed);
    expect(WRITING_STATUS.quickNoPlan).toBe('这份计划还没有冻结，没有按规则开始；请看过计划后再开始。');
    expect(WRITING_QUICK_PICK_TYPE).toBe('选好类型后显示：快速开始按这一类文档的默认执行规则开始。');
  });
});
