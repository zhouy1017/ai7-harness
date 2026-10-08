import { RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, runReportReflectionRequestDigest } from '../../src/service/analysis/run-report-contract.js';
import { fixtureEntryKey, type ModelFixtureEntry } from '../../src/service/provider/model-fixture.js';
import {
  WRITING_SYNTHESIS_RESULT_SCHEMA,
  WRITING_UNIT_RESULT_SCHEMA,
  writingPassageSetDigest,
  writingRequestDigest,
  writingSynthesisRequestDigest,
  type WritingPassage,
  type WritingSynthesisResult,
} from '../../src/service/writing/writing-contract.js';
import type { WritingProjection } from '../../src/shared/protocol.js';

/**
 * Answer one prepared writing Task in an in-memory fixture, as the generator does: each unit with the authored passages of that
 * unit of exact sample1, and the synthesis with `synthesis` — whatever words a case needs, a copy of an exemplar included.
 */
export function answerWriting(entries: Map<string, ModelFixtureEntry>, prepared: WritingProjection, synthesis: unknown): void {
  const manifest = prepared.coverageManifest!;
  const contract = prepared.planEnvelope!.promptContractDigest;
  const put = (entry: ModelFixtureEntry): void => {
    entries.set(fixtureEntryKey(entry.unitOrdinal, entry.requestDigest), entry);
  };
  for (const unit of manifest.units) {
    put({
      unitOrdinal: unit.ordinal,
      requestDigest: writingRequestDigest(contract, unit.ordinal, unit.digest),
      attempt: null,
      contentDigest: null,
      response: {
        kind: 'unit-result',
        text: JSON.stringify({ schema: WRITING_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, passages: AUTHORED_WRITING_PASSAGES[unit.ordinal]! }),
        usage: { inputTokens: 1600, outputTokens: 120 },
      },
    });
  }
  const closed = manifest.units.map((unit) => ({
    unitOrdinal: unit.ordinal,
    result: { schema: WRITING_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, passages: AUTHORED_WRITING_PASSAGES[unit.ordinal]! },
  }));
  put({
    unitOrdinal: 0,
    requestDigest: writingSynthesisRequestDigest(contract, writingPassageSetDigest(closed)),
    attempt: null,
    contentDigest: null,
    response: { kind: 'unit-result', text: JSON.stringify(synthesis), usage: { inputTokens: 2600, outputTokens: 720 } },
  });
}

/** Answer a settled writing Run's Run Report reflection, so its report closes. */
export function answerWritingReflection(entries: Map<string, ModelFixtureEntry>, accountingDigest: string): void {
  const requestDigest = runReportReflectionRequestDigest(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, accountingDigest);
  entries.set(fixtureEntryKey(0, requestDigest), {
    unitOrdinal: 0,
    requestDigest,
    attempt: null,
    contentDigest: null,
    response: {
      kind: 'unit-result',
      text: JSON.stringify({ schema: 'ai7.analysis.run-report-reflection-result/1', items: [{ suggestion: '维持当前的单元预算。', basis: '没有缺口。' }] }),
      usage: { inputTokens: 900, outputTokens: 60 },
    },
  });
}

// 写作任务 (Issue #432, plan slice S84a): what J-07 drafts at its end, over the real store — a second Book, `写作旅程乙`, imported
// from exact sample1 (ADR 0043; an analysis kind reads only exact sample1's lineage, ADR 0044), with the editorial workspace
// profile at Revision 2 and a Main Editorial Role connection's reference, and a 宣传文章 drafted for it with J-07's audience and
// channel. The Book has no baseline analysis, no evaluation, no people and no 书系, and the house holds no 宣传文章 among its 范例,
// so the contract freezes each as absent. A writing contract freezes words and nothing of an identity or a time, and a unit's
// digest is a function of its blocks' contents, so a fresh import of exact sample1 under the same title asks the authored fixture
// `sample1-writing-authored` exactly the questions J-07's does.

export const WRITING_FIXTURE_IDENTITY = 'sample1-writing-authored';

/** J-07's second Book's title. */
export const WRITING_BOOK_TITLE = '写作旅程乙';

/** What J-07's editor writes in 新建文档 · 写作任务: the type, the audience, the channel, and no further requirement. */
export const WRITING_REQUEST = Object.freeze({
  typeId: 'promotion-article',
  audience: '喜欢历史与悬疑小说的读者',
  channel: '出版社微信公众号',
  requirements: null,
});

/**
 * The authored passages, by unit: each written after reading that unit of exact sample1, each citing — by its position in the
 * unit message — the blocks it rests on. A passage names what is in the text and nothing else.
 */
export const AUTHORED_WRITING_PASSAGES: Readonly<Record<number, ReadonlyArray<WritingPassage>>> = {
  1: [
    { kind: 'highlight', note: '开篇两句「识时务者为俊杰」「不识时务者为圣贤」对举，定下全书的思辨气质。', blockOrdinals: [5, 6] },
    { kind: 'character', note: '六十五岁的曾本之写信又撕信，心事难以出口。', blockOrdinals: [7, 8] },
    { kind: 'character', note: '郑雄是曾本之的弟子兼女婿，为他操办七十小寿。', blockOrdinals: [9, 14] },
    { kind: 'theme', note: '曾侯乙尊盘被视为青铜重器中的极品，是全书的核心器物。', blockOrdinals: [11] },
    { kind: 'highlight', note: '八年前另一位弟子被警察带走，从此在曾本之的话语里消失。', blockOrdinals: [13] },
  ],
  2: [
    { kind: 'character', note: '曾本之仍把写信收信当作日常往来的方式，不打电话，也不发电子邮件。', blockOrdinals: [2] },
    { kind: 'highlight', note: '曾本之收到一封用甲骨文写的信，写信人早在二十多年前去世。', blockOrdinals: [6, 7] },
    { kind: 'highlight', note: '信封写明他每周一下午独坐的地点，这本是外人不该知道的。', blockOrdinals: [8, 9] },
    { kind: 'theme', note: '当年在随州发掘曾侯乙大墓的往事在他心头浮现。', blockOrdinals: [11] },
  ],
  3: [
    { kind: 'highlight', note: '甲骨文常在梦中造访，春雷过后的东湖景致静中有动。', blockOrdinals: [2, 3] },
    { kind: 'highlight', note: '邮递员按古怪的地址把信送到他手中，信上只有四个甲骨文字。', blockOrdinals: [7, 10, 14] },
    { kind: 'character', note: '曾本之一眼认出那字迹的气韵，熟悉得让他不安。', blockOrdinals: [15, 16] },
  ],
  4: [
    { kind: 'highlight', note: '四个甲骨文写的是「拯之承启」，落款的印章是郝嘉。', blockOrdinals: [6, 7] },
    { kind: 'character', note: '郝嘉这个名字，曾本之熟悉的程度仅次于自己的名字。', blockOrdinals: [8] },
    { kind: 'character', note: '老友马跃之研究丝绸，与曾本之同为楚学院的栋梁。', blockOrdinals: [14] },
    { kind: 'theme', note: '两位老学者以丝绸和铜臭互相打趣，见出多年的情谊。', blockOrdinals: [15, 16] },
  ],
  5: [
    { kind: 'character', note: '安静在电话旁插话打趣，家常里透着温情。', blockOrdinals: [3] },
    { kind: 'highlight', note: '马跃之约曾本之同去宁波参加一个活动。', blockOrdinals: [6] },
    { kind: 'highlight', note: '马跃之欲言又止，追问郑雄下午参加的会议。', blockOrdinals: [9, 10] },
  ],
  6: [
    { kind: 'character', note: '郑雄在新省长首次露面的会上把他比作楚庄王。', blockOrdinals: [3] },
    { kind: 'theme', note: '曾本之对弟子的逢迎既恼又难以发作，学问与官场的张力浮现。', blockOrdinals: [6] },
    { kind: 'highlight', note: '曾本之决定暂时不向郑雄提起那封甲骨文来信。', blockOrdinals: [8] },
  ],
  7: [
    { kind: 'theme', note: '书房里挂着曾侯乙尊盘出土时拍下的黑白照片，是曾本之最珍爱的。', blockOrdinals: [2] },
    { kind: 'character', note: '外孙楚楚的童言让一家人笑成一团。', blockOrdinals: [5, 8] },
    { kind: 'character', note: '郑雄回家后，翁婿之间就做学问与做官有一番交锋。', blockOrdinals: [15, 16] },
  ],
  8: [
    { kind: 'character', note: '郑雄始终称岳父为先生，从未叫过爸爸。', blockOrdinals: [4] },
    { kind: 'highlight', note: '夜深人静，曾本之把那封古怪的来信摊开，用放大镜细看良久。', blockOrdinals: [6] },
  ],
};

/** The authored 宣传文章: a title and its sections, written from the passages and J-07's audience and channel alone. */
export const AUTHORED_WRITING_DRAFT: WritingSynthesisResult = {
  schema: WRITING_SYNTHESIS_RESULT_SCHEMA,
  title: '一封甲骨文来信，揭开青铜重器背后的心事',
  sections: [
    {
      heading: '一封不该存在的信',
      paragraphs: [
        '六十五岁的曾本之至今仍用书信与人往来。一个周一的下午，他在东湖边独坐时，收到一封用甲骨文写成的信，而写信的人早在二十多年前就已去世。',
        '信上只有四个字：拯之承启。落款的印章，是一个他再熟悉不过的名字。',
      ],
    },
    {
      heading: '青铜重器与人心',
      paragraphs: [
        '曾侯乙尊盘是青铜重器中的极品，也是曾本之一生的牵挂。围绕它，师徒、翁婿与老友之间的情谊和分歧，一点点浮出水面。',
        '弟子兼女婿郑雄在官场如鱼得水，老友马跃之欲言又止；八年前另一位弟子被带走的往事，也在沉默中等待回答。',
      ],
    },
    {
      heading: '写给喜欢历史与悬疑的你',
      paragraphs: [
        '《写作旅程乙》把学问、人情与谜团写在一起：这封甲骨文来信从何而来，四个字又指向哪一段被中断的往事？欢迎在公众号留言，说说你的猜想。',
      ],
    },
  ],
};
