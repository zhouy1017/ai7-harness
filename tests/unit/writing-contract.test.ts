import { describe, expect, it } from 'vitest';
import {
  EXEMPLAR_COPY_WINDOW,
  EXEMPLAR_SHINGLE,
  EXEMPLAR_SHINGLE_SHARE,
  MAX_EXEMPLAR_GRAPHEMES,
  WRITING_SYNTHESIS_RESULT_SCHEMA,
  WRITING_UNIT_RESULT_SCHEMA,
  exemplarCopied,
  parseWritingSynthesis,
  parseWritingSynthesisMessageHeader,
  parseWritingUnitMessageHeader,
  parseWritingUnitResult,
  writingContract,
  writingContractDigest,
  writingExemplarLine,
  writingTypeGuidance,
  type WritingContractInput,
} from '../../src/service/writing/writing-contract.js';
import { writingReferenceLines } from '../../src/service/task-plan.js';
import { graphemeLength, writingDraftBlocks, writingWords } from '../../src/service/writing-tasks.js';
import { WRITING_CONSEQUENCE_TERMS, WRITING_REFERENCE_TERMS, writingDraftedLine, writingFieldTooLong, writingTaskLine } from '../../src/renderer/writing-task-labels.js';

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
    expect(contract.synthesisInstruction).toContain(`与范例相同的连续 ${EXEMPLAR_COPY_WINDOW} 个字以上的文字，或与一份范例大段近似的写法，都会让整份草稿被拒绝`);
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
  const draft = (paragraph: string) => ({ title: '标题', sections: [{ heading: '一', paragraphs: [paragraph] }] });
  // Synthetic text with no repeated run: `length` distinct ideographs from `from` on, in a scattered order.
  const synthetic = (length: number, from = 0x4e00) => Array.from({ length }, (_, index) => String.fromCodePoint(from + ((index * 37) % 2000))).join('');
  const FRESH = synthetic(240, 0x6000);

  it('refuses a draft holding twelve consecutive characters of an exemplar, and takes eleven among its own words', () => {
    const twelve = Array.from(EXEMPLAR).slice(0, EXEMPLAR_COPY_WINDOW).join('');
    const eleven = Array.from(EXEMPLAR).slice(0, EXEMPLAR_COPY_WINDOW - 1).join('');
    expect(exemplarCopied(draft(`开头${twelve}结尾`), input())).toEqual({ exemplar: 0, kind: 'verbatim' });
    expect(exemplarCopied(draft(`${FRESH}${eleven}结尾`), input())).toBeNull();
  });

  it('sees through spaces, punctuation and compatibility forms', () => {
    const copied = '一位老学者与一封神秘来信的故事';
    const disguised = '一位 老学者——与一封「神秘」来信的故事';
    expect(exemplarCopied(draft(copied), input())).toEqual({ exemplar: 0, kind: 'verbatim' });
    expect(exemplarCopied(draft(disguised), input())).toEqual({ exemplar: 0, kind: 'verbatim' });
    // Fullwidth digits read as the exemplar's own digits.
    const numbered = input({ exemplars: [{ bookTitle: '范例书', version: 1, text: '首印一万二千册于2026年发行完毕后加印', excerpt: false }] });
    expect(exemplarCopied(draft('首印一万二千册于２０２６年发行完毕'), numbered)).toEqual({ exemplar: 0, kind: 'verbatim' });
  });

  it('(a) compares the draft as one stream: a copy split across paragraphs, a heading or the title is still a copy', () => {
    expect(exemplarCopied({ title: '标题', sections: [{ heading: '一', paragraphs: ['一位老学者与一', '封神秘来信的故事'] }] }, input())).toEqual({ exemplar: 0, kind: 'verbatim' });
    expect(exemplarCopied({ title: '标题', sections: [{ heading: '一位老学者与一封', paragraphs: ['神秘来信的故事'] }] }, input())).toEqual({ exemplar: 0, kind: 'verbatim' });
    expect(exemplarCopied({ title: '一位老学者与一封神秘', sections: [{ heading: '来信的故事', paragraphs: [FRESH] }] }, input())).toEqual({ exemplar: 0, kind: 'verbatim' });
  });

  it('(b) refuses a near copy: one edit every eleven characters leaves no twelve-character run, and a quarter of the shingles', () => {
    const source = synthetic(240);
    const near = Array.from(source).map((character, index) => (index % 11 === 10 ? String.fromCodePoint(0x9f00 + index) : character)).join('');
    const exemplar = input({ exemplars: [{ bookTitle: '范例书', version: 3, text: source, excerpt: false }] });
    const copied = exemplarCopied(draft(near), exemplar);
    expect(copied).toMatchObject({ exemplar: 0, kind: 'near' });
    expect(copied?.kind === 'near' ? copied.share : 0).toBeGreaterThanOrEqual(EXEMPLAR_SHINGLE_SHARE);
    // The same edits every eight characters leave no shingle in common: the draft's own words.
    const rewritten = Array.from(source).map((character, index) => (index % 8 === 7 ? String.fromCodePoint(0x9f00 + index) : character)).join('');
    expect(exemplarCopied(draft(rewritten), exemplar)).toBeNull();
    const detail = parseWritingSynthesis(synthesis([near]), exemplar);
    expect(detail.ok ? '' : detail.detail).toMatch(new RegExp(`^草稿与范例《范例书》版本 3 的 ${EXEMPLAR_SHINGLE} 字片段重合达 \\d+%（不少于 25% 即算照抄）；范例只参照，不复制，这份草稿不予采用。$`, 'u'));
  });

  it('(c) leaves the house\'s boilerplate: a run in the exemplars of two different Books, letters and digits, an ISBN', () => {
    const notice = '本书由本社出版发行欢迎各地读者选购';
    const two = input({ exemplars: [
      { bookTitle: '范例书', version: 1, text: `${synthetic(40, 0x5000)}${notice}`, excerpt: false },
      { bookTitle: '另一本书', version: 1, text: `${synthetic(40, 0x5800)}${notice}`, excerpt: false },
    ] });
    expect(exemplarCopied(draft(`${FRESH}${notice}`), two)).toBeNull();
    // Two exemplars of the same Book are not the house's phrasing.
    const same = input({ exemplars: two.exemplars.map((exemplar) => ({ ...exemplar, bookTitle: '范例书' })) });
    expect(exemplarCopied(draft(`${FRESH}${notice}`), same)).toEqual({ exemplar: 0, kind: 'verbatim' });
    const numbers = input({ exemplars: [{ bookTitle: '范例书', version: 1, text: '书号ISBN978-7-02-000220-7，网址WWWEXAMPLECOM。', excerpt: false }] });
    expect(exemplarCopied(draft(`${FRESH}书号：ISBN 978-7-02-000220-7，${synthetic(30, 0x7000)}WWWEXAMPLECOM。`), numbers)).toBeNull();
    // The same words with a Book's own phrase beside the address are a copy.
    expect(exemplarCopied(draft(`${FRESH}网址WWWEXAMPLECOM。`), numbers)).toEqual({ exemplar: 0, kind: 'verbatim' });
  });

  it('(d) leaves a run the Book\'s own words share — its title, a character — and never the editor\'s 其他要求', () => {
    const shared = '合成书名讲述学者甲的一生故事';
    const own = input({
      book: { title: '合成书名讲述学者甲的一生故事', authors: [], editors: [], series: [] },
      exemplars: [{ bookTitle: '范例书', version: 1, text: `本社推荐${shared}，敬请期待。`, excerpt: false }],
    });
    expect(exemplarCopied(draft(`${shared}。`), own)).toBeNull();
    const notOwn = input({ exemplars: own.exemplars });
    expect(exemplarCopied(draft(`${shared}。`), notOwn)).toEqual({ exemplar: 0, kind: 'verbatim' });
    // Words pasted into 其他要求 from an exemplar whitelist nothing.
    expect(exemplarCopied(draft(EXEMPLAR), input({ requirements: EXEMPLAR }))).toEqual({ exemplar: 0, kind: 'verbatim' });
  });

  it('checks every part of the draft and every exemplar, and none when there is no exemplar', () => {
    const second = input({ exemplars: [input().exemplars[0]!, { bookTitle: '第二范例', version: 1, text: '第二份范例写着青铜重器与人心的长篇故事。', excerpt: false }] });
    expect(exemplarCopied({ title: '青铜重器与人心的长篇故事', sections: [{ heading: '一', paragraphs: ['无关'] }] }, second)).toEqual({ exemplar: 1, kind: 'verbatim' });
    expect(exemplarCopied({ title: '标题', sections: [{ heading: '一', paragraphs: ['无关', '青铜重器与人心的长篇故事。'] }] }, second)).toEqual({ exemplar: 1, kind: 'verbatim' });
    expect(exemplarCopied(draft(EXEMPLAR), input({ exemplars: [] }))).toBeNull();
  });

  it('is part of the parse: a copying synthesis is refused whole, never trimmed', () => {
    const parsed = parseWritingSynthesis(synthesis([EXEMPLAR]), input());
    expect(parsed).toMatchObject({ ok: false, code: 'exemplar-copied' });
    expect(parsed.ok ? '' : parsed.detail).toBe(`草稿与范例《范例书》版本 2 有连续 ${EXEMPLAR_COPY_WINDOW} 个字以上相同；范例只参照，不复制，这份草稿不予采用。`);
    expect(parseWritingSynthesis(synthesis(['全新的文字，与范例无关。']), input())).toMatchObject({ ok: true });
  });
});

describe('Writing Contract v1 — the parsers', () => {
  it('admits a synthesis of the closed shape within its bounds and nothing else', () => {
    const ok = parseWritingSynthesis(synthesis(['一段。']), input({ exemplars: [] }));
    expect(ok).toEqual({ ok: true, result: { schema: WRITING_SYNTHESIS_RESULT_SCHEMA, title: '合成标题', sections: [{ heading: '一', paragraphs: ['一段。'] }] } });
    const refusedCode = (text: string) => { const parsed = parseWritingSynthesis(text, input({ exemplars: [] })); return parsed.ok ? 'ok' : parsed.code; };
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
    expect(WRITING_REFERENCE_TERMS).toEqual(['梗概与人物', '评估结论与营销要点', '范例', '图书信息']);
    expect(writingTaskLine({ taskIntentId: 'x', typeId: 'promotion-article', typeLabel: '宣传文章', state: 'settled', label: '已完成', refusal: null })).toBe('写作任务「宣传文章」：已完成');
    expect(writingFieldTooLong('requirements')).toBe('其他要求最多 300 个字，只能写在一行里。');
    expect(writingFieldTooLong('audience')).toBe('受众最多 60 个字，只能写在一行里。');
    expect(writingDraftedLine('宣传文章', '10月9日 03:30')).toBe('「宣传文章」的草稿已写好（10月9日 03:30）；打开后成为这本书的宣传文章，处于「起草」阶段。');
  });
});
