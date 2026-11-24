import { technicalWords } from './technical-layer.js';
import type { FactualVerificationResultProjection } from '../shared/protocol.js';

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

/**
 * A 资料库 reference line (0.7.9 wording follow-up): 「按计划冻结的索引版本读取」 is, to the editor, reading the material as it stands when
 * the Task starts; a 「计划冻结的索引版本」 that has gone is the material as it was when the plan was made. The material's title, before
 * 「》：已提取」, is kept exactly as it is.
 */
function materialLineWords(line: string): string {
  const at = line.lastIndexOf('》：已提取');
  const words = (text: string): string => text.replaceAll('按计划冻结的索引版本读取', '按任务开始时的资料内容读取').replaceAll('计划冻结的索引版本', '做计划时的资料内容');
  return at < 0 ? words(line) : line.slice(0, at) + words(line.slice(at));
}

const SAFE_RETRY = exact('analysis/plan-edits.ts', '模型服务暂时出错时，同一个阅读范围安全地再试一次', '模型服务暂时出错时，同一部分安全地再试一次');

const EXACT: ReadonlyArray<ExactRule> = [
  // #1616: display-only wording for service errors, outcomes and disclosures; stored text is untouched.
  exact('analysis/baseline-analysis-store.ts', '开发者实时绑定缺少必需的运行预算上限或凭据引用。', '开发者实时绑定缺少必需的用量上限或密钥引用。'),
  exact('analysis/baseline-analysis-store.ts', '主编辑角色缺少固定的凭据引用元数据。', '主编辑模型缺少已保存的密钥信息。'),
  exact('analysis/baseline-analysis-store.ts', '该任务的前一修订版已不再是结果集的最新修订版；请基于最新修订版重新准备更新。', '这项任务依据的分析结果已不是最新的一份；请基于最新结果另做一份更新计划。'),
  exact('analysis/baseline-analysis-store.ts', '只有事实核查任务有证据保证级别。', '只有事实核查任务可以选择核查力度。'),
  exact('store.ts', '只有事实核查任务有证据保证级别。', '只有事实核查任务可以选择核查力度。'),
  exact('analysis/baseline-analysis-store.ts', '这份计划准备之后，执行它的路由或所用工序已经变了；请重新准备这项任务再修改。', '这份计划准备之后，执行它的模型路线或工序已经变了；请另做一份任务计划再修改。'),
  exact('analysis/baseline-analysis-store.ts', '改计划重做所接续的运行记录缺失。', '重新开始所接续的运行记录缺失。'),
  exact('analysis/baseline-analysis-store.ts', '所选阅读范围已改变，请重新选择。', '所选部分已改变，请重新选择。'),
  exact('analysis/baseline-analysis-store.ts', '任务已启动，等待运行名额。', '任务已启动，正在排队。'),
  exact('analysis/baseline-analysis-store.ts', '本图书已存在结果集修订版；请基于最新修订版重新准备更新。', '这本书已有分析结果；请基于最新结果另做一份更新计划。'),
  exact('analysis/baseline-analysis-store.ts', '该任务的前一修订版已不再是结果集的最新修订版；无法授权。请基于最新修订版重新准备更新。', '这项任务依据的分析结果已不是最新的一份；不能开始。请基于最新结果另做一份更新计划。'),
  exact('analysis/baseline-analysis-store.ts', '计划固定的工序版本已停用，请选择另一个版本重新准备。', '计划固定的工序版本已停用，请选择另一个版本另做一份计划。'),
  exact('analysis/baseline-analysis-store.ts', '编辑在派发前取消了这项等待运行名额的任务；没有发送任何内容，也没有产生用量。', '你在这项排队任务开始前取消了它；没有发送任何内容，也没有产生用量。'),
  exact('analysis/baseline-analysis-store.ts', '续行的参数无效。', '继续任务的参数无效。'),
  exact('analysis/baseline-analysis-store.ts', '这项任务已经变化；无法续行。', '这项任务已经变化；无法继续。'),
  exact('analysis/baseline-analysis-store.ts', '只有已暂停或中断后可续行的任务可以续行。', '只有已暂停或中断后可继续的任务可以继续。'),
  exact('analysis/baseline-analysis-store.ts', '已保存的阅读进度无法核对，这次运行不能续行；请取消它，再重新开始。', '已保存的阅读进度无法核对，这次运行不能继续；请取消它，再重新开始。'),
  exact('analysis/baseline-analysis-store.ts', '已保存的阶段进度无法核对；不能续行。', '已保存的阶段进度无法核对；不能继续。'),
  exact('analysis/baseline-analysis-store.ts', '当前启动的凭据引用或运行预算上限与冻结计划不一致。', '当前启动的密钥引用或用量上限与冻结计划不一致。'),
  exact('analysis/baseline-analysis-wire.ts', '这个阅读范围的分析结果超出可读取范围。', '这一部分的分析结果超出可读取范围。'),
  exact('analysis/baseline-analysis-wire.ts', '分析摘要超出可读取范围，请打开具体阅读范围。', '分析摘要超出可读取范围，请打开具体部分。'),
  exact('analysis/clarification-operations.ts', '按澄清回答接着处理这个阅读范围。', '按回答接着处理这一部分。'),
  exact('analysis/clarifications.ts', '按你的回答，这个阅读范围不重试，记为缺口', '按你的回答，这一部分不重试，留作未完成的部分'),
  exact('analysis/custom-analysis-kind.ts', '逐项查看缺口单元；缺口单元在下一次覆盖它的分析中会重新回答，结果集修订版本身不会改写。已回答的单元仍可查看。', '逐项查看未完成的部分；下一次分析到这些部分时会重新回答，已保存的分析结果不会改写。已回答的部分仍可查看。'),
  exact('analysis/custom-analysis-kind.ts', '运行已在派发后中断；已回答单元的结果与缺口均已保留，续行需要在「分析 › 自定义」中重新运行并授权。', '运行已在开始后中断；已回答的结果与未完成的部分均已保留，需要时可在「分析 › 自定义」中重新运行。'),
  exact('analysis/custom-analysis-kind.ts', '运行已按你的要求取消；已回答单元的结果与缺口均已保留，没有读到的单元记为未尝试。需要时可在「分析 › 自定义」中重新运行。', '运行已按你的要求取消；已回答的结果与未完成的部分均已保留，没有读到的部分记为未尝试。需要时可在「分析 › 自定义」中重新运行。'),
  exact('analysis/execution.ts', '检查结果集修订版的四个状态轴、缺口与冲突清单；稿件变化后可用「同步到当前稿件」，或用「重新分析所选范围」/「重新分析全书」发起新的授权运行，追加后继修订版。', '查看分析结果、未完成的部分与冲突清单；稿件变化后可用「同步到当前稿件」，或用「重新分析所选范围」/「重新分析全书」开始新任务，保存新的分析结果。'),
  exact('analysis/execution.ts', '逐项查看缺口单元与冲突清单；缺口单元在任一更新方式的新授权运行中都会重算，结果集修订版本身不会改写。', '逐项查看未完成的部分与冲突清单；下一次更新分析时会重新处理未完成的部分，已保存的分析结果不会改写。'),
  exact('analysis/execution.ts', '核对运行失败原因；修复后可通过分析更新操作重新准备并授权新的运行。', '核对运行失败原因；处理好之后可通过分析更新操作另做一份计划再开始。'),
  exact('analysis/execution.ts', '运行已在派发后中断；已完成单元的结果与缺口均已保留，续行需要通过分析更新操作发起新的授权运行。', '运行已在开始后中断；已完成的结果与未完成的部分均已保留，需要时可通过分析更新操作开始新任务。'),
  exact('analysis/execution.ts', '运行已按你的要求取消；已完成单元的结果与缺口均已保留，没有读到的单元记为未尝试。需要时可用分析更新操作发起新的授权运行。', '运行已按你的要求取消；已完成的结果与未完成的部分均已保留，没有读到的部分记为未尝试。需要时可用分析更新操作开始新任务。'),
  exact('analysis/execution.ts', '运行在开始阅读任何阅读范围之前已按你的要求取消；没有发送任何内容，也没有形成结果集修订版。', '运行在开始阅读任何部分之前已按你的要求取消；没有发送任何内容，也没有形成分析结果。'),
  exact('analysis/execution.ts', '运行已按你的要求取消。它还没有读完任何阅读范围，因此没有形成结果集修订版；此后没有再发送任何内容。', '运行已按你的要求取消。它还没有读完任何部分，因此没有形成分析结果；此后没有再发送任何内容。'),
  exact('analysis/execution.ts', 'AI7 没有在运行这项任务；已读完的阅读范围都已保存，任务已暂停。', 'AI7 没有在运行这项任务；已读完的部分都已保存，任务已暂停。'),
  exact('analysis/execution.ts', '任务运行预算上限已达到；已完成单元的结果与缺口均已保留，未再发起任何传输。', '任务用量上限已达到；已完成的结果与未完成的部分均已保留，未再发起任何传输。'),
  exact('analysis/execution.ts', '查看已保留的部分结果与缺口；如需继续，请以更高的 --run-budget-ceiling 重新启动并通过分析更新操作发起新的授权运行。', '查看已保留的结果与未完成的部分；如需继续，请在启动时提高用量上限，再通过分析更新操作开始新任务。'),
  exact('analysis/execution.ts', '书系检索范围已变化：这次运行所依据的书系材料已排除在书系检索之外；已完成单元的结果与缺口均已保留，未再发起任何传输。', '书系检索范围已变化：这次运行所依据的书系材料已排除在书系检索之外；已完成的结果与未完成的部分均已保留，未再发起任何传输。'),
  exact('analysis/execution.ts', '修改计划并重新授权，或取消任务；这次运行不能续行、重试，也不会改用别的材料。', '修改计划后重新开始，或取消任务；这次运行不能继续、重试，也不会改用别的材料。'),
  exact('analysis/execution.ts', '本社审阅偏好已停止使用：这次运行参考的偏好版本中有学习材料已停止今后使用；已完成单元的结果与缺口均已保留，未再发起任何传输。', '审阅偏好已停止使用：这次运行参考的偏好版本中有学习材料已停止今后使用；已完成的结果与未完成的部分均已保留，未再发起任何传输。'),
  exact('analysis/execution.ts', '重新执行（不含该影响），或取消任务；这次运行不能续行、重试，也不会改用别的偏好版本。', '重新执行（不含该影响），或取消任务；这次运行不能继续、重试，也不会改用别的偏好版本。'),
  exact('analysis/execution.ts', '核对参考资料，重新准备计划并授权；已完成的单元保留。', '核对参考资料，另做一份计划再开始；已完成的部分保留。'),
  exact('analysis/execution.ts', '点「调整预算并重做」：在新任务的计划里提高或去掉预算上限，沿用这次已读完的阅读范围接着读其余的；这次运行不能续行或重试。', '点「调整预算并重做」：在新任务的计划里提高或去掉用量上限，沿用这次已读完的部分接着读其余的；这次运行不能继续或重试。'),
  exact('analysis/execution.ts', '模型回答对应的阅读范围与本次请求不一致。', '模型回答对应的部分与本次请求不一致。'),
  exact('analysis/execution.ts', '模型回答引用了本次阅读范围之外的内容。', '模型回答引用了本次所读部分之外的内容。'),
  exact('analysis/execution.ts', '只有已暂停或中断后可续行的运行可以续行。', '只有已暂停或中断后可继续的运行可以继续。'),
  exact('analysis/execution.ts', '这次运行授权时的执行绑定已经变化（模型服务、路由、策略或 AI7 版本不同）；不能续行。请改计划重做。', '这次运行开始时的模型服务、路线、策略或 AI7 版本已经变化；不能继续。请重新开始。'),
  exact('analysis/execution.ts', '续行：已进入 AI7 调度器，从已保存的进度接着读。', '继续：已进入 AI7 调度器，从已保存的进度接着读。'),
  exact('analysis/execution.ts', '这项任务未能续行，请查看计划。', '这项任务未能继续，请查看计划。'),
  exact('analysis/execution.ts', '受保护凭据库中没有 opencode-go 开发凭据；未发起任何传输。', '安全存储中没有 opencode-go 开发密钥；未发起任何传输。'),
  exact('analysis/execution.ts', '续行时的执行绑定与这次运行持久化的不一致。', '继续时的执行设置与这次运行保存的不一致。'),
  exact('analysis/execution.ts', '同一阅读范围只能提问一次；模型再次提问，记为契约无效缺口。', '同一部分只能提问一次；模型再次提问，回答格式无效，这一部分未完成。'),
  exact('analysis/execution.ts', '该任务的准许规则不允许模型提问，记为契约无效缺口。', '这项任务的规则不允许模型提问；回答格式无效，这一部分未完成。'),
  exact('analysis/execution.ts', '本社审阅偏好已停止使用，没有再试一次', '审阅偏好已停止使用，没有再试一次'),
  exact('analysis/identity.ts', '对当前书稿执行基线稿件分析，形成覆盖全部结构单元的结果集修订版。', '分析当前书稿的全部部分，保存基线分析结果。'),
  exact('../shared/protocol/task-kinds.ts', '对当前书稿执行基线稿件分析，形成覆盖全部结构单元的结果集修订版。', '分析当前书稿的全部部分，保存基线分析结果。'),
  exact('analysis/plan-boundary.ts', '单个分析单元的模型请求因瞬时模型服务错误（速率限制、服务端错误、传输失败）失败时，在冻结计划内以完全相同的单元消息安全重试一次；不改变执行绑定、运行来源范围、Provider 绑定、预算状态或覆盖清单。第二次失败即记录为缺口。', '单个部分的模型请求遇到临时错误时，按原计划用完全相同的消息安全重试一次；模型服务、范围、用量上限与其他执行设置都不改变。第二次失败时记录为未完成。'),
  exact('analysis/plan-boundary.ts', '模型服务暂时出错时，先问你要不要把这个阅读范围安全地再试一次；只有等你回答的这一步会停下。', '模型服务暂时出错时，先问你要不要把这一部分安全地再试一次；只有等你回答的这一步会停下。'),
  exact('analysis/plan-edits.ts', '证据保证级别', '核查力度'),
  exact('analysis/request-admission-operations.ts', '抽样准入缺少可核对的抽取记录；不能续行。', '找不到可核对的抽样记录；不能继续。'),
  exact('analysis/request-admission-operations.ts', '抽样请求与抽取记录不一致；不能续行。', '抽样请求与抽取记录不一致；不能继续。'),
  exact('analysis/request-admissions.ts', '模型请求准入记录无法核对；不能续行。', '模型请求记录无法核对；不能继续。'),
  exact('analysis/reuse-plan.ts', '上一次读这个单元没有成功；它不在本次审阅范围内，仍记为缺口，只审改动过的章或下一次覆盖它的审阅会重审。', '上一次没有成功读完这一部分；它不在本次审阅范围内，仍记为未完成，只审改动过的章或下一次覆盖它的审阅会重审。'),
  exact('cooperative-jobs.ts', 'AI7 初评的任务计划已准备', '评估报告的任务计划已准备'),
  exact('cooperative-jobs.ts', '正在为任务保存修订版并整理阅读范围…', '正在为任务保存修订版并整理要读的部分…'),
  exact('cooperative-jobs.ts', 'AI7 初评的任务计划准备已取消', '评估报告的任务计划准备已取消'),
  exact('custom-analysis-dimensions.ts', '这项任务没有可以改计划重做的运行。', '这项任务没有可以重新开始的运行。'),
  exact('custom-analysis-dimensions.ts', '只有因计划变化而没能开始的运行需要重新准备。', '只有因计划变化而没能开始的运行需要另做一份计划。'),
  exact('default-execution-rules.ts', '模型未连接：这份计划要发送到模型服务，所需的凭据还没有就绪；连接好之后再开始。', '模型未连接：这份计划要发送到模型服务，所需的密钥还没有就绪；连接好之后再开始。'),
  exact('default-execution-rules.ts', '结果待确认：这项任务会再发一次上一次结果待确认的阅读范围；请在计划里看清这一点，再开始任务。', '结果待确认：这项任务会再发一次上一次结果待确认的部分；请在计划里看清这一点，再开始任务。'),
  exact('dialogue/dialogue-execution.ts', '受保护凭据库中没有你为对话所用模型服务保存的凭据；请在 设置 › 模型服务 重新输入。未发送任何内容。', '安全存储中没有你为对话所用模型服务保存的密钥；请在 设置 › 模型服务 重新输入。未发送任何内容。'),
  exact('dialogue/dialogue-execution.ts', '受保护凭据库中没有对话所用模型服务的开发凭据；未发送任何内容。', '安全存储中没有对话所用模型服务的开发密钥；未发送任何内容。'),
  exact('editorial-marks.ts', '提案范围无效。', '修改建议的范围无效。'),
  exact('editorial-marks.ts', '原子组只能对全部精确成员记录一个处理；拆分需要新的提案版本。', '一组相关修改只能一起处理；拆分需要另存修改建议。'),
  exact('editorial-marks.ts', '开始处理后不能扩展原子组；请创建新提案版本。', '开始处理后不能扩展相关修改组；请另存修改建议。'),
  exact('editorial-marks.ts', '修改建议缺少提案修改项。', '修改建议缺少修改项。'),
  exact('manuscript-export.ts', '修改建议缺少提案修改项。', '修改建议缺少修改项。'),
  exact('proposal-conflicts.ts', '修改建议缺少提案修改项。', '修改建议缺少修改项。'),
  exact('evaluation-records.ts', 'AI7 初评暂不可用。', '评估报告暂不可用。'),
  exact('evaluation-records.ts', '这本书还没有完成的 AI7 初评。', '这本书还没有完成的评估报告。'),
  exact('evaluation-records.ts', '最近一次 AI7 初评没有给出全部评分项的分数；请重新初评。', '最近一次评估报告没有给出全部评分项的分数；请重新生成报告。'),
  exact('evaluation-records.ts', '稿件在最近一次 AI7 初评之后改过；请重新初评，再从初评开始。', '稿件在最近一次评估报告之后改过；请重新生成报告，再从报告开始。'),
  exact('evaluation-records.ts', '评估方案在最近一次 AI7 初评之后变了；请重新初评。', '评估方案在最近一次评估报告之后变了；请重新生成报告。'),
  exact('evaluation-rewrites.ts', '这一版不是从 AI7 初评开始的：没有 AI7 的评语可以按你的评分重写。', '这一版不是从评估报告开始的：没有 AI7 的评语可以按你的评分重新生成。'),
  exact('evaluation/evaluation-rewrite-kind.ts', '在「评估」中查看哪些阅读范围没有读到；全书综合没有写出评语时，可在稿件或网络恢复后再次重写。', '在「评估」中查看哪些部分没有读到；全书综合没有写出评语时，可在稿件或网络恢复后再次生成。'),
  exact('evaluation/evaluation-rewrite-kind.ts', '没有读完的阅读范围，全书综合未发起，AI7 没有重写评语。', '没有读完的部分，全书综合未发起，AI7 没有重新生成评语。'),
  exact('evaluation/initial-evaluation-kind.ts', 'AI7 初评暂不可用：当前的模型处理策略没有写明 AI7 初评的全书综合可以发送给模型，在这个运行范围下不能准备或开始初评。', '评估报告暂不可用：当前的模型处理策略没有允许将全书综合发送给模型，在这个运行范围下不能准备或开始评估。'),
  exact('evaluation/initial-evaluation-kind.ts', 'AI7 初评没有保证抽样阶段：初评分数只作编辑打分的参考。', '评估报告没有抽样复核阶段：AI 初始评分只作编辑打分的参考。'),
  exact('evaluation/initial-evaluation-kind.ts', '在「评估」中从 AI7 初评开始新的一版，逐项看过 AI7 的分数，再按你的判断定分。', '在「评估」中从评估报告开始新的一版，逐项看过 AI7 的分数，再按你的判断定分。'),
  exact('evaluation/initial-evaluation-kind.ts', '在「评估」中查看哪些阅读范围没有读到；全书综合没有给出分数时，可在稿件或网络恢复后重新初评。', '在「评估」中查看哪些部分没有读到；全书综合没有给出分数时，可在稿件或网络恢复后重新生成报告。'),
  exact('evaluation/initial-evaluation-kind.ts', '核对运行失败原因；修复后可在「评估」中重新准备 AI7 初评。', '核对运行失败原因；处理好之后可在「评估」中为评估报告另做一份计划。'),
  exact('evaluation/initial-evaluation-kind.ts', '运行已在派发后中断；已读完的阅读范围已保留，可在「评估」中重新准备 AI7 初评。', '运行已在开始后中断；已读完的部分已保留，可在「评估」中为评估报告另做一份计划。'),
  exact('evaluation/initial-evaluation-kind.ts', '运行已按你的要求取消；需要时可在「评估」中重新准备 AI7 初评。', '运行已按你的要求取消；需要时可在「评估」中为评估报告另做一份计划。'),
  exact('evaluation/initial-evaluation-kind.ts', '没有读完的阅读范围，全书综合未发起，AI7 没有给出初评分数。', '没有读完的部分，全书综合未发起，AI7 没有给出初始评分。'),
  exact('evaluation/readers-report-kind.ts', '在「评估」中查看哪些阅读范围没有读到；全书综合没有写出草稿时，可在稿件或网络恢复后重新起草。', '在「评估」中查看哪些部分没有读到；全书综合没有写出草稿时，可在稿件或网络恢复后重新起草。'),
  exact('evaluation/readers-report-kind.ts', '没有读完的阅读范围，全书综合未发起，AI7 没有写出审稿意见草稿。', '没有读完的部分，全书综合未发起，AI7 没有写出审稿意见草稿。'),
  exact('factual-verification-operations.ts', '所选位置的文字已经改动；不会改到别处，请重新准备更正提案。', '所选位置的文字已经改动；不会改到别处，请另做一份更正建议。'),
  exact('factual-verification.ts', '所选位置的文字已经改动；不会改到别处，请重新准备更正提案。', '所选位置的文字已经改动；不会改到别处，请另做一份更正建议。'),
  exact('factual-verification-operations.ts', '已保存为更正提案：它是普通的修改建议，不会自动应用，是否接受由你决定。', '已保存为更正建议：它是普通的修改建议，不会自动写入稿件，是否接受由你决定。'),
  exact('factual-verification.ts', '已核对来源与原文不符；接受后可以准备更正提案。', '已核对来源与原文不符；接受后可以准备更正建议。'),
  exact('factual-verification.ts', '这条断言尚未开始联网核查；同一阅读范围内其他断言的证据不代表已核查本条。', '这条断言尚未开始联网核查；同一部分内其他断言的证据不代表已核查本条。'),
  exact('factual-verification.ts', '这条核查结果现在不能准备更正提案。', '这条核查结果现在不能准备更正建议。'),
  exact('factual-verification.ts', '核查结果已有新版本；请重新准备更正提案。', '核查结果已有新版本；请另做一份更正建议。'),
  exact('factual-verification.ts', '更正提案的标记与位置不一致。', '更正建议的标记与位置不一致。'),
  exact('factual-verification.ts', '更正提案记录已损坏。', '更正建议记录已损坏。'),
  exact('fast-role/fast-role-execution.ts', '受保护凭据库中没有你为所用模型服务保存的凭据；请在 设置 › 模型服务 重新输入。未发送任何内容。', '安全存储中没有你为所用模型服务保存的密钥；请在 设置 › 模型服务 重新输入。未发送任何内容。'),
  exact('fast-role/fast-role-execution.ts', '受保护凭据库中没有所用模型服务的开发凭据；未发送任何内容。', '安全存储中没有所用模型服务的开发密钥；未发送任何内容。'),
  exact('fast-role/fast-role-execution.ts', '请先保护凭据并选择已准入的文本模型；没有发送任何内容。', '请先保存密钥并选择可用的文本模型；没有发送任何内容。'),
  exact('fast-role/fast-role-suggestions.ts', '重新生成的文字与原提议相同；没有改动解决草稿。这一处可以直接「采用提议内容」。', '重新生成的文字与原建议相同；没有改动解决草稿。这一处可以直接「采用修改建议」。'),
  exact('fast-role/fast-role-suggestions.ts', '已把重新生成的文字放进解决草稿的这一处；稿件和这条修改建议都没有改动，是否保存为新提案版本由你决定。', '已把重新生成的文字放进解决草稿的这一处；稿件和这条修改建议都没有改动，是否另存修改建议由你决定。'),
  exact('house-review-preference.ts', '本社审阅偏好记录与摘要不一致。', '审阅偏好记录与摘要不一致。'),
  exact('house-review-preference.ts', '本社审阅偏好最多 64 条，合计最多 6,000 字；请先合并或停用已有条目。', '审阅偏好最多 64 条，合计最多 6,000 字；请先合并或停用已有条目。'),
  exact('house-review-preference.ts', '这条材料已经不在学习准入之列。', '这条材料已经不能用于学习。'),
  exact('house-review-preference.ts', '学习准入列表位置无效。', '可用于学习的材料列表位置无效。'),
  exact('house-review-preference.ts', '这份学习材料不在学习准入之列。', '这份材料不能用于学习。'),
  exact('house-review-preference.ts', '本社审阅偏好的学习监督已变化', '审阅偏好的学习监督已变化'),
  exact('import-intake-operations.ts', '来源导入完成凭据不完整。', '来源导入完成记录不完整。'),
  exact('import-review-records.ts', '来源导入完成凭据不完整。', '来源导入完成记录不完整。'),
  exact('import-retention.ts', '直接并入正文须明确确认；修订建议不能携带定稿确认。', '直接并入正文须明确确认；修改建议不能携带定稿确认。'),
  exact('import-review-records.ts', '不创建编辑学习准入决定', '不决定是否可用于学习'),
  exact('store.ts', '不创建编辑学习准入决定', '不决定是否可用于学习'),
  exact('import-review-records.ts', '稿件重新导入完成凭据不完整。', '稿件重新导入完成记录不完整。'),
  exact('manuscript-reimport-operations.ts', '稿件重新导入完成凭据不完整。', '稿件重新导入完成记录不完整。'),
  exact('imported-exemplars.ts', '学习准入参数无效。', '是否可用于学习的参数无效。'),
  exact('imported-exemplars.ts', '请决定当前范例版本的学习准入。', '请决定当前范例版本是否可用于学习。'),
  exact('imported-exemplars.ts', '学习准入已改变，请看过当前决定再定。', '是否可用于学习的决定已改变，请看过当前决定再定。'),
  exact('index.ts', '这项任务现在不能续行。', '这项任务现在不能继续。'),
  exact('index.ts', '续行未能进入调度。', '未能继续执行。'),
  exact('initial-evaluation-operations.ts', '书系参考范围已变化；请重新准备计划。', '书系参考范围已变化；请另做一份计划。'),
  exact('learning-eligibility.ts', '学习准入策略还在「仅建议」阶段：没有批准任何可以自动纳入的材料或范围，所以每一条都由你决定。', '可用于学习的材料仍需逐条决定：没有批准任何可以自动纳入的材料或范围。'),
  exact('learning-eligibility.ts', '学习准入记录已损坏。', '是否可用于学习的记录已损坏。'),
  exact('learning-eligibility.ts', '学习准入的选择无效。', '是否可用于学习的选择无效。'),
  exact('learning-eligibility.ts', '这条材料的学习准入刚被改过；请看过现在的决定再定。', '这条材料是否可用于学习的决定刚被改过；请看过现在的决定再定。'),
  exact('learning-eligibility.ts', '学习准入没有变化。', '是否可用于学习的决定没有变化。'),
  exact('library-materials.ts', '学习准入没有变化。', '是否可用于学习的决定没有变化。'),
  exact('library-materials.ts', '这份资料的归属或学习准入刚被改过；请看过现在的决定再定。', '这份资料的使用范围或是否可用于学习的决定刚被改过；请看过现在的决定再定。'),
  exact('library-materials.ts', '学习准入的选项无效。', '是否可用于学习的选项无效。'),
  exact('library-materials.ts', '先定归属，再定学习准入。', '先定给谁用，再定是否可用于学习。'),
  exact('library-materials.ts', '这份资料归属社级，没有可以只纳入的那本书。', '这份资料供本社使用，没有可以只供其学习的那本书。'),
  exact('manuscript-apply.ts', '其中有修改建议已经处理过；请重新准备这次应用。', '其中有修改建议已经处理过；请另做一份修改计划。'),
  exact('manuscript-apply.ts', '找不到这次应用的凭据。', '找不到这次修改的记录。'),
  exact('manuscript-apply.ts', '权威稿件与应用凭据已确认。', '稿件与修改记录已确认。'),
  exact('manuscript-apply.ts', '正在按同一应用标识核对本地权威记录，不会再次派发。', '正在核对这次修改是否已写入稿件，不会重复写入。'),
  exact('manuscript-apply.ts', '权威记录尚不能证明结果；禁止重试或重复应用。可以重新核对权威记录。', '还不能确认这次修改是否已写入稿件；请不要重试或重复写入，可以重新核对。'),
  exact('manuscript-apply.ts', '已重新核对：本地记录中没有这一应用标识的应用意图，证明没有任何修改写入稿件；重新准备后需新的明确批准。', '已重新核对：本地记录中没有这次修改的开始记录，证明没有任何修改写入稿件；另做一份修改计划后需重新确认。'),
  exact('manuscript-apply.ts', '本地原子事务与凭据记录证明此次未提交；重新准备后需新的明确批准。', '本地事务与修改记录证明此次未提交；另做一份修改计划后需重新确认。'),
  exact('manuscript-apply.ts', '找不到原应用凭据。', '找不到原来的修改记录。'),
  exact('manuscript-apply.ts', '这份稿件有尚未确认的应用结果，不能重复应用；请查看应用凭据。', '这份稿件有尚未确认的修改结果，不能重复写入；请查看修改记录。'),
  exact('manuscript-apply.ts', '应用已提交但无法读取凭据。', '修改已提交但无法读取记录。'),
  exact('manuscript-export.ts', '稿件或标记在准备导出后有了变化，请重新准备导出。', '稿件或标记在准备导出后有了变化，请重新选择导出。'),
  exact('manuscript-export.ts', '所选版本不是这本书的生产文档的版本。', '所选版本不是这本书的衍生稿件的版本。'),
  exact('model-search-settings.ts', '联网检索凭据引用不属于该连接。', '联网检索密钥引用不属于该连接。'),
  exact('model-search-settings.ts', '联网检索凭据状态无效。', '联网检索密钥状态无效。'),
  exact('model-search-settings.ts', '模型服务凭据状态无效。', '模型服务密钥状态无效。'),
  exact('model-search-settings.ts', '模型服务凭据引用无效。', '模型服务密钥引用无效。'),
  exact('model-search-settings.ts', '凭据引用无效。', '密钥引用无效。'),
  exact('model-search-settings.ts', '已存连接的凭据引用不可替换。', '已存连接的密钥引用不可替换。'),
  exact('model-search-settings.ts', '这条路线还没有连接；请先保存它的连接名称与凭据。', '这条路线还没有连接；请先保存它的连接名称与密钥。'),
  exact('model-search-settings.ts', '请先保护并保存凭据。', '请先保护并保存密钥。'),
  exact('production-document-operations.ts', '生产文档参数无效。', '衍生稿件参数无效。'),
  exact('production-document-operations.ts', '这本书没有这份生产文档。', '这本书没有这份衍生稿件。'),
  exact('production-document-origins.ts', '生产文档的来源读取记录无效。', '衍生稿件的来源读取记录无效。'),
  exact('production-document-origins.ts', '生产文档的来源读取记录与其摘要不一致。', '衍生稿件的来源读取记录与其摘要不一致。'),
  exact('production-document-workflow.ts', '生产文档缺少工作流程记录。', '衍生稿件缺少工作流程记录。'),
  exact('production-document-workflow.ts', '生产文档的工作流程记录与其内容不一致。', '衍生稿件的工作流程记录与其内容不一致。'),
  exact('production-documents.ts', '生产文档记录无效。', '衍生稿件记录无效。'),
  exact('production-documents.ts', '先导入稿件，再创建生产文档', '先导入稿件，再创建衍生稿件'),
  exact('production-documents.ts', '跨交付物一致性所依据的交付物定稿版本或参与状态已经变化；请重新准备这次审阅。', '跨交付物一致性所依据的交付物定稿版本或参与状态已经变化；请为这次审阅另做一份计划。'),
  exact('production-documents.ts', '生产文档记录与其摘要不一致。', '衍生稿件记录与其摘要不一致。'),
  exact('production-documents.ts', '生产文档的图书身份无效。', '衍生稿件的图书身份无效。'),
  exact('production-documents.ts', '生产文档没有版本。', '衍生稿件没有版本。'),
  exact('production-documents.ts', '生产文档版本与其修订版不一致。', '衍生稿件版本与其修订版不一致。'),
  exact('production-documents.ts', '生产文档段落与其摘要不一致。', '衍生稿件段落与其摘要不一致。'),
  exact('production-documents.ts', '生产文档的工作状态缺失。', '衍生稿件的工作状态缺失。'),
  exact('production-documents.ts', '生产文档的版本顺序无效。', '衍生稿件的版本顺序无效。'),
  exact('proposal-conflicts.ts', '这处冲突的草稿保存次数已达上限；请保存为新提案版本，或选择其他处理方式。', '这处冲突的草稿保存次数已达上限；请另存修改建议，或选择其他处理方式。'),
  exact('proposal-conflicts.ts', '还有未解决的冲突；每一处都选定后才能保存为新提案版本。', '还有未解决的冲突；每一处都选定后才能另存修改建议。'),
  exact('provider/classification.ts', '代理不可达：请检查网络代理设置后续行。', '代理不可达：请检查网络代理设置后继续。'),
  exact('provider/classification.ts', '凭据不可用：模型服务拒绝了所提供的凭据。', '密钥不可用：模型服务拒绝了所提供的密钥。'),
  exact('provider/credential-broker.ts', '凭据槽位绑定无效。', '密钥槽位绑定无效。'),
  exact('provider/credential-broker.ts', '模型选择或凭据已变化；本次凭据未释放，请重新确认。', '模型选择或密钥已变化；本次密钥未释放，请重新确认。'),
  exact('provider/credential-broker.ts', '正式使用不读取开发凭据引用；未读取任何凭据。', '正式使用不读取开发密钥引用；未读取任何密钥。'),
  exact('provider/credential-broker.ts', '模型列表凭据绑定无效。', '模型列表密钥绑定无效。'),
  exact('provider/credential-broker.ts', '安全凭据库中没有该凭据引用的值。', '安全存储中没有这个密钥引用的值。'),
  exact('provider/credential-broker.ts', '没有本次连接测试的单次决定；凭据未释放。', '没有本次连接测试的单次决定；密钥未释放。'),
  exact('provider/credential-broker.ts', '没有本次绑定的 transmit-remote 决定；凭据未释放。', '没有本次连接允许发送的决定；密钥未释放。'),
  exact('provider/deepseek-adapter.ts', '模型服务拒绝了凭据。', '模型服务拒绝了密钥。'),
  exact('provider/egress-gate.ts', '所选策略未准许这一候选接口或其固定查询；未读取凭据，也未发送任何内容。', '所选策略未准许这一候选接口或其固定查询；未读取密钥，也未发送任何内容。'),
  exact('provider/egress-gate.ts', '连接测试需要已保存的对应渠道凭据；请先在设置中保存。', '连接测试需要已保存的对应渠道密钥；请先在设置中保存。'),
  exact('provider/model-discovery.ts', '模型服务拒绝了凭据', '模型服务拒绝了密钥'),
  exact('provider/search-service.ts', '联网检索需要本后端的受保护凭据。', '联网检索需要本后端的受保护密钥。'),
  exact('provider/search-service.ts', '连接测试未完成：凭据未释放或请求未发送；请检查本页保存的密钥后重试。', '连接测试未完成：密钥未释放或请求未发送；请检查本页保存的密钥后重试。'),
  exact('research-evidence.ts', '续行不能删除或改写先前留存的来源。', '继续不能删除或改写先前留存的来源。'),
  exact('research-evidence.ts', '续行不能减少先前留存的取证账目。', '继续不能减少先前留存的取证记录。'),
  exact('review/deterministic/plan.ts', '本地检查计划或输入无效；请重新准备。', '本地检查计划或输入无效；请另做一份计划。'),
  exact('review/live-review-admission.ts', '请先在设置 › 模型服务中配置模型凭据。', '请先在设置 › 模型服务中配置模型密钥。'),
  exact('review/review-category-kind.ts', '逐项查看缺口单元；缺口单元在下一次覆盖它的审阅中会重审，结果集修订版本身不会改写。已定位的发现仍可逐条处置。', '逐项查看未完成的部分；下一次审阅到这些部分时会重审，已保存的分析结果不会改写。已定位的发现仍可逐条处理。'),
  exact('review/review-category-kind.ts', '核对运行失败原因；修复后可在「审阅」中重新准备并授权新的运行。', '核对运行失败原因；处理好之后可在「审阅」中另做一份计划再开始。'),
  exact('review/review-category-kind.ts', '运行已在派发后中断；已完成单元的发现与缺口均已保留，续行需要在「审阅」中发起新的授权运行。', '运行已在开始后中断；已完成的发现与未完成的部分均已保留，需要时可在「审阅」中开始新任务。'),
  exact('review/review-category-kind.ts', '运行已按你的要求取消；已完成单元的发现与缺口均已保留，没有读到的单元记为未尝试。需要时可在「审阅」中发起新的授权运行。', '运行已按你的要求取消；已完成的发现与未完成的部分均已保留，没有读到的部分记为未尝试。需要时可在「审阅」中开始新任务。'),
  exact('review/review-runs.ts', '服务在这一类运行期间停止，运行已中断；已完成单元的结果与缺口保留在该类别的账本中。', '服务在这一类运行期间停止，运行已中断；已完成的结果与未完成的部分保留在该类别的记录中。'),
  exact('review/review-runs.ts', '稿件修订或范围已变化；本地检查没有继续，请重新准备。', '稿件修订或范围已变化；本地检查没有继续，请另做一份计划。'),
  exact('review/review-runs.ts', '本地检查的冻结正文或段落顺序已变化；请重新准备。', '本地检查的冻结正文或段落顺序已变化；请另做一份计划。'),
  exact('analysis/curation-runs.ts', '恢复凭据后可重试。', '恢复密钥后可重试。'),
  exact('analysis/execution.ts', '学习整理所需的凭据已不可用，恢复后可重试。', '学习整理所需的密钥已不可用，恢复后可重试。'),
  exact('review/review-runs.ts', '依据的字表已删除，请重新准备本地检查。', '依据的字表已删除，请另做一份本地检查计划。'),
  exact('review/review-runs.ts', '稿件已变化；请重新准备本地检查。', '稿件已变化；请另做一份本地检查计划。'),
  exact('review/review-runs.ts', '本地检查未完成；请重新准备。', '本地检查未完成；请另做一份计划。'),
  exact('review/review-runs.ts', '只有事实核查任务可以选择证据保证级别。', '只有事实核查任务可以选择核查力度。'),
  exact('review/review-runs.ts', '稿件在准备期间已变化；请重新准备。', '稿件在准备期间已变化；请另做一份计划。'),
  exact('review/review-runs.ts', '这次审阅需要先取消，才能改计划重做。', '这次审阅需要先取消，才能重新开始。'),
  exact('review/review-runs.ts', '已形成结果集修订版 · 有缺口单元。', '已形成分析结果 · 有未完成的部分。'),
  // Stage-4/5 rework R6: state words and names an editor reads on 分析, 审阅, 工作概览 and in AI 助手.
  exact('review/review-runs.ts', '已形成结果集修订版。', '已形成分析结果。'),
  exact('analysis/baseline-analysis-store.ts', '已形成结果集修订版', '已形成分析结果'),
  exact('analysis/baseline-analysis-store.ts', '计划已冻结 · 待授权', '已准备好 · 还没有开始'),
  exact('review/review-run-state.ts', '计划已冻结 · 待授权', '已准备好 · 还没有开始'),
  exact('procedures/preinstalled.ts', '按我的评分重写评语', '按我的评分重新生成评语'),
  // 0.7.9 wording follow-up: AI7's fixed fact-check document, by its stored title (an editor's own document title has no rule).
  exact('review/category-configuration.ts', '事实核查契约', '事实核查规则'),
  // The fallback when a part failed with no classified reason (stage re-check).
  exact('analysis/execution.ts', '适配器失败。', '模型服务没有给出可用的回答。'),
  exact('review/review-runs.ts', '本地检查未能完成；请重新准备。', '本地检查未能完成；请另做一份计划。'),
  exact('review/review-runs.ts', 'AI7 上次关闭时这项任务还在等待空闲，没有开始；请重新准备并开始。', 'AI7 上次关闭时这项任务还在等待空闲，没有开始；请另做一份计划再开始。'),
  exact('review/review-runs.ts', '无法读取的本社审阅偏好记录', '无法读取的审阅偏好记录'),
  exact('review/review-scope.ts', '这份稿件还没有可选的章：它既没有标题，也还没有可分的结构单元。', '这份稿件还没有可选的章：它既没有标题，也还没有可分的部分。'),
  exact('series-exclusions.ts', '图书、稿件和来源版本不会被删除或隐藏；书系成员和学习准入都不变。', '图书、稿件和来源版本不会被删除或隐藏；书系成员和是否可用于学习的决定都不变。'),
  exact('series-exclusions.ts', '它们只能「修改计划并重新授权」或「取消任务」，不能续行、重试，也不会改用别的材料。', '它们只能「修改计划并重新授权」或「取消任务」，不能继续、重试，也不会改用别的材料。'),
  exact('series.ts', '书系知识、学习准入和学习记录各有自己的决定；加入书系不会纳入、启用或删除它们。', '书系知识、是否可用于学习和学习记录各有自己的决定；加入书系不会纳入、启用或删除它们。'),
  exact('series.ts', '书系知识、学习准入和学习记录各有自己的决定；移出书系不会删除或改动它们。', '书系知识、是否可用于学习和学习记录各有自己的决定；移出书系不会删除或改动它们。'),
  exact('store-operation-support.ts', '事实核查 · 更正提案', '事实核查 · 更正建议'),
  exact('store.ts', 'AI7 初评还没有准备计划。', '评估报告还没有准备计划。'),
  exact('store.ts', '这一版在准备重写之后又保存过：这份计划依据的是之前的分数；请按现在的评分重新准备重写。', '这一版在准备之后又保存过：这份计划依据的是之前的分数；请按现在的评分另做一份生成评语的计划。'),
  exact('store.ts', '本社与本书编辑偏好已变化，请重新准备任务。', '本社与本书编辑偏好已变化，请另做一份任务计划。'),
  exact('store.ts', '补充核查的决定、断言或来源已变化；请重新准备并批准。', '补充核查的决定、断言或来源已变化；请另做一份计划并确认。'),
  exact('task-authorization.ts', '主编辑角色缺少固定的未就绪凭据引用元数据。', '主编辑模型缺少未就绪密钥的引用信息。'),
  exact('task-material-references.ts', '这份资料计划冻结的索引版本已不在本机；重新准备计划（会按资料现在的索引版本冻结）并授权，或在新计划里去掉这份资料；已完成的单元保留。', '这份资料做计划时的内容已不在本机；另做一份计划（会使用资料现在的内容）再开始，或在新计划里去掉这份资料；已完成的部分保留。'),
  exact('task-material-references.ts', '这份资料已撤回允许参考；在资料库重新准入后重新准备计划并授权，或在新计划里去掉这份资料；已完成的单元保留。', '这份资料已撤回允许参考；在资料库重新允许参考后另做一份计划再开始，或在新计划里去掉这份资料；已完成的部分保留。'),
  exact('task-material-references.ts', '这份资料的索引记录已损坏；先在资料库处理这份资料，再重新准备计划并授权，或在新计划里去掉它；已完成的单元保留。', '这份资料的索引记录已损坏；先在资料库处理这份资料，再另做一份计划再开始，或在新计划里去掉它；已完成的部分保留。'),
  exact('task-material-references.ts', '资料库里还没有这本书可以参考的资料：资料定了归属（这本书或社级）与学习准入、建好索引以后，才能在这里勾选，列进「允许参考」。', '资料库里还没有这本书可以参考的资料：资料定了给谁用（这本书或本社）与是否可用于学习、建好索引以后，才能在这里勾选，列进「允许参考」。'),
  exact('writing-tasks.ts', '资料库里还没有这本书可以参考的资料：资料定了归属（这本书或社级）与学习准入、建好索引以后，才能在这里勾选，列进「允许参考」。', '资料库里还没有这本书可以参考的资料：资料定了给谁用（这本书或本社）与是否可用于学习、建好索引以后，才能在这里勾选，列进「允许参考」。'),
  exact('task-material-references.ts', '可以用「新建文档…」重新准备。', '可以用「新建衍生稿件…」另做一份计划。'),
  exact('task-relaunch.ts', '只有开始后取消的运行可以改计划重做。', '只有开始后取消的运行可以重新开始。'),
  exact('writing/writing-contract.ts', '这次起草参照的范例已不在本机，不能再开始；可以用「新建文档…」重新准备。', '这次起草参照的范例已不在本机，不能再开始；可以用「新建衍生稿件…」另做一份计划。'),
  exact('writing/writing-kind.ts', '在「交付物」中查看哪些阅读范围没有读到；全书综合没有写出草稿（包括因照抄范例被拒绝）时，可以重新起草。', '在「交付物」中查看哪些部分没有读到；全书综合没有写出草稿（包括因照抄范例被拒绝）时，可以重新起草。'),
  exact('writing/writing-kind.ts', '没有读完的阅读范围，全书综合未发起，AI7 没有写出文档草稿。', '没有读完的部分，全书综合未发起，AI7 没有写出衍生稿件草稿。'),
  exact('../shared/protocol.ts', '模型服务需设置：请先在设置 › 模型服务中配置模型凭据；这次没有发送任何内容。', '模型服务需设置：请先在设置 › 模型服务中配置模型密钥；这次没有发送任何内容。'),
  exact('../shared/protocol/analysis.ts', 'AI7 初评是模型据所读稿件给出的初步分数与评语，只作编辑打分的参考；记录保存的是编辑的评分，结论由编辑选定。', '评估报告是模型据所读稿件给出的初步分数与评语，只作编辑打分的参考；记录保存的是编辑的评分，结论由编辑选定。'),
  exact('../shared/protocol/series.ts', '所参考的本社审阅偏好已停止使用 · 需要重新确认计划', '所参考的审阅偏好已停止使用 · 需要重新确认计划'),
  exact('../shared/protocol/task-kinds.ts', 'AI7 初评', '评估报告'),
  exact('../shared/review-synthesis-wording.ts', '全书或多章审阅结束后，若覆盖多个阅读范围且已有模型发现，再向本次选定模型发送一次统合请求，计入本次预算；达到本次预算上限后不再发送新的请求，已发出的请求仍计入用量。发送发现的说明与引文（各最多 80 字）、证据索引及可用的分章概述（每段最多 400 字），不发送这些内容以外的章节正文。最多选取 200 条代表发现与 200 条证据、200 段概述；按出现次数保留可引用的问题组，概述保留独立的容量份额并利用剩余空间，容量不足时先均匀缩短再省略末尾，并说明覆盖缺口、缩短与省略数量。参考资料与编辑记忆沿用同一处理方式；本社审阅偏好、编辑任务说明及豁免规则沿用首个模型审阅类别。各类别规范条款已体现在发现中，统合时不另附原条款。', '全书或多章审阅结束后，若覆盖多个部分且已有模型发现，再向本次选定模型发送一次统合请求，计入本次预算；达到本次预算上限后不再发送新的请求，已发出的请求仍计入用量。发送发现的说明与引文（各最多 80 字）、证据索引及可用的分章概述（每段最多 400 字），不发送这些内容以外的章节正文。最多选取 200 条代表发现与 200 条证据、200 段概述；按出现次数保留可引用的问题组，概述保留独立的容量份额并利用剩余空间，容量不足时先均匀缩短再省略末尾，并说明未完成的部分、缩短与省略数量。参考资料与编辑记忆沿用同一处理方式；审阅偏好、编辑任务说明及豁免规则沿用首个模型审阅类别。各类别规范条款已体现在发现中，统合时不另附原条款。'),
  exact('../shared/protocol.ts', '模型服务凭据由操作系统单独保护，不在产品数据中，也不随产品数据复制。', '模型服务密钥由操作系统单独保护，不在产品数据中，也不随产品数据复制。'),
  exact('analysis/run-state.ts', '只有这本书最近一项任务里开始后取消、或因预算上限停止的运行可以改计划重做。', '只有这本书最近一项任务里开始后取消、或因用量上限停止的运行可以重新开始。'),
  exact('analysis/run-state.ts', '改计划重做沿用这次运行已读完的部分，接着读其余的；什么都没读完时，照原样从头再做。', '重新开始时沿用这次运行已读完的部分，接着读其余的；什么都没读完时，照原样从头再做。'),
  exact('background-analysis-enrollments.ts', '后台处理登记的预算上限无效。', '自动更新分析设置的预算上限无效。'),
  exact('background-analysis-enrollments.ts', '后台处理登记记录无效。', '自动更新分析设置记录无效。'),
  exact('background-analysis-enrollments.ts', '后台处理登记记录与其摘要不一致。', '自动更新分析设置记录与其摘要不一致。'),
  exact('background-analysis-enrollments.ts', '后台处理登记记录与其字段不一致。', '自动更新分析设置记录与其字段不一致。'),
  exact('background-analysis-enrollments.ts', '后台处理登记的参数无效。', '自动更新分析设置的参数无效。'),
  exact('background-analysis-enrollments.ts', '后台处理登记标识无效。', '自动更新分析设置标识无效。'),
  exact('background-analysis-enrollments.ts', '这份后台处理登记不存在。', '这份自动更新分析设置不存在。'),
  exact('background-analysis-enrollments.ts', '后台处理登记版本标识无效。', '自动更新分析设置版本标识无效。'),
  exact('background-analysis-enrollments.ts', '后台处理登记版本指向的登记不存在。', '自动更新分析设置版本指向的设置不存在。'),
  exact('background-analysis-enrollments.ts', '后台处理登记状态无效。', '自动更新分析设置状态无效。'),
  exact('background-analysis-enrollments.ts', '后台处理登记的起点无效。', '自动更新分析设置的起点无效。'),
  exact('background-analysis-enrollments.ts', '后台处理登记记录的绑定无效。', '自动更新分析设置记录的绑定无效。'),
  exact('background-analysis-enrollments.ts', '后台处理登记缺少状态记录。', '自动更新分析设置缺少状态记录。'),
  exact('background-analysis-enrollments.ts', '后台处理登记种类不一致。', '自动更新分析设置种类不一致。'),
  exact('background-analysis-enrollments.ts', '后台处理登记状态指向的版本不存在。', '自动更新分析设置状态指向的版本不存在。'),
  exact('background-analysis-enrollments.ts', '后台处理登记状态种类不一致。', '自动更新分析设置状态种类不一致。'),
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
  family('analysis/baseline-analysis-store.ts', /^(.*?)(所选文字已扩展为所在的) (\d+) 个完整段落；任务按包含这些段落的阅读范围处理。$/u,
    (_, prefix, lead, count) => `${ordinaryServiceWords(prefix)}${lead} ${count} 个完整段落；任务按包含这些段落的部分处理。`),
  family('review/review-runs.ts', /^(.*?)(所选文字已扩展为所在的) (\d+) 个完整段落；任务按包含这些段落的阅读范围处理。$/u,
    (_, prefix, lead, count) => `${ordinaryServiceWords(prefix)}${lead} ${count} 个完整段落；任务按包含这些段落的部分处理。`),
  family('task-intent-drafts.ts', /^(.*?)(所选文字已扩展为所在的) (\d+) 个完整段落；任务按包含这些段落的阅读范围处理。$/u,
    (_, prefix, lead, count) => `${ordinaryServiceWords(prefix)}${lead} ${count} 个完整段落；任务按包含这些段落的部分处理。`),
  family('analysis/baseline-analysis-store.ts', /^计划的关键内容已经变化：(.+)。这次运行不能照原计划续行；请改计划重做。$/u,
    (_, changed) => `计划的关键内容已经变化：${changed}。这次运行不能照原计划继续；请重新开始。`),
  family('analysis/clarifications.ts', /^已读完 (\d+) \/ (\d+) 个阅读范围；((?:第 \d+ 个、?)+)阅读范围在等你的回答，回答后接着做。$/u,
    (_, settled, total, units) => `已读完 ${settled} / ${total} 个部分；${units}部分在等你的回答，回答后接着做。`),
  family('analysis/execution.ts', /^已暂停：全部 \d+ 个阅读范围都已读完，结果都已保存。点「续行」只处理尚未完成的步骤，已保存的步骤不会重做。$/u,
    (sentence) => phrased(sentence)),
  family('analysis/execution.ts', /^已在阅读范围之间暂停：已读完 \d+ \/ \d+ 个阅读范围，结果都已保存。点「续行」从下一个阅读范围接着读。$/u,
    (sentence) => phrased(sentence)),
  family('analysis/execution.ts', /^AI7 关闭时这项任务正在运行：(全部 \d+|已读完 \d+ \/ \d+) 个阅读范围(都已读完，结果都已保存。点「续行」接着做之后的归纳与抽样|，结果都已保存。点「续行」从下一个阅读范围接着读)；在此之前不会发送任何内容。$/u,
    (sentence) => phrased(sentence)),
  family('analysis/execution.ts', /^模型服务账户限额：模型服务按账户限额拒绝了请求，这项任务已停下。(全部 \d+|已读完 \d+ \/ \d+) 个阅读范围(都已读完，结果都已保存。处理好模型服务、限额解除后点「续行」接着做之后的归纳与抽样|，结果都已保存。处理好模型服务、限额解除后点「续行」从下一个阅读范围接着读)；在此之前不会发送任何内容。$/u,
    (sentence) => phrased(sentence)),
  family('analysis/execution.ts', /^等待运行的队列已满（最多 (\d+) 项）；没有开始这项任务。请等已有任务开始或取消后，再重新准备并开始。$/u,
    (_, count) => `等待运行的队列已满（最多 ${count} 项）；没有开始这项任务。请等已有任务开始或取消后，再另做一份计划并开始。`),
  family('analysis/execution.ts', /^运行名额已满：本实例一次执行 (\d+) 个运行。$/u,
    (_, count) => `正在执行的任务已满：本实例一次执行 ${count} 个任务。`),
  family('analysis/execution.ts', /^受保护凭据库中没有你为 (.+) 保存的凭据；请在 设置 › 模型服务 重新输入。未发起任何传输。$/u,
    (_, route) => `安全存储中没有你为 ${route} 保存的密钥；请在 设置 › 模型服务 重新输入。未发起任何传输。`),
  family('analysis/execution.ts', /^续行：新的执行区段；已读完的 (\d+) 个阅读范围沿用，接着读其余 (\d+) 个。$/u,
    (_, kept, remaining) => `继续：开始下一段执行；沿用已读完的 ${kept} 个部分，接着读其余 ${remaining} 个。`),
  family('analysis/execution.ts', /^运行终态：cancelled；按你的取消在阅读范围之间停止，已完成的结果与缺口均已保留，没有读到的阅读范围记为未尝试；结果集修订版 (.+)（Revision (.+)）。$/u,
    () => "运行已取消：在两部分之间停止，已完成的结果与未完成的部分均已保留，没有读到的部分记为未尝试。"),
  family('analysis/factual-review-reducers.ts', /^覆盖：部分 · (\d+)\/(\d+) 单元 · (\d+) 个范围外未核查 · (\d+) 处缺口$/u,
    (_, closed, total, outside, gaps) => `覆盖：部分 · ${closed}/${total} 个部分 · ${outside} 个在范围外未核查 · ${gaps} 处未完成`),
  family('analysis/reducers.ts', /^覆盖：部分 · (\d+)\/(\d+) 单元 · (\d+) 处缺口( · 复用 \d+ 单元)?$/u,
    (_, closed, total, gaps, reused) => `覆盖：部分 · ${closed}/${total} 个部分 · ${gaps} 处未完成${reused ?? ""}`),
  family('analysis/request-admission-operations.ts', /^第 (\d+) 个阅读范围(.+)本次运行不会再次发送。$/u,
    (_, unit, recovered) => `正文第 ${unit} 部分${recovered}本次运行不会再次发送。`),
  family('analysis/run-report.ts', /^第 (\d+) 个阅读范围的模型问题：(.+)。$/u,
    (_, unit, outcome) => `正文第 ${unit} 部分的模型问题：${outcome}。`),
  family('captured-procedures.ts', /^这次审阅按可复用工序(《.*》)第 (\d+) 版准备，(本机没有这一版|这一版已停用)；请重新准备这次审阅。$/u,
    (_, title, version, why) => `这次审阅按可复用工序${title}第 ${version} 版准备，${why}；请为这次审阅另做一份计划。`),
  family('evaluation-records.ts', /^第 (\d+) 版已经是这份 AI7 评估报告，直接在报告上修改即可。$/u,
    (_, version) => `第 ${version} 版已经是这份评估报告，直接在报告上修改即可。`),
  family('factual-verification.ts', /^(锚点已失效)：不能在已改动的文字上准备更正提案。$/u,
    (_, label) => `${label}：不能在已改动的文字上准备更正建议。`),
  family('house-review-preference.ts', /^本社审阅偏好 v(\d+)（来源：(\d+) 条已判定反馈）$/u,
    (_, version, count) => `审阅偏好 v${version}（来源：${count} 条已判定反馈）`),
  family('initial-evaluation-operations.ts', /^AI7 初评暂不可用：(.+)$/u,
    (_, reason) => `评估报告暂不可用：${ordinaryServiceWords(reason)}`),
  family('manuscript-apply.ts', /^将创建一次新的受控应用，撤销 (\d+) 项精确修改；原应用凭据保持原样。$/u,
    (_, count) => `将撤销 ${count} 项修改并保存新的修改记录；原来的修改记录保持原样。`),
  family('provider/egress-gate.ts', /^连接测试只在本机正式使用下发送；当前环境（(.+)）不读取凭据，也不发送任何内容。$/u,
    (_, scope) => `连接测试只在本机正式使用下发送；当前环境（${scope}）不读取密钥，也不发送任何内容。`),
  family('readers-reports.ts', /^(.*?)(本社有 \d+ 份审稿意见范例|另有 \d+ 份范例)的学习准入记录已损坏，无法读取，(本次不参考范例|本次不参考)：(《.*》)$/u,
    (_, before, count, consequence, titles) => `${ordinaryServiceWords(before)}${count}是否可用于学习的记录已损坏，无法读取，${consequence}：${titles}`),
  family('review/review-runs.ts', /^(「.*」)所依据的书系或书系知识在准备之后有了变化；请重新准备这次审阅。$/u,
    (_, label) => `${label}所依据的书系或书系知识在准备之后有了变化；请为这次审阅另做一份计划。`),
  family('review/review-runs.ts', /^任务运行预算上限：([\d,]+) tokens$/u,
    (_, count) => `用量上限：${count}`),
  family('review/review-runs.ts', /^(「.*」)的计划需要重新准备。$/u,
    (_, label) => `${label}需要另做一份计划。`),
  family('review/review-runs.ts', /^(「.*」)的计划已经变化；请重新准备这次审阅。$/u,
    (_, label) => `${label}的计划已经变化；请为这次审阅另做一份计划。`),
  family('review/review-runs.ts', /^(.+)（已读 (\d+)\/(\d+) 个阅读范围；(.+)）$/u,
    (_, label, read, total, why) => `${label}（已读 ${read}/${total} 个部分；${why}）`),
  family('review/review-runs.ts', /^基线概述（缺少第 ([\d、–-]+) 阅读范围）$/u,
    (_, units) => `基线概述（缺少第 ${units} 部分）`),
  family('review/review-runs.ts', /^本社审阅偏好 v(\d+)$/u,
    (_, version) => `审阅偏好 v${version}`),
  family('review/review-runs.ts', /^(.*?)已读完 (\d+)\/(\d+) 个阅读范围；(.+)；已完成范围的发现仍可处理。$/u,
    (_, detail, read, total, warning) => `${ordinaryServiceWords(detail)}已读完 ${read}/${total} 个部分；${ordinaryServiceWords(warning)}；已完成范围的发现仍可处理。`),
  family('review/review-runs.ts', /^(.+)参考的本社审阅偏好版本中，有学习材料在这次审阅之后停止今后使用。这次审阅的结果、发现和报告都保持原样；这个标记不表示结果有错。$/u,
    (_, named) => `${named}参考的审阅偏好版本中，有学习材料在这次审阅之后停止今后使用。这次审阅的结果、发现和报告都保持原样；这个标记不表示结果有错。`),
  family('review/review-runs.ts', /^(「.*」)参考的本社审阅偏好记录无法读取，无法核对它的学习材料是否已停止今后使用；请重新准备这次审阅。$/u,
    (_, label) => `${label}参考的审阅偏好记录无法读取，无法核对它的学习材料是否已停止今后使用；请为这次审阅另做一份计划。`),
  family('review/review-runs.ts', /^(「.*」)参考的本社审阅偏好 v(\d+) 中有 (\d+) 条学习材料已停止今后使用；请重新准备这次审阅，新的计划不含该影响。$/u,
    (_, label, version, count) => `${label}参考的审阅偏好 v${version} 中有 ${count} 条学习材料已停止今后使用；请为这次审阅另做一份计划，新的计划不含该影响。`),
  family('series-exclusions.ts', /^(书系检索范围已变化 · 需要重新确认计划)：所依据的书系材料已排除在书系检索之外，运行在下一个阅读范围前停下；已读完的结果保留，已经发给模型服务的内容无法收回。$/u,
    (_, label) => `${label}：所依据的书系材料已排除在书系检索之外，运行在下一部分前停下；已读完的结果保留，已经发给模型服务的内容无法收回。`),
  family('series-exclusions.ts', /^(「.*」)：(书系检索范围已变化 · 需要重新确认计划)——它所依据的(.+)在这次审阅准备之后被排除在书系检索之外；请重新准备这次审阅。$/u,
    (_, label, why, targets) => `${label}：${why}——它所依据的${targets}在这次审阅准备之后被排除在书系检索之外；请为这次审阅另做一份计划。`),
  family('series-exclusions.ts', /^(\d+) 次已准备、尚未授权的审阅不能再授权，需要重新准备。$/u,
    (_, count) => `${count} 次已准备、尚未开始的审阅不能再开始，需要另做一份计划。`),
  family('series-exclusions.ts', /^以后的书系检索重新可以读取(.+)；要用到它，仍要重新准备计划并授权。$/u,
    (_, target) => `以后的书系检索重新可以读取${target}；要用到它，仍要另做一份计划再开始。`),
  family('series-exclusions.ts', /^以后的书系检索重新可以读取(.+)涉及的 (\d+) 个书系知识条目；要用到它们，仍要重新准备计划并授权。$/u,
    (_, target, count) => `以后的书系检索重新可以读取${target}涉及的 ${count} 个书系知识条目；要用到它们，仍要另做一份计划再开始。`),
  family('series.ts', /^(.+)有 (\d+) 项学习材料，其中 (\d+) 项已决定学习准入。$/u,
    (_, book, count, decided) => `${book}有 ${count} 项学习材料，其中 ${decided} 项已决定是否可用于学习。`),
  family('store.ts', /^(《.*》)AI7 初评$/u,
    (_, title) => `${title}评估报告`),
  family('task-material-references.ts', /^可以在(「.*」)重新准备计划。$/u,
    (_, surface) => `可以在${surface}另做一份计划。`),
  family('task-material-references.ts', /^(.+)；已有的结果仍可查看，再次运行需重新准备计划$/u,
    (_, settled) => `${ordinaryServiceWords(settled)}；已有的结果仍可查看，再次运行需另做一份计划`),
  family('writing-task-operations.ts', /^第 (\d+) 版定稿评估的结论(「.*」)、主要优点（这一版没有 AI7 初评的市场部分）$/u,
    (_, version, conclusion) => `第 ${version} 版定稿评估的结论${conclusion}、主要优点（这一版没有评估报告的市场部分）`),
  family('writing-tasks.ts', /^这次起草参考的资料(《.*》)(，计划冻结的索引版本已不在本机|现在不能列进这本书任务的「允许参考」|的索引记录已损坏)，不能再开始；可以用「新建文档…」重新准备。$/u,
    (_, title, why) => `这次起草参考的资料${title}${why.replace('计划冻结的索引版本', '做计划时的资料内容')}，不能再开始；可以用「新建衍生稿件…」另做一份计划。`),
  family('../shared/protocol/series.ts', /^所参考的本社审阅偏好已停止使用 · 需要重新确认计划：它参考的偏好版本中有学习材料已停止今后使用，运行在下一个阅读范围前停下；已读完的结果保留，已经发给模型服务的内容无法收回。$/u,
    (sentence) => phrased(sentence)),
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
    (_, head) => `${materialLineWords(head)}再次起草需用「新建衍生稿件…」另做一份计划`),
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
  // Composed reference rows contain a title and a service refusal: only the refusal is interpreted.
  family('task-material-references.ts', /^(资料《.*》.*，这份计划不能再开始；)(可以用「新建文档…」重新准备。|可以在「(?:审阅|评估)」重新准备计划。)$/u,
    (_, reference, next) => reference + ordinaryServiceWords(next)),
  family('task-material-references.ts', /^(资料库资料《.*》：已提取 [\d,]+ 字，按计划冻结的索引版本读取（只参照，不照抄）)——(.+)$/u,
    (_, reference, why) => materialLineWords(reference + '——' + ordinaryServiceWords(why))),
  family('task-material-references.ts', /^资料库资料《.*》：已提取 [\d,]+ 字，按计划冻结的索引版本读取（只参照，不照抄）$/u, (line) => materialLineWords(line)),
  family('analysis/execution.ts', /^(.+)（([^（）]+)）；本社审阅偏好已停止使用，没有再试一次$/u,
    (_, reason, code) => ordinaryServiceWords(reason) + '（' + code + '）；审阅偏好已停止使用，没有再试一次'),
  // Stage-4/5 rework R6: a finished Run's count, why an update cannot be asked yet, and the plan preview's own composed lines.
  family('../shared/analysis-run-summary.ts', /^已完成 · (\d+)\/(\d+) 个单元未读成$/u, (_, gaps, total) => `已完成 · ${total} 个部分中有 ${gaps} 个没有读成`),
  family('analysis/execution.ts', /^未完成：没有单元读成 · (.+)$/u, (_, reason) => `未完成：没有读成任何部分 · ${ordinaryServiceWords(reason)}`),
  family('analysis/run-state.ts', /^结果集修订版仍绑定当前稿件；只有在已确认编辑使精确修订版新鲜度为“已过期”后才可(.+)。$/u,
    (_, action) => `分析结果与当前稿件一致；稿件有了已保存的改动之后才可${action}。`),
  family('task-launch-preview.ts', /^(.+)：(允许|先问我|不允许)$/u, (_, step, choice) => `${ordinaryServiceWords(step)}：${choice}`),
  // 0.7.9 wording follow-up: AI7's fixed fact-check document in a plan's reference row, a Task of the same kind under way, and
  // what a ticked 资料库 item is read as.
  family('review/category-configuration.ts', /^([^：]+：)事实核查契约( · .+)$/u, (_, category, procedure) => `${category}事实核查规则${procedure}`),
  family('analysis/run-state.ts', /^当前已有(.+)在调度或执行中；在其结束前不能准备(.+)。$/u, (_, task, next) => `已有一项${task}正在进行；等它结束后才能准备${next}。`),
  // A failed part's reason without its code (stage re-check): the code stays in developer mode and in the record.
  family('analysis/execution.ts', /^(.+)（[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+）$/u, (_, reason) => ordinaryServiceWords(reason)),
  family('provider/classification.ts', /^适配器失败（[^（）]+）。$/u, () => '模型服务出错，没有给出可用的回答。'),
  family('writing-tasks.ts', /^勾选的资料列进这次计划的「允许参考」，按计划冻结的索引版本读取：(.+)$/u, (_, bounds) => `勾选的资料列进这次计划的「允许参考」，按任务开始时的资料内容读取：${bounds}`),
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

/** The service prefixes this mixed-author field only when the projection marks it; model limitations stay verbatim. */
export function factualLimitationWords(result: Pick<FactualVerificationResultProjection, 'limitations' | 'unattemptedDisclosure'>): ReadonlyArray<string> {
  return result.limitations.map((line, index) => result.unattemptedDisclosure === true && index === 0 ? serviceWords(line) : line);
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

/** The rules, for the test: every service/shared sentence with a banned term is one rule's, or in the test's NOT_SHOWN or KNOWN_RAW. */
export const SERVICE_SENTENCE_RULES: ReadonlyArray<ServiceSentenceRule & { readonly exact?: string; readonly family?: RegExp; readonly underSwitch?: true }> =
  [...EXACT, ...FAMILIES, ...[...SWITCH_EXACT, ...SWITCH_FAMILIES].map((rule) => ({ ...rule, underSwitch: true as const }))];
