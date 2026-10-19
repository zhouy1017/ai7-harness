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
