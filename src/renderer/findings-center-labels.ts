/** 发现 (Issue #952; V2-UX-FIND-001..003, IA-013): the words of the Book's read-only findings center. */
export const FINDINGS_CENTER_WORDS = {
  section: (bookTitle: string) => `处理 · 《${bookTitle}》`,
  heading: '发现',
  lede: '这里汇集尚未处理的分析未覆盖处、审阅发现与评估风险。查看原记录并在那里处理，刷新后同步显示。',
  empty: '暂无发现',
  summary: (total: number, pageSize: number) => `共 ${total} 项待处理发现 · 每页最多 ${pageSize} 项`,
  filter: '发现类别',
  allCategories: '全部类别',
  open: '查看记录与原文',
  pageEmpty: '本页没有此类别的发现，请翻页查看。',
  previous: '上一页',
  next: '下一页',
  refresh: '刷新发现',
  unavailable: '无法读取发现，重试',
  opened: '发现已打开',
  openFailed: '无法打开发现。',
} as const;
