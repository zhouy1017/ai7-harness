/** 待办汇总 (Issue #952, named by #1521; V2-UX-FIND-001..003, IA-013): the words of the Book's read-only findings center. */
export const FINDINGS_CENTER_WORDS = {
  heading: '待办汇总',
  empty: '还没有待处理的发现，发起审阅后会自动列在这里。',
  summary: (total: number) => `共 ${total} 项待处理发现`,
  filter: '发现类别',
  allCategories: '全部类别',
  open: '查看记录与原文',
  pageEmpty: '当前筛选下没有发现。',
  unavailable: '无法读取待办汇总，重试',
  opened: '待办汇总已打开',
  openFailed: '无法打开待办汇总。',
} as const;
