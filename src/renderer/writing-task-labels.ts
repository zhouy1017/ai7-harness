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
  openFailed: '草稿没有打开。',
  unavailable: '新建文档 · 写作任务暂不可用。',
} as const;

/** The Book's latest writing Task, in one line: its type and its state in the drawer's own words. */
export function writingTaskLine(task: NonNullable<WritingTaskProjection['task']>): string {
  return `写作任务「${task.typeLabel}」：${task.label}`;
}

/**
 * How 查看任务 stands beside the Task (Issue #698): the page's next step — primary — only for a prepared Task nothing refuses;
 * quiet for one whose 范例 is no longer here, which can never start, and for every other state.
 */
export function writingOpenTaskTone(task: Pick<NonNullable<WritingTaskProjection['task']>, 'state' | 'refusal'>): 'primary' | 'quiet' {
  return task.state === 'prepared' && task.refusal === null ? 'primary' : 'quiet';
}

/** A drafted result not yet made a document: its type and when AI7 wrote it. */
export function writingDraftedLine(typeLabel: string, at: string): string {
  return `「${typeLabel}」的草稿已写好（${at}）；打开后成为这本书的${typeLabel}，处于「起草」阶段。`;
}
