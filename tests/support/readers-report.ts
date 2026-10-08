import type { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import type { EditorialStore } from '../../src/service/store.js';
import {
  READERS_REPORT_SYNTHESIS_RESULT_SCHEMA,
  type ReadersReportPassage,
  type ReadersReportSynthesisResult,
} from '../../src/service/evaluation/readers-report-contract.js';
import type { EvaluationContent, EvaluationRecordProjection, LaunchPolicyProjection } from '../../src/shared/protocol.js';

// 审稿意见 (Issue #429, plan slice S81c): the steps J-11 takes before it drafts one, over the real store — AI7's 初评 run to its end,
// then 评估 to a 定稿 version begun from it whose words are exactly the ones J-11's 第 14 版 holds. A 审稿意见's contract freezes a
// version's words and nothing of its identity or time, so the version reached here asks the authored fixture
// `sample1-readers-report-authored` exactly the questions J-11's does.

export const READERS_REPORT_FIXTURE_IDENTITY = 'sample1-readers-report-authored';

/** 准备 AI7 初评, 开始任务, and the Run to its end on the fixture the owner was built with. */
export async function runInitialEvaluationToEnd(
  store: EditorialStore,
  owner: BaselineAnalysisExecutionOwner,
  bookId: string,
  launchPolicy: LaunchPolicyProjection,
): Promise<void> {
  let progress = store.createInitialEvaluationPreparationWork(bookId, launchPolicy);
  while (!progress.done) progress = store.advanceInitialEvaluationPreparationWork(progress.workId!);
  const prepared = progress.projection!;
  const authorized = store.authorizeInitialEvaluation(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  owner.admitAndDispatch(authorized.dispatchRunRecordId!, store.initialEvaluationLedger);
  await owner.whenIdle();
  if (store.inspectInitialEvaluation(bookId).state !== 'settled') throw new Error('AI7 初评没有完成。');
}

/** The risks and what is still missing as J-11 left them by its 第 13 版, which 第 14 版 carries. */
const J11_RISKS: EvaluationContent['risks'] = [
  { riskId: 'facts-and-sources', level: 'low', statement: '已核对事实和来源，未发现未解决问题。', reviewed: false },
  { riskId: 'law-rights-ethics-policy', level: 'low', statement: '书中写到真实人物，需要法务看过。', reviewed: false },
];
const J11_READINESS = ['第三章结尾需要重写'];

/**
 * A 定稿 version begun from AI7's 初评 with J-11's words: AI7's scores and comments but 读者与市场潜力 at 10 (打分偏高), AI7's
 * strengths and weaknesses, J-11's risks and what is still missing, no 总评, and 修改后再议. An earlier 定稿 version carries the
 * risks into it, as J-11's 第 13 版 does.
 */
export function finalizeAsJ11(store: EditorialStore, bookId: string): EvaluationRecordProjection {
  const first = store.startEvaluation(bookId).record!;
  const firstContent: EvaluationContent = {
    ...first.content,
    items: first.content.items.map((item, index) => (index === 4
      ? { ...item, score: null, notRated: '市场资料尚未收集。' }
      : { ...item, score: [18, 16.5, 15, 17][index]! })),
    risks: J11_RISKS,
    readiness: J11_READINESS,
    conclusion: 'revise',
  };
  store.saveEvaluation({ bookId, recordId: first.recordId, expectedEntries: 1, content: firstContent, finalize: true });
  const draft = store.startEvaluation(bookId, true).record!;
  const content: EvaluationContent = {
    ...draft.content,
    items: draft.content.items.map((item, index) => (index === 4 ? { ...item, score: 10, adjustment: { reasons: ['too-high'], note: null } } : item)),
    conclusion: 'revise',
  };
  return store.saveEvaluation({ bookId, recordId: draft.recordId, expectedEntries: 1, content, finalize: true }).record!;
}

const passage = (kind: ReadersReportPassage['kind'], note: string, ...blockOrdinals: number[]): ReadersReportPassage => ({ kind, note, blockOrdinals });

/** One unit's passages each: what bears out a strength, shows a problem, or where a revision applies. */
export const AUTHORED_PASSAGES: Readonly<Record<number, ReadonlyArray<ReadersReportPassage>>> = {
  1: [
    passage('strength', '开篇两句对仗的题辞立即确立全书的思辨气质。', 5, 6),
    passage('strength', '写信又撕信的细节以动作写心事，含蓄而有张力。', 8, 14),
  ],
  2: [
    passage('strength', '甲骨文来信与写信人早已去世的设定构成核心悬念。', 6, 7),
    passage('problem', '打水漂一段个别比喻略显俗套。', 11),
    passage('suggestion', '打水漂一段的比喻可换成更贴切、更有地方色彩的说法。', 11),
  ],
  3: [
    passage('strength', '邮递员递信的场景节奏紧凑，拆信时才揭示四个甲骨文字。', 7, 8, 11, 15),
  ],
  4: [
    passage('strength', '两位学者互相调侃，写出各自的性情。', 14, 15, 16),
  ],
  5: [
    passage('problem', '个别句子成分残缺，介词之后缺少宾语。', 6),
    passage('suggestion', '逐句校读这一段，补足介词之后缺少的宾语。', 6),
  ],
  6: [
    passage('problem', '新省长与楚庄王的比附点到即止，学人与权力的关系还可以展开。', 3, 4),
  ],
  7: [
    passage('strength', '翁婿对话点出学术与名利的冲突。', 16, 17),
    passage('suggestion', '这里提出的考古疑问较多，后文宜逐一照应，免得读者失去线索。', 17),
  ],
  8: [
    passage('strength', '以放大镜细看来信收束本章，与章首撕信遥相呼应。', 6),
  ],
};

/** The 给作者的修改意见 written from J-11's 定稿 version and those passages: the five sections. */
export const AUTHORED_SECTIONS: ReadersReportSynthesisResult = {
  schema: READERS_REPORT_SYNTHESIS_RESULT_SCHEMA,
  overall: '这部书稿以一封甲骨文来信设置悬念，写学界中人的心事与人情，细节与意象运用纯熟，人物对白各有声口，整体达到出版要求。目前的问题主要在语言的细部：个别句子成分残缺，个别比喻落入俗套；学人与权力的主题在所读部分展开得还不够充分。',
  strengths: [
    '以甲骨文来信设置核心悬念，开篇即抓住读者，章末的收束与开篇遥相呼应。',
    '写信又撕信、以放大镜细看来信等细节以动作写心事，含蓄而有张力。',
    '人物对白各有声口，两位学者之间的调侃写出各自的性情。',
  ],
  problems: [
    '个别句子成分残缺，例如介词之后缺少宾语，需要逐句校改。',
    '个别比喻略显俗套，与全书凝练的叙述语言不相称。',
    '学人与权力、学术与名利的主题点到即止，在所读部分展开得还不够。',
  ],
  suggestions: [
    '请逐句校读全稿，补足残缺的句子成分。',
    '打水漂一段的比喻可换成更贴切、更有地方色彩的说法。',
    '在后文照应前面提出的考古疑问，并让学人与权力的主题有更充分的展开。',
  ],
  conclusion: '结论为修改后再议：请按以上意见修改，修改稿交来后编辑部再作审读。',
};
