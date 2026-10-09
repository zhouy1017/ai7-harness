import type { WritingTaskProjection } from '../shared/protocol.js';

/**
 * The words of 新建文档 · 写作任务 on ⑥ 交付物 (Issue #432, plan slice S84a; editor-surfaces §9; V2-UX-DELIV-007, KB-004).
 * What a draft references, the four consequence rows and every reason are the service's words, shown as they come; these are
 * the page's own.
 */
export const WRITING_HEADING = '新建文档 · 写作任务';
export const WRITING_LEDE = '选一类文档，AI7 参考下面列出的材料起草。打开草稿后，它就是这本书的这一类文档，处于「起草」阶段，在稿件编辑面上修改。范例只参照，不复制。';
export const WRITING_TYPE_LEGEND = '文档类型（单选）';
export const WRITING_REFERENCE_HEADING = 'AI7 会参考';
/** The reference set's rows, in the order editor-surfaces §9 names them. */
export const WRITING_REFERENCE_TERMS = ['梗概与人物', '评估结论与营销要点', '范例', '图书信息'] as const;
export const WRITING_EXEMPLAR_PICK_TYPE = '选好类型后显示';
import { MAX_WRITING_AUDIENCE_GRAPHEMES, MAX_WRITING_CHANNEL_GRAPHEMES, MAX_WRITING_REQUIREMENTS_GRAPHEMES } from '../shared/protocol.js';

export const WRITING_FIELD_LABELS = { audience: '受众', channel: '渠道', requirements: '其他要求（可不填）' } as const;
export const WRITING_FIELD_HINTS = { audience: '这份文档写给谁看', channel: '会在哪里发布或使用', requirements: '篇幅、语气或必须写到的内容' } as const;
/** How many characters each field takes, as the service bounds it (#688 review): the service's own words when one is longer. */
export const WRITING_FIELD_MOST = { audience: MAX_WRITING_AUDIENCE_GRAPHEMES, channel: MAX_WRITING_CHANNEL_GRAPHEMES, requirements: MAX_WRITING_REQUIREMENTS_GRAPHEMES } as const;
export function writingFieldTooLong(key: keyof typeof WRITING_FIELD_MOST): string {
  return `${key === 'requirements' ? '其他要求' : WRITING_FIELD_LABELS[key]}最多 ${WRITING_FIELD_MOST[key]} 个字，只能写在一行里。`;
}
/** editor-surfaces §9's 四行后果, in the 新建审阅 sheet's terms. */
export const WRITING_CONSEQUENCE_TERMS = ['会读取', '会发送', '不会做', '费用'] as const;
export const WRITING_ACTIONS = {
  open: '新建文档…',
  plan: '先看计划',
  quick: '快速开始',
  cancel: '取消',
  openTask: '查看任务',
  openDraft: '打开草稿',
} as const;
export const WRITING_PICK_TYPE = '请选择一类文档。';
export const WRITING_STATUS = {
  preparing: '正在准备写作任务的计划…',
  prepared: '写作任务的计划已准备；请在任务面看过计划再开始。',
  cancelled: '已取消准备写作任务的计划。',
  failed: '写作任务的计划没有准备出来。',
  creating: '正在打开草稿…',
  quickFailed: '快速开始没有开始任务；计划已准备，可在任务计划里开始。',
  quickNoPlan: '这份计划还没有冻结，没有按规则开始；请看过计划后再开始。',
  openFailed: '草稿没有打开。',
  unavailable: '新建文档 · 写作任务暂不可用。',
} as const;

/** A writing rule covers one house type (#701 review P2-1): until one is chosen there is nothing to say of 快速开始. */
export const WRITING_QUICK_PICK_TYPE = '选好类型后显示：快速开始按这一类文档的默认执行规则开始。';
/**
 * A quick start whose call failed: the service's words, if any — which may say the plan can no longer start, so no promise
 * that it can is added to them (#701 re-review P3-2) — or, with none, that the plan stands prepared.
 */
export const WRITING_QUICK_FAILED_SEE_PLAN = '快速开始没有开始任务；请在任务计划里查看。';
export function writingQuickFailed(detail: string): string {
  const said = detail.trim().replace(/[。；]+$/u, '');
  return said.length === 0 ? WRITING_STATUS.quickFailed : `${said}。${WRITING_QUICK_FAILED_SEE_PLAN}`;
}
/** 快速开始 on offer (Issue #432, S84b; S75 D5): the rule it starts under, and that a plan unlike it stops for the editor. */
export function writingQuickNote(ruleName: string): string {
  return `按默认执行规则「${ruleName}」：先准备计划，与规则一致时直接开始；有任何不同都会停在计划上。`;
}
export function writingQuickStarting(ruleName: string): string {
  return `正在按默认执行规则「${ruleName}」开始…`;
}
/** What a quick start that started its Task says: a start the launch has no route for is recorded and blocked before dispatch. */
export function writingQuickStarted(ruleName: string, blocked: boolean): string {
  return blocked
    ? `已按默认执行规则「${ruleName}」记下这项写作任务；当前启动没有可执行的路由，派发前已阻止。`
    : `已按默认执行规则「${ruleName}」开始写作任务。`;
}

/** The Book's latest writing Task, in one line: its type and its state in the drawer's own words. */
export function writingTaskLine(task: NonNullable<WritingTaskProjection['task']>): string {
  return `写作任务「${task.typeLabel}」：${task.label}`;
}

/** A drafted result not yet made a document: its type and when AI7 wrote it. */
export function writingDraftedLine(typeLabel: string, at: string): string {
  return `「${typeLabel}」的草稿已写好（${at}）；打开后成为这本书的${typeLabel}，处于「起草」阶段。`;
}
