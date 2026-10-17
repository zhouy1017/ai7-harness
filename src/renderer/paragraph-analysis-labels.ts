/** 分析 on the right edge (Issue #952; editor-surfaces §1): the words of the current paragraph's analysis panel. */
export const PARAGRAPH_ANALYSIS_LABELS = { entities: '人物与名称', events: '事件', settingClaims: '设定', relationships: '关系' } as const;

export const PARAGRAPH_ANALYSIS_WORDS = {
  title: '当前段落的分析',
  entry: '查看当前段落附近的分析',
  none: '尚无可用的段落分析。',
  revision: (ordinal: number, freshness: string) => `分析第 ${ordinal} 版 · ${freshness}`,
  empty: '当前段落附近暂无分析发现。',
  truncated: (total: number, shown: number) => `共 ${total} 项，显示前 ${shown} 项；查看分析可读完整结果。`,
  open: '查看',
  unavailable: '暂时无法读取当前段落的分析，稍后会自动重读。',
  viewedUnsaved: '无法记住本次查看位置，下次打开时可能再次提示。',
  hint: '分析有新发现',
  openFailed: '无法打开分析。',
} as const;
