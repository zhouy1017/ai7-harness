import { technicalWords } from './technical-layer.js';

/**
 * Service-authored sentences in the editor's words (Issue #1531, plan #1516 §5): the ONE place where a sentence the service
 * hands to the renderer is reworded for ordinary mode. Some of these sentences are recorded (run transitions, review
 * reports under a digest) or bound to a plan envelope, so they are never changed at their source; developer mode reads
 * them as recorded.
 *
 * A sentence is reworded only when a rule was written for it (review N1): an EXACT rule gives the whole sentence by
 * meaning; a FAMILY rule names the shape of a composed sentence, and only its service-authored text is reworded — a
 * Book's title, a file's name, a category or option in 「」 and every other embedded part stay exactly as they are. A
 * sentence no rule matches is shown as it is. Only fields that carry service sentences are passed here, never the
 * editor's goal or note, a title, a quotation or a model's answer.
 */
export interface ServiceSentenceRule {
  /** Where the sentence is made, for the test and the PR (`file:line` of its source). */
  readonly source: string;
  /** Instances of the sentence as the service writes it (synthetic values): together they hold every fragment of its source. */
  readonly samples: ReadonlyArray<string>;
}
interface ExactRule extends ServiceSentenceRule { readonly exact: string; readonly words: string }
interface FamilyRule extends ServiceSentenceRule { readonly family: RegExp; readonly then?: readonly [string | RegExp, string] }

/** The table's phrases, applied only to the service-authored text of a matched family. */
const PHRASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/第 ([\d、]+) 个阅读范围/gu, '正文第 $1 部分'],
  [/([\d,]+(?: \/ [\d,]+)?|全部 [\d,]+) 个(要重新分析的)?阅读范围/gu, '$1 个$2部分'],
  [/(各|所读|这个|同一个|两个|这些|其余|该|有)阅读范围/gu, '$1部分'],
  [/阅读范围/gu, '部分'],
  [/结果未知的单元缺口/gu, '结果未知的未完成部分'],
  [/结果与缺口/gu, '结果和未完成的部分'],
  [/这些缺口/gu, '这些未完成的部分'],
  [/留下缺口的/gu, '没有读成的'],
  [/记为缺口/gu, '留作未完成的部分'],
  [/的缺口/gu, '的未完成部分'],
  [/缺口/gu, '未完成的部分'],
  [/一份新的结果集修订版/gu, '一份新的分析结果'],
  [/这份修订版/gu, '这份分析结果'],
  [/结果集修订版/gu, '分析结果'],
  [/形成修订版/gu, '形成分析结果'],
  [/续行/gu, '继续'],
  [/改计划重做/gu, '重新开始'],
  [/等待运行名额/gu, '排队'],
  [/运行名额已满/gu, '现在没有空位'],
  [/(?:API )?凭据/gu, '密钥'],
  [/这份后台处理登记/gu, '这项空闲时自动更新分析设置'],
  [/后台处理登记/gu, '空闲时自动更新分析'],
  [/本社审阅偏好/gu, '审阅偏好'],
  [/证据保证级别/gu, '核查力度'],
  [/学习准入/gu, '是否可用于学习'],
  [/生产文档/gu, '衍生稿件'],
  [/AI7 初评/gu, '评估报告'],
  [/任务运行预算上限：([\d,]+) tokens/gu, '用量上限：$1'],
  [/这次运行的上限 ([\d,]+) tokens/gu, '这次运行的用量上限 $1'],
  [/(?:预算上限|登记上限)(：| )([\d,]+) tokens/gu, '用量上限$1$2'],
  [/预算上限（tokens）|预算上限|登记上限/gu, '用量上限'],
  [/(达到|至多) ([\d,]+) tokens/gu, '用量$1 $2'],
  [/用了 ([\d,]+) tokens/gu, '用量 $1'],
  [/份额 ([\d,]+) tokens/gu, '用量份额 $1'],
  [/上限至少要有 ([\d,]+) tokens/gu, '用量上限至少要有 $1'],
  [/([\d,]+) tokens/gu, '用量 $1'],
];

/** Reword the service-authored text of a matched sentence: the parts in 《》 and 「」 are material and stay as they are. */
function phrased(sentence: string): string {
  return sentence.split(/(《[^》]*》|「[^」]*」)/u).map((part, index) => {
    if (index % 2 === 1) return part;
    let words = part;
    for (const [pattern, replacement] of PHRASES) words = words.replace(pattern, replacement);
    return words;
  }).join('');
}

const exact = (source: string, from: string, words: string): ExactRule => ({ source, exact: from, words, samples: [from] });

const EXACT: ReadonlyArray<ExactRule> = [
  // Goals the service writes for a mode (never an editor's typed goal: exact sentences only).
  exact('task-plan.ts:803', '把基线分析同步到当前稿件：只重新分析改动过的阅读范围，其余沿用上一份', '把基线分析同步到当前稿件：只重新分析改动过的部分，其余沿用上一份'),
  exact('task-plan.ts:804', '重新分析所选范围，其余阅读范围沿用上一份', '重新分析所选范围，其余部分沿用上一份'),
  exact('task-plan.ts:1225', '按本社评估方案为这本书做 AI7 初评：各评分项的初评分数与评语，供你打分时参考', '按本社评估方案为这本书生成评估报告：各评分项的分数与评语，供你打分时参考'),
  exact('task-plan.ts:1226', '重新做 AI7 初评：按当前稿件重读全书，重新给出各评分项的初评分数与评语', '重新生成评估报告：按当前稿件重读全书，重新给出各评分项的分数与评语'),
  exact('task-plan.ts:2332', '改计划重做：不沿用上一次运行的结果，这次从头读', '重新开始：不沿用上一次运行的结果，这次从头读'),
  // Re-preparing makes a new plan (review S3, N1): each sentence names what is made.
  exact('task-plan.ts:1124', '要更新的那一份分析已不是最新的一份；请在「分析」里基于最新的一份重新准备。', '要更新的那一份分析已不是最新的一份；请在「分析」里基于最新的一份另做一份计划。'),
  exact('task-plan.ts:1255', '可以在「评估」重新准备计划。', '可以在「评估」另做一份计划。'),
  exact('task-plan.ts:1362', '请在「评估」里重新准备 AI7 初评。', '请在「评估」里为评估报告另做一份计划。'),
  exact('task-plan.ts:2728', '审阅没有计划修订：请在「审阅」里点「返回修改」重新准备这次审阅。', '审阅没有计划修订：请在「审阅」里点「返回修改」为这次审阅另做一份计划。'),
  exact('task-plan.ts:2380', '然后准备一项新任务，照原来的方式再做一次；开始之前可以先改计划。', '然后准备一项新任务，照原来的方式重新开始；开始之前可以先改计划。'),
  exact('analysis/run-state.ts:81', '重新推导的复用计划与冻结计划不一致；未开始执行，请重新准备。', '重新推导的复用计划与冻结计划不一致；没有开始，请另做一份计划。'),
  exact('analysis/run-state.ts:83', '重新推导的复用计划与冻结计划不一致；无法授权，请重新准备。', '重新推导的复用计划与冻结计划不一致；不能开始，请另做一份计划。'),
  exact('analysis/run-state.ts:157', 'AI7 上次关闭时这项任务正在运行；这类任务不能续行，已读的内容没有形成结果集修订版，此后不会再发送任何内容。需要时请重新准备并开始。',
    'AI7 上次关闭时这项任务正在运行；这类任务不能继续，已读的内容没有形成分析结果，此后不会再发送任何内容。需要时请另做一份计划再开始。'),
  exact('analysis/run-state.ts:163', 'AI7 上次关闭时这项任务还在等待运行名额，没有开始，也没有发送任何内容；重新启动后它不会自己开始。需要时请重新准备并开始。',
    'AI7 上次关闭时这项任务还在排队，没有开始，也没有发送任何内容；重新启动后它不会自己开始。需要时请另做一份计划再开始。'),
  exact('analysis/run-state.ts:192', '结果待确认：有阅读范围的请求已发出而结果无法确认，这次运行不能续行；可以取消任务保留已读完的部分，或改计划重做。',
    '结果待确认：有部分的请求已发出而结果无法确认，这次运行不能继续；可以取消任务保留已读完的部分，或重新开始。'),
  exact('task-plan.ts:2461', '这次运行授权时的执行绑定已经变化（模型服务、路由、策略或 AI7 版本不同），不能照原样续行；请改计划重做。', '这次运行开始时的模型服务或 AI7 版本已经变化，不能照原样继续；请重新开始。'),
  exact('task-plan.ts:1223', 'AI7 初评还不能设为快速开始默认：每次初评都先看计划，再开始。', '评估报告还不能设为快速开始默认：每次都先看计划，再开始。'),
  exact('task-plan.ts:1279', 'AI7 初评还没有准备计划。', '评估报告还没有准备计划。'),
  exact('task-plan.ts:1320', '在「评估」中从 AI7 初评开始新的一版，再按你的判断定分', '在「评估」中从评估报告开始新的一版，再按你的判断定分'),
  exact('task-plan.ts:1338', 'AI7 初评：各评分项的初评分数、评语与依据充分度', '评估报告：各评分项的分数、评语与依据充分度'),
  exact('task-plan.ts:1674', '（这一版没有 AI7 初评的市场部分）', '（这一版没有评估报告的市场部分）'),
  // A finding's terminal status, in the one vocabulary of the three finding lists (review point 4, N9).
  exact('review/review-run-state.ts:44', '已接受并应用', '已接受'),
  exact('review/review-run-state.ts:43', '已拒绝这条修改建议', '已拒绝'),
  exact('review/review-run-state.ts:45', '已修改后接受，尚未应用', '已接受 · 尚未写入稿件'),
  exact('review/review-run-state.ts:46', '已接受', '已接受 · 尚未写入稿件'),
  exact('review/review-run-state.ts:49', '已标记为已处理', '已处理'),
  exact('review/review-run-state.ts:41', '已忽略并说明原因', '已忽略'),
  // The review category's place wait, recorded with the report (B3): reworded where the category is shown.
  exact('review/review-run-state.ts:103', '等待运行名额', '排队中'),
  exact('review/review-run-state.ts:104', '运行名额已满：等待运行名额的任务先开始，有名额空出时这一类接着审；在此之前这一类什么都没有发送。', '排队中：排在前面的任务先开始，轮到时这一类接着审；在此之前这一类什么都没有发送。'),
  // Waits: one word for each (review N7).
  exact('task-plan.ts:637', '已联网 · 名额已满', '已联网 · 等待开始'),
  exact('task-plan.ts:848', '正在排队', '等待开始前检查'),
  // Plan-edit field labels (review N3: taskPlanLastEdit).
  exact('task-plan.ts:514', '重新分析与沿用的阅读范围', '重新分析与沿用的部分'),
  exact('task-plan.ts:519', '证据保证级别', '核查力度'),
  exact('analysis/run-state.ts:456', '事实核查政策要求更高的证据保证级别；这个级别不能选。', '事实核查政策要求更高的核查力度；这一档不能选。'),
  exact('analysis/run-state.ts:170', '任务结果：已完成（保留缺口）', '任务结果：已完成（有未完成的部分）'),
  // Service errors the editor reads (bounded-manuscript.ts): exact sentences only.
  exact('bounded-manuscript.ts:3914', '生产文档没有里程碑版本；请用「保存为版本」。', '衍生稿件没有里程碑版本；请用「保存为版本」。'),
  exact('bounded-manuscript.ts:5266', '排除清单与已审阅预览不一致，请重新准备替换。', '排除清单与已审阅预览不一致，请重新做一份替换预览。'),
  exact('bounded-manuscript.ts:5604', '撤销范围或文字与原应用凭据不一致。', '撤销范围或文字与原来的修改记录不一致。'),
  exact('bounded-manuscript.ts:183', '不创建编辑学习准入决定', '不决定是否可用于学习'),
  exact('task-plan.ts:2054', '这个阅读范围记为缺口，缺口写进结果；其余照常。', '这个部分不再重试，留作未完成的部分写进结果；其余照常。'),
  exact('task-plan.ts:2539', '本社审阅偏好未启用：当前策略未开放', '审阅偏好未启用：当前策略未开放'),
  exact('task-plan.ts:2541', '不把本社审阅偏好当作规则：它只作参考，不改变审阅类别、条款或编辑定稿', '不把审阅偏好当作规则：它只作参考，不改变审阅类别、条款或编辑定稿'),
];

const family = (source: string, shape: RegExp, samples: string | ReadonlyArray<string>, then?: readonly [string | RegExp, string]): FamilyRule =>
  ({ source, family: shape, samples: typeof samples === 'string' ? [samples] : samples, ...(then === undefined ? {} : { then }) });

/** Composed sentences, by shape: the service-authored text is reworded, the parts in 《》 and 「」 kept. */
const FAMILIES: ReadonlyArray<FamilyRule> = [
  family('task-plan.ts:330', /^第 [\d、]+ 个阅读范围上一次的请求已发出、结果未知，可能已被模型服务处理并计费；这项任务会再发一次它的请求，开始任务即重新授权这次发送。$/u,
    '第 2、3 个阅读范围上一次的请求已发出、结果未知，可能已被模型服务处理并计费；这项任务会再发一次它的请求，开始任务即重新授权这次发送。'),
  family('task-plan.ts:338', /^(?:「[^」]+」第 [\d、]+ 个，?)+阅读范围上一次的请求已发出、结果未知，可能已被模型服务处理并计费；这项任务会再发一次它们的请求，开始任务即重新授权这次发送。$/u,
    '「事实核查」第 4 个，「体例与格式」第 1、2 个阅读范围上一次的请求已发出、结果未知，可能已被模型服务处理并计费；这项任务会再发一次它们的请求，开始任务即重新授权这次发送。',
    [/(第 [\d、]+) 个(?:阅读范围)?/gu, '$1 部分']),
  family('task-plan.ts:413', /^任务运行预算上限：[\d,]+ tokens(?:（\d+ 类合计）|；各成员的模型阶段按工序份额分用)?$/u, '任务运行预算上限：80,000 tokens；各成员的模型阶段按工序份额分用'),
  family('task-plan.ts:1043', /^《[^》]*》[^《》「」]* · [\d,]+ 字 · (?:重新分析 )?[\d,]+ 个阅读范围(?:（[^）]*）)?(?:，沿用 [\d,]+ 个)?$/u, '《全社会动员》第 2 章 · 3,000 字 · 重新分析 2 个阅读范围（第 3–4 段），沿用 6 个'),
  family('task-plan.ts:1048', /^(?:所读阅读范围|全书各阅读范围|所读范围内)的稿件正文（/u, ['全书各阅读范围的稿件正文（8 个），以及汇总时各项依据的说明', '所读阅读范围的稿件正文（2 个）',
    '所读范围内的稿件正文（第 2 章）和所选类别的规范条款，以及上面列出的资料库资料原文，以及本社审阅偏好的摘录', '所读范围内的稿件正文（第 2 章）和所选类别的规范条款，以及本社审阅偏好的摘录']),
  family('task-plan.ts:1055', /^逐章读取（重新读取 .+，沿用(?:其余)? [\d,]+ 个(?:阅读范围)?）$/u, '逐章读取（重新读取 2 个阅读范围，沿用 6 个）'),
  family('task-plan.ts:1083', /^(?:达到|至多) [\d,]+ tokens(?: 后不再发送新的请求（[\d,]+ 个阅读范围）|（各成员按工序份额分用）|（\d+ 类合计）)$/u, ['达到 80,000 tokens 后不再发送新的请求（8 个阅读范围）', '至多 240,000 tokens（各成员按工序份额分用）', '至多 240,000 tokens（2 类合计）']),
  family('task-plan.ts:2038', /^你把「[^」]+」改成了「先问你」，所以 AI7 先停下这一步来问你。$/u, '你把「模型服务暂时出错时，同一个阅读范围安全地再试一次」改成了「先问你」，所以 AI7 先停下这一步来问你。',
    ['同一个阅读范围安全地再试一次', '同一部分安全地再试一次']),
  family('task-plan.ts:2041', /^任务已(?:暂停|中断)：回答会先记下，续行后按它接着做$/u, ['任务已暂停：回答会先记下，续行后按它接着做', '任务已中断：回答会先记下，续行后按它接着做']),
  family('task-plan.ts:2043', /^回答后：选「再试一次」，AI7 把这个阅读范围再发送一次；选「不重试，记为缺口」，它记为缺口。之后接着做归纳和抽样。$/u,
    '回答后：选「再试一次」，AI7 把这个阅读范围再发送一次；选「不重试，记为缺口」，它记为缺口。之后接着做归纳和抽样。', ['「不重试，记为缺口」', '「不重试，留作未完成的部分」']),
  family('task-plan.ts:2048', /^(?:再发送一次这个阅读范围；已读完的部分不重复。|推荐：这类错误通常是暂时的，再试一次就能安全地补上这个阅读范围|这个阅读范围记为缺口，缺口写进结果；其余照常。|不重试，记为缺口)$/u,
    ['这个阅读范围记为缺口，缺口写进结果；其余照常。', '再发送一次这个阅读范围；已读完的部分不重复。', '推荐：这类错误通常是暂时的，再试一次就能安全地补上这个阅读范围', '不重试，记为缺口']),
  family('task-plan.ts:2064', /^第 \d+ 个阅读范围：模型服务暂时出错，这一次没有读成。要安全地再试一次吗？$/u, '第 3 个阅读范围：模型服务暂时出错，这一次没有读成。要安全地再试一次吗？'),
  family('task-plan.ts:2094', /^(?:把这个回答发送给模型，接着处理这个阅读范围。|模型需要你的决定来处理这个阅读范围。|每个阅读范围最多提问一次；24 小时未回答将按「不回答」接着做。|回答后：把你的回答发送给模型一次，接着处理这个阅读范围；已完成的部分保留。)$/u,
    ['每个阅读范围最多提问一次；24 小时未回答将按「不回答」接着做。', '把这个回答发送给模型，接着处理这个阅读范围。', '模型需要你的决定来处理这个阅读范围。', '回答后：把你的回答发送给模型一次，接着处理这个阅读范围；已完成的部分保留。']),
  // Cancel impact and the redo summary: every number is a count; no title or quotation is embedded.
  family('task-plan.ts:2199', /^(?:停在正在读的第|在这两个阅读范围之间停止|正在进行的|这项任务(?:已经停下|还没有|会在这里停下)|AI7 上次关闭时这项任务没有结束)[^《》「」]*$/u, [
    '停在正在读的第 3 个阅读范围；其余 4 个要重新分析的阅读范围和之后的归纳、抽样都不再进行，不再发送任何内容。已读完的 2 个阅读范围和正在读的这一个的结果与缺口，连同沿用上一份分析的 1 个阅读范围，会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。正在等待的那一轮模型请求会被中止；回答已传回的照常计入，否则该阅读范围记为结果未知的缺口，不会再发。',
    '在这两个阅读范围之间停止；之后的归纳、抽样都不再进行，不再发送任何内容。已读结果与这些缺口会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。',
    '这项任务还没有读完任何阅读范围；取消后不会发送任何内容，也不会形成结果集修订版。',
    '这项任务已经停下；执行绑定已经变化，已读完的 3 个阅读范围不能整理成结果集修订版；这次取消不会形成修订版。',
    '这项任务已经停下；已读完的 3 个阅读范围的结果与缺口会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。',
    '这项任务已经停下；这项任务还没有读完任何阅读范围，不会形成结果集修订版。',
    'AI7 上次关闭时这项任务没有结束，现在也没有在运行；取消只结束这条运行记录，不会再发送任何内容。它已读完的阅读范围的结果没有保存下来，不会形成结果集修订版。',
  ]),
  family('task-plan.ts:2209', /^这项任务(?:还没有读完任何阅读范围|会在这里停下并取消)[^《》「」]*$/u, '这项任务会在这里停下并取消；它还没有读完任何阅读范围，不会形成结果集修订版。'),
  family('task-plan.ts:2234', /^[^《》「」]*已读完 [\d,]+ 个阅读范围，等你回答 \d+ 个，你已回答但尚未续行 \d+ 个[^《》「」]*$/u,
    '这项任务已经停下；已读完 3 个阅读范围，等你回答 1 个，你已回答但尚未续行 0 个，结果未知 1 个，未尝试 4 个。等待回答的范围不再重试，结果未知的请求不会再发，仍记为结果未知的单元缺口，不记为未尝试。'),
  family('task-plan.ts:2235', /^第 \d+ 个阅读范围(?:你已回答，但还没有按回答接着做|在等你的回答|的请求已发出、结果未知)[^《》「」]*$/u, ['第 4 个阅读范围的请求已发出、结果未知；不会再发，在这份修订版里记为结果未知的单元缺口，不记为未尝试。',
    '第 4 个阅读范围在等你的回答；取消后不再重试，在这份修订版里记为缺口。']),
  family('task-plan.ts:2333', /^改计划重做：沿用已读完的 [\d,]+ 个阅读范围，接着读其余 [\d,]+ 个$/u, '改计划重做：沿用已读完的 2 个阅读范围，接着读其余 6 个'),
  family('task-plan.ts:2382', /^然后准备一项新任务：沿用(?:这|其中有结果的) [\d,]+ 个阅读范围[^《》「」]*$/u, ['然后准备一项新任务：沿用其中有结果的 2 个阅读范围，其余 6 个（含留下缺口的 1 个）重新读；开始之前可以先改计划。',
    '然后准备一项新任务：沿用这 2 个阅读范围的结果，接着读其余 6 个；开始之前可以先改计划。']),
  // Run control: what the editor waits for before 继续.
  family('task-plan.ts:2458', /^(?:模型未连接|离线)：(?:续行|按回答接着做)要[^《》「」]*$/u, ['模型未连接：续行要发送到模型服务，所需的凭据还没有就绪；连接好之后才能续行。',
    '离线：续行要连到模型服务，而这台设备现在没有网络；联网后再续行。', '模型未连接：按回答接着做要发送到模型服务，所需的凭据还没有就绪；连接好之后再回答。']),
  family('analysis/run-state.ts:332', /^有一项(?:运行因.+?中断，续行或取消它后才能准备新的更新。|.+在等待运行名额；它开始并结束之前，或在任务抽屉里取消它之前，不能准备.+。)$/u,
    ['有一项分析任务在等待运行名额；它开始并结束之前，或在任务抽屉里取消它之前，不能准备新的分析。', '有一项运行因AI7 关闭时正在运行中断，续行或取消它后才能准备新的更新。']),
  family('analysis/run-state.ts:140', /^AI7 上次关闭时这项任务正(?:在运行|在暂停|让位给你的任务)；已读完的阅读范围都已保存[^《》]*$/u,
    ['AI7 上次关闭时这项任务正在运行；已读完的阅读范围都已保存。点「续行」从下一个阅读范围接着读；在此之前不会发送任何内容。', 'AI7 上次关闭时这项任务正在暂停；已读完的阅读范围都已保存，任务已暂停。',
      'AI7 上次关闭时这项任务正让位给你的任务；已读完的阅读范围都已保存，任务已暂停，点「续行」接着处理。'], [/「续行」/gu, '「继续」']),
  // The 后台分析 block's states and errors (background-analysis-enrollments.ts), and its run-report lines.
  family('background-analysis-enrollments.ts:113', /^(?:这份|这本书的|当前版本缺少)?后台处理登记[^《》「」]*$/u, ['后台处理登记前驱结构不兼容。', '后台处理登记标识无效。', '后台处理登记版本指向的登记不存在。', '后台处理登记版本标识无效。', '后台处理登记状态指向的版本不存在。', '后台处理登记状态无效。', '后台处理登记状态种类不一致。', '后台处理登记的参数无效。', '后台处理登记的起点无效。', '后台处理登记的预算上限无效。', '后台处理登记种类不一致。', '后台处理登记缺少状态记录。', '后台处理登记记录与其字段不一致。', '后台处理登记记录与其摘要不一致。', '后台处理登记记录摘要不一致。', '后台处理登记记录无效。', '后台处理登记记录的绑定无效。', '后台处理登记迁移后引用校验失败。', '当前版本缺少后台处理登记种类列。', '这份后台处理登记不存在。', '这本书的后台处理登记记录无法读取，后台分析不会开始；其他图书不受影响。']),
  family('background-analysis-enrollments.ts:842', /^按种类登记后台处理后[^《》「」]*$/u, '按种类登记后台处理后，这本书有了已确认的改动并空闲时，AI7 才会按登记准备相应工序；每次运行都不超过登记的预算上限，留下精确计划、模型绑定和运行授权，写明登记版本。暂停先不开始新的处理，续行后照常；撤销后不再开始。尚未接入的工序只保留登记，不会派发。'),
  family('background-analysis-enrollments.ts:873', /^已暂停：续行之前不会开始新的后台分析；已经开始的运行照常进行。$/u, '已暂停：续行之前不会开始新的后台分析；已经开始的运行照常进行。'),
  family('background-analysis-enrollments.ts:963', /^上限至少要有 \d+ tokens：范围里每本书至少分到 1 个。$/u, '上限至少要有 3 tokens：范围里每本书至少分到 1 个。'),
  family('background-analysis-enrollments.ts:979', /^由后台处理登记开始(?:（这份登记的版本不在本机记录里）| · 按第 \d+ 版登记)$/u, ['由后台处理登记开始 · 按第 1 版登记', '由后台处理登记开始（这份登记的版本不在本机记录里）'], [/ · 按第 \d+ 版登记$|（这份登记的版本不在本机记录里）$/u, '']),
  family('background-analysis-enrollments.ts:982', /^(?:范围：.+；登记上限 [\d,]+ tokens.*|(?:达到上限后停下|没有达到上限)：用了 [\d,]+ tokens，这次运行的上限 [\d,]+ tokens)$/u, ['没有达到上限：用了 120 tokens，这次运行的上限 334 tokens', '范围：书系《乙》的 3 本书；登记上限 1000 tokens，本书份额 334 tokens']),
  family('background-analysis-enrollments.ts:1039', /^请设置后台分析的预算上限（tokens）：登记必须有上限。$/u, '请设置后台分析的预算上限（tokens）：登记必须有上限。'),
  family('task-plan.ts:1628', /^资料库资料《[^》]*》：已提取 [\d,]+ 字，按计划冻结的索引版本读取（只参照，不照抄）——[^《》]*再次起草需用「新建文档…」重新准备$/u,
    '资料库资料《出版社经验谈》：已提取 3,000 字，按计划冻结的索引版本读取（只参照，不照抄）——这份资料现已不可用；已有的草稿仍可查看，再次起草需用「新建文档…」重新准备',
    ['再次起草需用「新建文档…」重新准备', '再次起草需用「新建衍生稿件…」另做一份计划']),
  family('task-plan.ts:2574', /^[^《》]*本社审阅偏好 v\d+(?:、本社审阅偏好 v\d+)*的摘录$/u, '，以及本社审阅偏好 v2的摘录'),
  family('task-plan.ts:2635', /^[^《》「」：]+：参考本社审阅偏好(?: v\d+)?$/u, '文字与表达：参考本社审阅偏好 v2'),
];

/** Sentences of the eight modules with a banned term the page never shows, each with where it goes instead (the test reads it). */
export const NOT_SHOWN: ReadonlyArray<{ readonly source: string; readonly text: string; readonly why: string }> = [
  ...['（凭据引用', '凭据引用', '凭据就绪', '· 凭据', '改计划重做自', '个阅读范围 · 已发送', 'tokens'].map((text) => ({ source: 'task-plan.ts:440, 762–765, 1130–1177', text, why: 'plan.technical rows: the developer layer only' })),
  ...['tokens × 冻结单元数', 'tokens（'].map((text) => ({ source: 'analysis/run-state.ts:374–377', text, why: 'the frozen ceiling of the technical rows' })),
  { source: 'analysis/run-state.ts:404', text: '凭据值不进入任务账本、协议帧、日志、诊断或 Session 内容', why: 'notDo.technical: the developer layer only' },
  { source: 'background-analysis-enrollments.ts:939', text: '后台处理登记 · 第', why: 'the enrollment\'s numbered name: developer mode only (backgroundEnrollmentLine)' },
  { source: 'task-plan.ts:2734–2735', text: '本社审阅偏好', why: 'plan.technical rows: the developer layer only' },
];

/** The ordinary words of one service-authored sentence, or the sentence as it is when no rule was written for it. */
export function ordinaryServiceWords(sentence: string): string {
  const rule = EXACT.find((entry) => entry.exact === sentence);
  if (rule !== undefined) return rule.words;
  const shape = FAMILIES.find((entry) => entry.family.test(sentence));
  if (shape === undefined) return sentence;
  const words = shape.then === undefined ? sentence : sentence.replace(shape.then[0], shape.then[1]);
  return phrased(words);
}

/** What a page shows for a service-authored sentence: developer mode reads it as the service wrote it. */
export function serviceWords(sentence: string): string;
export function serviceWords(sentence: string | null): string | null;
export function serviceWords(sentence: string | null): string | null {
  return sentence === null ? null : technicalWords(sentence, ordinaryServiceWords(sentence));
}

/**
 * A sentence that may be the editor's own (a task's goal): only an EXACT rule rewords it — the service's mode sentences —
 * and anything else, typed by the editor, is shown as it is.
 */
export function serviceGoalWords(sentence: string): string {
  return technicalWords(sentence, EXACT.find((entry) => entry.exact === sentence)?.words ?? sentence);
}

/** The rules, for the test: every sentence of the eight modules with a banned term is one of their samples, or NOT_SHOWN. */
export const SERVICE_SENTENCE_RULES: ReadonlyArray<ServiceSentenceRule> = [...EXACT, ...FAMILIES];
