export const ANALYSIS_MORE_RANGES = '显示更多阅读范围';
export const ANALYSIS_READ_FAILED = '无法读取完整的分析结果，请重新打开分析。';
export const ANALYSIS_READING = '正在读取分析结果…';
export const ANALYSIS_MORE_REPORT_ROWS = '显示更多逐范围账目';

export const ANALYSIS_MORE_CHOICES = '显示更多';
export const ANALYSIS_EARLIER_HISTORY = '显示更早';

export const ANALYSIS_PAGED_LIST_LABELS: Readonly<Record<string, string>> = {
  planVersions: '计划版本', planRevisions: '计划修订', 'run.transitions': '运行进程', 'run.adaptations': '运行中的调整',
  'taskOutcome.report.adaptations': '运行报告中的调整', 'taskOutcome.report.failures': '运行报告中的失败',
  'taskOutcome.report.modelClarifications': '运行报告中的说明',
  'resultSetRevision.gaps': '尚未分析的范围', 'inspectedRevision.revision.gaps': '历史分析中尚未分析的范围',
  'resultSetRevision.provenance.adaptations.unitOrdinals': '计划内调整',
  'inspectedRevision.revision.provenance.adaptations.unitOrdinals': '历史分析中的计划内调整',
};

export const TASK_PAGE_FAILED = '无法继续读取，请重新打开计划。';
export const TASK_PAGE_NAMES: Readonly<Record<string, string>> = {
  'drift.entries': '计划变化', 'edit.lastEdit.entries': '修改记录', 'resend.units': '再次发送的范围',
  'resend.statement': '再次发送说明', 'unconfirmed.ranges': '结果待确认的阅读范围',
  'runControl.outcomeUnknown.units': '结果待确认的阅读范围', 'runControl.continuation.pendingAnswerUnits': '待续行的范围',
  'runControl.cancel.impact': '取消影响说明',
  clarifications: '问题与回答', 'scopeOptions.chapters.chapters': '章节',
};
export const taskPageMore = (name: string, shown: number, total: number): string => `继续读取${name}（已显示 ${shown} / ${total}）`;
export const taskPageShown = (name: string, shown: number, total: number): string => `${name} · 已显示 ${shown} / ${total} 条`;
export const taskResendSummary = (total: number): string => `共 ${total} 个阅读范围上一次的请求已发出、结果待确认，可能已被模型服务处理并计费；这项任务会再发一次它们的请求，开始任务即重新授权这次发送。`;
export const TASK_SELECTED_CHAPTER_NOT_LOADED = '已选章节（继续读取章节以查看）';
