import type { EditorialStore } from '../../src/service/store.js';
import {
  EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA,
  type EvaluationRewriteObservation,
  type EvaluationRewriteSynthesisResult,
} from '../../src/service/evaluation/evaluation-rewrite-contract.js';
import type { EvaluationContent, EvaluationRecordProjection } from '../../src/shared/protocol.js';

// 按我的评分重写评语 (Issue #429, plan slice S81b2): the steps J-11 takes before it asks AI7 to rewrite, over the real store — a
// version begun from AI7's 初评 once the one before it is 定稿, two of AI7's scores replaced by the editor's with their reasons,
// and saved. A rewrite's contract freezes the version's words and nothing of its identity, time or ordinal, so the version
// reached here asks the authored fixture `sample1-evaluation-rewrite-authored` exactly the questions J-11's 第 15 版 does.

export const EVALUATION_REWRITE_FIXTURE_IDENTITY = 'sample1-evaluation-rewrite-authored';

/** The editor's two departures from AI7's 初评 in J-11's 第 15 版: the item, the editor's score, and the reason ticked. */
export const J11_REWRITE_ADJUSTMENTS: ReadonlyArray<{ itemId: string; score: number; reason: 'too-high' | 'insufficient-basis' }> = [
  { itemId: 'structure-and-coherence', score: 13, reason: 'too-high' },
  { itemId: 'readers-and-market', score: 10, reason: 'insufficient-basis' },
];

/**
 * A version begun from AI7's latest 初评 with J-11's 第 15 版 words: AI7's scores and comments but the two adjustments above,
 * saved once. The version before it must be 定稿.
 */
export function beginRewriteAsJ11(store: EditorialStore, bookId: string): EvaluationRecordProjection {
  const draft = store.startEvaluation(bookId, true).record!;
  const content: EvaluationContent = {
    ...draft.content,
    items: draft.content.items.map((item) => {
      const adjusted = J11_REWRITE_ADJUSTMENTS.find((entry) => entry.itemId === item.itemId);
      return adjusted === undefined ? item : { ...item, score: adjusted.score, adjustment: { reasons: [adjusted.reason], note: null } };
    }),
  };
  return store.saveEvaluation({ bookId, recordId: draft.recordId, expectedEntries: 1, content, finalize: false }).record!;
}

const observe = (itemId: string, note: string, ...blockOrdinals: number[]): EvaluationRewriteObservation => ({ itemId, note, blockOrdinals });

/**
 * One unit's observations each: what in that reading range bears out the editor's score of an item. They rest on the same
 * blocks the authored 初评 and 审稿意见 fixtures cite — each written after reading exact `sample1` (ADR 0043) — and say how those
 * passages read against the editor's scores; 读者与市场潜力 finds nothing in the Book, as the 初评 found nothing.
 */
export const AUTHORED_REWRITE_OBSERVATIONS: Readonly<Record<number, ReadonlyArray<EvaluationRewriteObservation>>> = {
  1: [
    observe('literary-quality', '对仗的题辞与写信又撕信的细节以动作写心事，支持较高的文学品质评价。', 5, 6, 8, 14),
    observe('structure-and-coherence', '开篇以写不成的信引出悬念，伏笔清楚，这是结构上的长处。', 13, 14),
    observe('chinese-language', '叙述语言凝练，长句中夹用俗语。', 10),
  ],
  2: [
    observe('structure-and-coherence', '甲骨文来信构成核心悬念，后文必须承接它，结构的成败系于此。', 6, 7),
    observe('chinese-language', '个别比喻略显俗套，语言分不宜再高。', 11),
  ],
  3: [
    observe('literary-quality', '春景与梦境交织，写景与写心相互映照。', 2, 3),
  ],
  4: [
    observe('structure-and-coherence', '第一章在揭示来信内容处收束，回应开篇。', 6, 7, 8),
  ],
  5: [
    observe('chinese-language', '个别句子成分残缺，介词之后缺少宾语。', 6),
  ],
  6: [
    observe('theme-and-context', '新省长与楚庄王的比附点到即止，学人与权力的关系还可以展开。', 3, 4),
  ],
  7: [
    observe('structure-and-coherence', '考古疑问在这里集中抛出，后文若不逐一照应，读者容易失去线索。', 17),
    observe('theme-and-context', '翁婿对话把学术与名利的冲突摆上台面。', 16, 17),
  ],
  8: [
    observe('literary-quality', '以放大镜细看来信收束本章，与章首撕信遥相呼应。', 6),
  ],
};

/** The rewritten words as AI7 writes them: each scored item's 评语 to the editor's score, and a 总评 that agrees with them — no number in any. */
export const AUTHORED_REWRITE_WORDS: Omit<EvaluationRewriteSynthesisResult, 'verdict' | 'withheld'> & { readonly verdict: string } = {
  schema: EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA,
  items: [
    { itemId: 'literary-quality', comment: '细节与意象运用纯熟，写信又撕信、放大镜细看来信等动作写出人物心事，写景与写心相互映照；个别比喻略显俗套。' },
    { itemId: 'theme-and-context', comment: '触及学界与权力、学术与名利的关系，翁婿对话把冲突摆上台面；但比附点到即止，在所读部分展开得还不够。' },
    { itemId: 'structure-and-coherence', comment: '以甲骨文来信设置核心悬念，开篇的伏笔与第一章的收束都清楚；但考古疑问在中段集中抛出，后文照应尚不充分，线索有失衡之虞，结构还不够稳。' },
    { itemId: 'chinese-language', comment: '叙述凝练、对白自然，人物各有声口；个别句子成分残缺、比喻偶落俗套，需要逐句校改。' },
    { itemId: 'readers-and-market', comment: '所读内容中没有关于目标读者与市场的依据，只能从题材推断读者面；这一项依据不足，评价从严。' },
  ],
  verdict: '这部书稿以一封甲骨文来信设置悬念，写学界中人的心事与人情，文学品质与语言总体较好；结构上考古疑问集中抛出、照应尚不充分，读者与市场一项依据不足，评价从严。',
};
