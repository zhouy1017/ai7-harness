import { technicalWords } from './technical-layer.js';

/**
 * Service-authored sentences in the editor's words (Issue #1531, plan #1516 §5): the ONE place where a sentence the service
 * hands to the renderer is reworded for ordinary mode. Some of these sentences are recorded (run transitions, review
 * reports under a digest) or bound to a plan envelope, so they are never changed at their source; developer mode reads
 * them as recorded.
 *
 * A sentence is reworded only when a rule was written for it (review N1): an EXACT rule gives the whole sentence by
 * meaning; a FAMILY rule names the shape of a composed sentence (anchored at both ends) and gives its words from the
 * captured parts — a Book's title, a file's name, a heading, a category, a destination or a scope's name is captured and
 * kept exactly as it is. A sentence no rule matches is shown as it is; a reason made of several sentences is read
 * sentence by sentence. Only fields that carry service sentences are passed here, never the editor's goal or note, a
 * title, a quotation or a model's answer.
 */
export interface ServiceSentenceRule {
  /** The service file that writes the sentence, under `src/service/` (the test matches its text there, never a line number). */
  readonly file: string;
}
interface ExactRule extends ServiceSentenceRule { readonly exact: string; readonly words: string }
interface FamilyRule extends ServiceSentenceRule { readonly family: RegExp; readonly words: (...parts: string[]) => string }

/** The table's phrases, for a family whose every unbracketed part is service text (numbers aside). */
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
  [/尚未续行/gu, '还没有继续'],
  [/续行/gu, '继续'],
  [/改计划重做/gu, '重新开始'],
  [/等待运行名额/gu, '排队'],
  [/(?:API )?凭据/gu, '密钥'],
  [/本社审阅偏好/gu, '审阅偏好'],
  [/(达到|至多) ([\d,]+) tokens/gu, '用量$1 $2'],
];

/** Reword a part that is service text throughout. */
function phrased(text: string): string {
  return PHRASES.reduce((words, [pattern, replacement]) => words.replace(pattern, replacement), text);
}

const exact = (file: string, from: string, words: string): ExactRule => ({ file, exact: from, words });
const family = (file: string, shape: RegExp, words: (...parts: string[]) => string = (sentence) => phrased(sentence)): FamilyRule => ({ file, family: shape, words });

const SAFE_RETRY = exact('analysis/plan-edits.ts', '模型服务暂时出错时，同一个阅读范围安全地再试一次', '模型服务暂时出错时，同一部分安全地再试一次');

const EXACT: ReadonlyArray<ExactRule> = [
  // Goals the service writes for a mode (never an editor's typed goal: exact sentences only).
  exact('task-plan.ts', '把基线分析同步到当前稿件：只重新分析改动过的阅读范围，其余沿用上一份', '把基线分析同步到当前稿件：只重新分析改动过的部分，其余沿用上一份'),
  exact('task-plan.ts', '重新分析所选范围，其余阅读范围沿用上一份', '重新分析所选范围，其余部分沿用上一份'),
  exact('task-plan.ts', '按本社评估方案为这本书做 AI7 初评：各评分项的初评分数与评语，供你打分时参考', '按本社评估方案为这本书生成评估报告：各评分项的分数与评语，供你打分时参考'),
  exact('task-plan.ts', '重新做 AI7 初评：按当前稿件重读全书，重新给出各评分项的初评分数与评语', '重新生成评估报告：按当前稿件重读全书，重新给出各评分项的分数与评语'),
  exact('task-plan.ts', '改计划重做：不沿用上一次运行的结果，这次从头读', '重新开始：不沿用上一次运行的结果，这次从头读'),
  // Re-preparing makes a new plan (review S3, N1): each sentence names what is made.
  exact('task-plan.ts', '要更新的那一份分析已不是最新的一份；请在「分析」里基于最新的一份重新准备。', '要更新的那一份分析已不是最新的一份；请在「分析」里基于最新的一份另做一份计划。'),
  exact('task-plan.ts', '可以在「评估」重新准备计划。', '可以在「评估」另做一份计划。'),
  exact('task-plan.ts', '请在「评估」里重新准备 AI7 初评。', '请在「评估」里为评估报告另做一份计划。'),
  exact('task-plan.ts', '审阅没有计划修订：请在「审阅」里点「返回修改」重新准备这次审阅。', '审阅没有计划修订：请在「审阅」里点「返回修改」为这次审阅另做一份计划。'),
  exact('task-plan.ts', '然后准备一项新任务，照原来的方式再做一次；开始之前可以先改计划。', '然后准备一项新任务，照原来的方式重新开始；开始之前可以先改计划。'),
  exact('analysis/run-state.ts', '重新推导的复用计划与冻结计划不一致；未开始执行，请重新准备。', '重新推导的复用计划与冻结计划不一致；没有开始，请另做一份计划。'),
  exact('analysis/run-state.ts', '重新推导的复用计划与冻结计划不一致；无法授权，请重新准备。', '重新推导的复用计划与冻结计划不一致；不能开始，请另做一份计划。'),
  exact('analysis/run-state.ts', 'AI7 上次关闭时这项任务正在运行；已读完的阅读范围都已保存。点「续行」从下一个阅读范围接着读；在此之前不会发送任何内容。',
    'AI7 上次关闭时这项任务正在运行；已读完的部分都已保存。点「继续」从下一部分接着读；在此之前不会发送任何内容。'),
  exact('analysis/run-state.ts', 'AI7 上次关闭时这项任务正在暂停；已读完的阅读范围都已保存，任务已暂停。', 'AI7 上次关闭时这项任务正在暂停；已读完的部分都已保存，任务已暂停。'),
  exact('analysis/run-state.ts', 'AI7 上次关闭时这项任务正让位给你的任务；已读完的阅读范围都已保存，任务已暂停，点「续行」接着处理。',
    'AI7 上次关闭时这项任务正让位给你的任务；已读完的部分都已保存，任务已暂停，点「继续」接着处理。'),
  exact('analysis/run-state.ts', 'AI7 上次关闭时这项任务正在运行；这类任务不能续行，已读的内容没有形成结果集修订版，此后不会再发送任何内容。需要时请重新准备并开始。',
    'AI7 上次关闭时这项任务正在运行；这类任务不能继续，已读的内容没有形成分析结果，此后不会再发送任何内容。需要时请另做一份计划再开始。'),
  exact('analysis/run-state.ts', 'AI7 上次关闭时这项任务还在等待运行名额，没有开始，也没有发送任何内容；重新启动后它不会自己开始。需要时请重新准备并开始。',
    'AI7 上次关闭时这项任务还在排队，没有开始，也没有发送任何内容；重新启动后它不会自己开始。需要时请另做一份计划再开始。'),
  // Which part (review S10): the ranges whose request went out and whose result cannot be known.
  exact('analysis/run-state.ts', '结果待确认：有阅读范围的请求已发出而结果无法确认，这次运行不能续行；可以取消任务保留已读完的部分，或改计划重做。',
    '结果待确认：有些部分的请求已经发出，却无法确认结果，这次运行不能继续；可以取消任务保留已读完的部分，或重新开始。'),
  exact('task-plan.ts', '这次运行授权时的执行绑定已经变化（模型服务、路由、策略或 AI7 版本不同），不能照原样续行；请改计划重做。', '这次运行开始时的模型服务或 AI7 版本已经变化，不能照原样继续；请重新开始。'),
  exact('task-plan.ts', '模型未连接：续行要发送到模型服务，所需的凭据还没有就绪；连接好之后才能续行。', '模型未连接：继续要发送到模型服务，所需的密钥还没有就绪；连接好之后才能继续。'),
  exact('task-plan.ts', '离线：续行要连到模型服务，而这台设备现在没有网络；联网后再续行。', '离线：继续要连到模型服务，而这台设备现在没有网络；联网后再继续。'),
  exact('task-plan.ts', '模型未连接：按回答接着做要发送到模型服务，所需的凭据还没有就绪；连接好之后再回答。', '模型未连接：按回答接着做要发送到模型服务，所需的密钥还没有就绪；连接好之后再回答。'),
  exact('task-plan.ts', 'AI7 初评还不能设为快速开始默认：每次初评都先看计划，再开始。', '评估报告还不能设为快速开始默认：每次都先看计划，再开始。'),
  exact('task-plan.ts', 'AI7 初评还没有准备计划。', '评估报告还没有准备计划。'),
  exact('task-plan.ts', '在「评估」中从 AI7 初评开始新的一版，再按你的判断定分', '在「评估」中从评估报告开始新的一版，再按你的判断定分'),
  exact('task-plan.ts', 'AI7 初评：各评分项的初评分数、评语与依据充分度', '评估报告：各评分项的分数、评语与依据充分度'),
  // One word for the ceiling in a plan's rows (review S10): 用量上限, beside 「用量上限：80,000」.
  exact('task-plan.ts', '未设置任务预算上限', '未设置用量上限'),
  // A finding's terminal status, in the one vocabulary of the three finding lists (review point 4, N9).
  exact('review/review-run-state.ts', '已接受并应用', '已接受'),
  exact('review/review-run-state.ts', '已拒绝这条修改建议', '已拒绝'),
  exact('review/review-run-state.ts', '已修改后接受，尚未应用', '已接受 · 尚未写入稿件'),
  exact('review/review-run-state.ts', '已接受', '已接受 · 尚未写入稿件'),
  exact('review/review-run-state.ts', '已标记为已处理', '已处理'),
  exact('review/review-run-state.ts', '已忽略并说明原因', '已忽略'),
  // The review category's place wait, recorded with the report (B3): reworded where the category is shown.
  exact('review/review-run-state.ts', '等待运行名额', '排队中'),
  exact('review/review-run-state.ts', '运行名额已满：等待运行名额的任务先开始，有名额空出时这一类接着审；在此之前这一类什么都没有发送。', '排队中：排在前面的任务先开始，轮到时这一类接着审；在此之前这一类什么都没有发送。'),
  // Waits: one word for each (review N7). 「正在排队」 is chosen by the state's key before this (review S2: `stateWords`).
  exact('task-plan.ts', '已联网 · 名额已满', '已联网 · 等待开始'),
  // Plan-edit field labels (review N3: taskPlanLastEdit), and the step the editor can set to 「先问你」 (review S9).
  exact('task-plan.ts', '重新分析与沿用的阅读范围', '重新分析与沿用的部分'),
  exact('task-plan.ts', '证据保证级别', '核查力度'),
  SAFE_RETRY,
  exact('analysis/run-state.ts', '事实核查政策要求更高的证据保证级别；这个级别不能选。', '事实核查政策要求更高的核查力度；这一档不能选。'),
  exact('analysis/run-state.ts', '任务结果：已完成（保留缺口）', '任务结果：已完成（有未完成的部分）'),
  // Service errors the editor reads (bounded-manuscript.ts): exact sentences only.
  exact('bounded-manuscript.ts', '生产文档没有里程碑版本；请用「保存为版本」。', '衍生稿件没有里程碑版本；请用「保存为版本」。'),
  exact('bounded-manuscript.ts', '排除清单与已审阅预览不一致，请重新准备替换。', '排除清单与已审阅预览不一致，请重新做一份替换预览。'),
  exact('bounded-manuscript.ts', '撤销范围或文字与原应用凭据不一致。', '撤销范围或文字与原来的修改记录不一致。'),
  exact('bounded-manuscript.ts', '不创建编辑学习准入决定', '不决定是否可用于学习'),
  // A delivery package's two document notes (review S5): 衍生稿件, as the package page names its documents.
  exact('book-delivery-packages.ts', '稿件与文档上的备注只供编辑自己参考', '稿件与衍生稿件上的备注只供编辑自己参考'),
  exact('book-delivery-packages.ts', '稿件只含发稿版本，文档只含交付过的版本', '稿件只含发稿版本，衍生稿件只含交付过的版本'),
  // Clarification: the question the safe retry asks, its answers and what each does.
  exact('task-plan.ts', '任务已暂停：回答会先记下，续行后按它接着做', '任务已暂停：回答会先记下，继续后按它接着做'),
  exact('task-plan.ts', '任务已中断：回答会先记下，续行后按它接着做', '任务已中断：回答会先记下，继续后按它接着做'),
  exact('task-plan.ts', '回答后：选「再试一次」，AI7 把这个阅读范围再发送一次；选「不重试，记为缺口」，它记为缺口。之后接着做归纳和抽样。',
    '回答后：选「再试一次」，AI7 把这一部分再发送一次；选「不重试，留作未完成的部分」，它留作未完成的部分。之后接着做归纳和抽样。'),
  exact('task-plan.ts', '再发送一次这个阅读范围；已读完的部分不重复。', '再发送一次这一部分；已读完的部分不重复。'),
  exact('task-plan.ts', '推荐：这类错误通常是暂时的，再试一次就能安全地补上这个阅读范围', '推荐：这类错误通常是暂时的，再试一次就能安全地补上这一部分'),
  exact('task-plan.ts', '不重试，记为缺口', '不重试，留作未完成的部分'),
  exact('task-plan.ts', '这个阅读范围记为缺口，缺口写进结果；其余照常。', '这一部分不再重试，留作未完成的部分写进结果；其余照常。'),
  exact('task-plan.ts', '把这个回答发送给模型，接着处理这个阅读范围。', '把这个回答发送给模型，接着处理这一部分。'),
  exact('task-plan.ts', '模型需要你的决定来处理这个阅读范围。', '模型需要你的决定来处理这一部分。'),
  exact('task-plan.ts', '每个阅读范围最多提问一次；24 小时未回答将按「不回答」接着做。', '每一部分最多提问一次；24 小时未回答将按「不回答」接着做。'),
  exact('task-plan.ts', '回答后：把你的回答发送给模型一次，接着处理这个阅读范围；已完成的部分保留。', '回答后：把你的回答发送给模型一次，接着处理这一部分；已完成的部分保留。'),
  exact('task-plan.ts', '本社审阅偏好未启用：当前策略未开放', '审阅偏好未启用：当前策略未开放'),
  exact('task-plan.ts', '不把本社审阅偏好当作规则：它只作参考，不改变审阅类别、条款或编辑定稿', '不把审阅偏好当作规则：它只作参考，不改变审阅类别、条款或编辑定稿'),
  // The 后台分析 block's sentences that name the setting itself.
  exact('background-analysis-enrollments.ts', '这本书的后台处理登记记录无法读取，后台分析不会开始；其他图书不受影响。', '这本书的空闲时自动更新分析设置无法读取，后台分析不会开始；其他图书不受影响。'),
  exact('background-analysis-enrollments.ts', '按种类登记后台处理后，这本书有了已确认的改动并空闲时，AI7 才会按登记准备相应工序；每次运行都不超过登记的预算上限，留下精确计划、模型绑定和运行授权，写明登记版本。暂停先不开始新的处理，续行后照常；撤销后不再开始。尚未接入的工序只保留登记，不会派发。',
    '打开空闲时自动更新分析后，这本书有了已确认的改动并空闲时，AI7 才会自动开始相应的分析；每次都不超过你设的用量上限，并留下它的计划。暂停时不开始新的分析，继续后照常；关闭后不再开始。'),
  exact('background-analysis-enrollments.ts', '请设置后台分析的预算上限（tokens）：登记必须有上限。', '请设置用量上限：打开之前必须有上限。'),
];

/** Composed sentences, by shape: the captured parts are kept as they are, the rest is the rule's words. */
const FAMILIES: ReadonlyArray<FamilyRule> = [
  family('task-plan.ts', /^第 ([\d、]+) 个阅读范围上一次的请求已发出、结果未知，可能已被模型服务处理并计费；这项任务会再发一次它的请求，开始任务即重新授权这次发送。$/u,
    (_, units) => `正文第 ${units} 部分上一次的请求已发出、结果未知，可能已被模型服务处理并计费；这项任务会再发一次它的请求，开始任务即重新授权这次发送。`),
  family('task-plan.ts', /^((?:「[^」]+」第 [\d、]+ 个，?)+)阅读范围上一次的请求已发出、结果未知，可能已被模型服务处理并计费；这项任务会再发一次它们的请求，开始任务即重新授权这次发送。$/u,
    (_, named) => `${named.replace(/第 ([\d、]+) 个/gu, '第 $1 部分')}上一次的请求已发出、结果未知，可能已被模型服务处理并计费；这项任务会再发一次它们的请求，开始任务即重新授权这次发送。`),
  // The ceiling in one word (Owner 2026-11-19: no unit, 「用量」 names the number).
  family('task-plan.ts', /^任务运行预算上限：([\d,]+) tokens((?:（\d+ 类合计）|；各成员的模型阶段按工序份额分用)?)$/u,
    (_, count, rest) => `用量上限：${count}${rest}`),
  // A plan's range: the Book's title and where it reads (a heading in 「」, 第 a–b 段, 全书, a scope's name) are kept.
  family('task-plan.ts',
    /^(《[^》]*》.*) · ([\d,]+) 字 · (重新分析 )?([\d,]+) 个阅读范围(（[^（）]*）)?((?:，沿用 [\d,]+ 个)?)$/u,
    (_, where, count, redo, units, spans, reused) => `${where} · ${count} 字 · ${redo ?? ''}${units} 个部分${spans ?? ''}${reused}`),
  // What a plan sends: the ranges' words, then service text; where it goes is kept.
  family('task-plan.ts',
    /^(所读阅读范围|全书各阅读范围|所读范围内)的稿件正文（([^（）]*)）([^《》「」]*?)((?:，发往 .+)?)$/u,
    (_, head, spans, rest, destination) => `${head === '所读阅读范围' ? '所读部分' : head === '全书各阅读范围' ? '全书各部分' : head}的稿件正文（${spans}）${phrased(rest)}${destination}`),
  family('task-plan.ts', /^逐章读取（重新读取 ([\d,]+) 个阅读范围，沿用 ([\d,]+) 个）$/u, (_, read, reused) => `逐章读取（重新读取 ${read} 个部分，沿用 ${reused} 个）`),
  family('task-plan.ts', /^逐章读取（重新读取 (.+)，沿用其余 ([\d,]+) 个阅读范围）$/u, (_, spans, reused) => `逐章读取（重新读取 ${spans}，沿用其余 ${reused} 个部分）`),
  family('task-plan.ts', /^达到 ([\d,]+) tokens 后不再发送新的请求（([\d,]+) 个阅读范围）$/u,
    (_, count, units) => `用量达到 ${count} 后不再发送新的请求（${units} 个部分）`),
  family('task-plan.ts', /^至多 ([\d,]+) tokens((?:（各成员按工序份额分用）|（\d+ 类合计）))$/u, (_, count, rest) => `用量至多 ${count}${rest}`),
  // A writing plan's reference lines: the conclusion in 「」 is the evaluation's own words.
  family('task-plan.ts', /^定稿评估的结论(「.*」)与主要优点 (\d+) 条（这一版没有 AI7 初评的市场部分）$/u,
    (_, conclusion, strengths) => `定稿评估的结论${conclusion}与主要优点 ${strengths} 条（这一版没有评估报告的市场部分）`),
  family('task-plan.ts', /^(资料库资料《[^》]*》：已提取 [\d,]+ 字，按计划冻结的索引版本读取（只参照，不照抄）——[^《》「」]*)再次起草需用「新建文档…」重新准备$/u,
    (_, head) => `${head}再次起草需用「新建衍生稿件…」另做一份计划`),
  // The safe retry's question and why it is asked: the step is named by its own rule (review S9).
  family('task-plan.ts', /^你把「([^」]+)」改成了「先问你」，所以 AI7 先停下这一步来问你。$/u,
    (_, step) => `你把「${ordinaryServiceWords(step)}」改成了「先问你」，所以 AI7 先停下这一步来问你。`),
  family('task-plan.ts', /^第 (\d+) 个阅读范围：模型服务暂时出错，这一次没有读成。要安全地再试一次吗？$/u, (_, unit) => `正文第 ${unit} 部分：模型服务暂时出错，这一次没有读成。要安全地再试一次吗？`),
  // Cancel impact and the redo summary: every unbracketed part is service text or a count.
  family('task-plan.ts',
  /^(?:停在正在读的第|在这两个阅读范围之间停止|正在进行的|这项任务(?:已经停下|还没有)|AI7 上次关闭时这项任务没有结束)[^《》「」]*$/u),
  family('task-plan.ts', /^[^《》「」]*已读完 [\d,]+ 个阅读范围，等你回答 \d+ 个，你已回答但尚未续行 \d+ 个[^《》「」]*$/u),
  family('task-plan.ts', /^第 \d+ 个阅读范围(?:你已回答，但还没有按回答接着做|在等你的回答|的请求已发出、结果未知)[^《》「」]*$/u),
  family('task-plan.ts', /^改计划重做：沿用已读完的 ([\d,]+) 个阅读范围，接着读其余 ([\d,]+) 个$/u, (_, kept, rest) => `重新开始：沿用已读完的 ${kept} 个部分，接着读其余 ${rest} 个`),
  family('task-plan.ts', /^然后准备一项新任务：沿用(?:这|其中有结果的) [\d,]+ 个阅读范围[^《》「」]*$/u),
  family('task-plan.ts', /^这项任务会在这里停下并取消[^《》「」]*$/u),
  // The plan's house-preference rows: the category's own label is kept (review S4).
  family('task-plan.ts', /^([^：]+)：参考本社审阅偏好( v\d+)?$/u, (_, category, version) => `${category}：参考审阅偏好${version ?? ''}`),
  // A Run in the way of a new one (activeRunReason): what kind of Task it is and what cannot be prepared are the service's words.
  family('analysis/run-state.ts', /^有一项运行因(.+)中断，续行或取消它后才能准备(.+)。$/u, (_, why, next) => `有一项运行因${why}中断，继续或取消它后才能准备${next}。`),
  family('analysis/run-state.ts', /^有一项(.+)在等待运行名额；它开始并结束之前，或在任务抽屉里取消它之前，不能准备(.+)。$/u,
    (_, task, next) => `有一项${task}在排队；它开始并结束之前，或在任务抽屉里取消它之前，不能准备${next}。`),
  // A model's default rule: the reference a credential is read by is technical detail (review B1 h); the service and model are kept.
  family('task-plan.ts', /^(.+)（凭据引用 [^（）]*）$/u, (_, service) => service),
  // The 后台分析 block's numbers and run-report lines: the scope's name is kept.
  family('background-analysis-enrollments.ts', /^上限至少要有 (\d+) tokens：范围里每本书至少分到 1 个。$/u, (_, count) => `用量上限至少要有 ${count}：范围里每本书至少分到 1。`),
  family('background-analysis-enrollments.ts', /^由后台处理登记开始(?:（这份登记的版本不在本机记录里）| · 按第 \d+ 版登记)$/u, () => '由空闲时自动更新分析开始'),
  family('background-analysis-enrollments.ts', /^范围：(.+)；登记上限 (\d+) tokens(?:，本书份额 (\d+) tokens)?$/u,
    (_, scope, ceiling, share) => `范围：${scope}；用量上限 ${ceiling}${share === undefined ? '' : `，本书份额 ${share}`}`),
  family('background-analysis-enrollments.ts', /^(达到上限后停下|没有达到上限)：用了 (\d+) tokens，这次运行的上限 (\d+) tokens$/u,
    (_, end, used, frozen) => `${end}：用量 ${used}，这次运行的用量上限 ${frozen}`),
];

/**
 * The 后台分析 block's own sentences where one switch stands for 登记 (ordinary mode, one kind on offer; review N5, S3):
 * they say 打开 and 关闭 as the switch does. Applied by the block to every field it draws under the switch, before the
 * rules above; a sentence with none here reads as everywhere else.
 */
const SWITCH_EXACT: ReadonlyArray<ExactRule> = [
  exact('background-analysis-enrollments.ts', '未登记', '未打开'),
  exact('background-analysis-enrollments.ts', '已登记', '已打开'),
  exact('background-analysis-enrollments.ts', '已撤销', '已关闭'),
  exact('background-analysis-enrollments.ts', '登记记录无法读取', '设置记录无法读取'),
  exact('background-analysis-enrollments.ts', '不超过登记时设下的预算上限，达到上限就停下，不会自己提高上限', '不超过打开时设下的用量上限，达到上限就停下，不会自己提高上限'),
  exact('background-analysis-enrollments.ts', '只分析登记之后的改动', '只分析打开之后的改动'),
  exact('background-analysis-enrollments.ts', '登记时的稿件不分析；之后稿件改动了才开始。', '打开时的稿件不分析；之后稿件改动了才开始。'),
  exact('background-analysis-enrollments.ts', '登记后，只要结果与当前稿件不一致（或还没有结果），就开始。', '打开后，只要结果与当前稿件不一致（或还没有结果），就开始。'),
  exact('background-analysis-enrollments.ts', '已有的结果、运行记录、已经发送的内容和这份登记的历史都保留，不会撤回或改写', '已有的结果、运行记录、已经发送的内容和这项设置的历史都保留，不会撤回或改写'),
  exact('background-analysis-enrollments.ts', '这本书没有登记后台处理：只有你开始的任务才会运行。', '这本书没有打开空闲时自动更新分析：只有你开始的任务才会运行。'),
  exact('background-analysis-enrollments.ts', '已撤销：不会再开始新的后台分析。', '已关闭：不会再开始新的后台分析。'),
  exact('background-analysis-enrollments.ts', '本机数据替换或回滚后，这份登记待你确认：重新登记之前不会开始后台分析。', '本机数据替换或回滚后，这项设置待你确认：重新打开之前不会开始后台分析。'),
  exact('background-analysis-enrollments.ts', '这份登记没有预算上限（登记时还不要求设上限）：后台分析不会开始；请撤销后重新登记并设上限。',
    '这项设置没有用量上限（打开时还不要求设上限）：后台分析不会开始；请关闭后重新打开并设上限。'),
  exact('background-analysis-enrollments.ts', '登记之后稿件还没有改动。', '打开之后稿件还没有改动。'),
  exact('background-analysis-enrollments.ts', '这次启动的模型服务策略没有准许后台分析发送内容：登记了也不会开始，所以现在不能登记。', '这次启动的模型服务策略没有准许后台分析发送内容：打开了也不会开始，所以现在不能打开。'),
  exact('background-analysis-enrollments.ts', '这次启动没有可执行的分析路由：登记了也不会开始后台分析，所以现在不能登记。', '这次启动没有可执行的分析路由：打开了也不会开始后台分析，所以现在不能打开。'),
  exact('background-analysis-enrollments.ts', '当前后台份额没有可用的运行名额，所以现在不能登记。', '后台现在没有可用的空位，所以现在不能打开。'),
  exact('background-analysis-enrollments.ts', '登记内容已经变化；请重新打开登记后再确认。', '这项设置的内容已经变化；请再看一遍选项后再确认。'),
  exact('background-analysis-enrollments.ts', '登记时由你设定（必填）；书系或全部图书按书平分', '打开时由你设定（必填）；书系或全部图书按书平分'),
  exact('background-analysis-enrollments.ts', '这本书已经登记了后台分析；要改，请先撤销登记再重新登记。', '这本书已经打开了空闲时自动更新分析；要改，请先关闭再重新打开。'),
];
const SWITCH_FAMILIES: ReadonlyArray<FamilyRule> = [
  family('background-analysis-enrollments.ts', /^登记时定下的((?:「[^」]+」、?)+)已经变化，后台分析不会按旧的登记开始；请撤销后重新登记。$/u,
    (_, labels) => `打开时定下的${labels}已经变化，后台分析不会按旧的设置开始；请关闭后重新打开。`),
  family('background-analysis-enrollments.ts', /^(《[^》]*》)已经登记了后台分析；请先撤销它的登记，再按这个范围登记。$/u,
    (_, title) => `${title}已经打开了空闲时自动更新分析；请先关闭它的设置，再按这个范围打开。`),
  family('background-analysis-enrollments.ts', /^读不到(《[^》]*》)的分析设置，不能按这个范围登记。$/u, (_, title) => `读不到${title}的分析设置，不能按这个范围打开。`),
];

function exactWords(rules: ReadonlyArray<ExactRule>, families: ReadonlyArray<FamilyRule>, sentence: string): string | undefined {
  const rule = rules.find((entry) => entry.exact === sentence);
  if (rule !== undefined) return rule.words;
  const shape = families.find((entry) => entry.family.test(sentence));
  return shape === undefined ? undefined : sentence.replace(shape.family, shape.words as (substring: string, ...args: string[]) => string);
}

/** The ordinary words of one service-authored sentence, or the sentence as it is when no rule was written for it. */
export function ordinaryServiceWords(sentence: string): string {
  const words = exactWords(EXACT, FAMILIES, sentence);
  if (words !== undefined) return words;
  // A reason of several sentences run together (the run control's and the answer's blockers are joined): each sentence by its own rule.
  const sentences = sentence.split(/(?<=。)(?=.)/u);
  return sentences.length < 2 ? sentence : sentences.map((one) => exactWords(EXACT, FAMILIES, one) ?? one).join('');
}

/** What a page shows for a service-authored sentence: developer mode reads it as the service wrote it. */
export function serviceWords(sentence: string): string;
export function serviceWords(sentence: string | null): string | null;
export function serviceWords(sentence: string | null): string | null {
  return sentence === null ? null : technicalWords(sentence, ordinaryServiceWords(sentence));
}

/** The 后台分析 block's sentence under its one switch (review S3): the switch's words first, then the rules above. */
export function backgroundSwitchWords(sentence: string): string;
export function backgroundSwitchWords(sentence: string | null): string | null;
export function backgroundSwitchWords(sentence: string | null): string | null {
  return sentence === null ? null : technicalWords(sentence, exactWords(SWITCH_EXACT, SWITCH_FAMILIES, sentence) ?? ordinaryServiceWords(sentence));
}

/**
 * A sentence that may be the editor's own (a task's goal): only an EXACT rule rewords it — the service's mode sentences —
 * and anything else, typed by the editor, is shown as it is.
 */
export function serviceGoalWords(sentence: string): string {
  return technicalWords(sentence, EXACT.find((entry) => entry.exact === sentence)?.words ?? sentence);
}

/**
 * A plan's state as the page shows it (review S2): 「正在排队」 is two states — an admitted Run waiting its turn reads 排队中
 * as 待我处理 does, an online plan the service still checks reads 等待开始前检查 — so the key decides before the words.
 */
export function stateWords(state: { readonly key: string; readonly label: string }): string {
  if (state.label === '正在排队') return technicalWords(state.label, state.key === 'running' ? '排队中' : '等待开始前检查');
  return serviceWords(state.label);
}

/** The rules, for the test: every sentence of the eight modules with a banned term is one rule's, or in the test's NOT_SHOWN or KNOWN_RAW. */
export const SERVICE_SENTENCE_RULES: ReadonlyArray<ServiceSentenceRule & { readonly exact?: string; readonly family?: RegExp; readonly underSwitch?: true }> =
  [...EXACT, ...FAMILIES, ...[...SWITCH_EXACT, ...SWITCH_FAMILIES].map((rule) => ({ ...rule, underSwitch: true as const }))];
