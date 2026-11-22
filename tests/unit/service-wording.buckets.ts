// Test bookkeeping for `service-wording.test.ts` (Issue #1531): the service sentences with a banned term that no rule of
// `src/renderer/service-wording.ts` rewords, keyed by the service file and TEXT, never by a line number — a line shift alone
// never fails the test. `text` is the sentence's whole fragment as the enumerator sees it, or, where that fragment is too
// short to name one site (a bare 「tokens」 is also written by a shown sentence of the same file), a longer text of the source
// line that holds it (the technical row's own key). A banned fragment is matched by an entry when its source line holds the
// entry's text; two identical sites in one file are one entry.

export interface ServiceSentenceBucketEntry {
  /** The service file, under `src/service/`. */
  readonly file: string;
  /** The text its source line holds. */
  readonly text: string;
  readonly why: string;
}

const TECHNICAL_ROW = 'plan.technical rows: drawn only in developer mode';

/** Sentences the page never shows in ordinary mode, with where they go instead. */
export const NOT_SHOWN: ReadonlyArray<ServiceSentenceBucketEntry> = [
  ...["{ key: 'credential-reference'", "{ key: 'credential-readiness'", "{ key: 'run-budget-ceiling'", "{ key: 'redo-of'", "{ key: 'provider-binding'",
    '个阅读范围 · 已发送 ${unit.attempts} 次', "key: 'house-review-preference'", "key: `house-review-preference:${index}`, label: '本社审阅偏好'"]
    .map((text) => ({ file: 'task-plan.ts', text, why: TECHNICAL_ROW })),
  ...['`${ceiling.maxTotalTokens} tokens`', '`${ceiling.tokensPerFrozenUnit} tokens × 冻结单元数`', '`${ceiling.tokensPerFrozenUnit * unitCount} tokens（']
    .map((text) => ({ file: 'analysis/run-state.ts', text, why: 'ceilingReading: the frozen ceiling of the technical rows, developer mode only' })),
  { file: 'analysis/run-state.ts', text: '凭据值不进入任务账本、协议帧、日志、诊断或 Session 内容', why: 'notDo.technical: developer mode only' },
  { file: 'background-analysis-enrollments.ts', text: '`后台处理登记 · 第 ${ordinal} 版`', why: 'the enrollment\'s numbered name: developer mode only (backgroundEnrollmentLine)' },
];

const STORAGE_ERROR = 'a storage error of the 后台分析 records: an engineering message, shown as written (review S10); Issue #1616';

/** Sentences shown as written today, each named for Issue #1616. */
export const KNOWN_RAW: ReadonlyArray<ServiceSentenceBucketEntry & { readonly issue: '#1616' }> = [
  // Existing preparation refusals moved with their validator in #1656; #1616 still owns their wording.
  ...['只有这本书最近一项任务里开始后取消、或因预算上限停止的运行可以改计划重做。', '改计划重做沿用这次运行已读完的部分，接着读其余的；什么都没读完时，照原样从头再做。']
    .map(text => ({ file: 'analysis/run-state.ts', text, why: 'unchanged preparation refusal, shared by launch after #1656', issue: '#1616' as const })),
  ...[
  '后台处理登记的预算上限无效。',
  '后台处理登记记录无效。', '后台处理登记记录与其摘要不一致。', '后台处理登记记录与其字段不一致。', '后台处理登记的参数无效。', '后台处理登记标识无效。', '这份后台处理登记不存在。',
  '后台处理登记版本标识无效。', '后台处理登记版本指向的登记不存在。', '后台处理登记状态无效。', '后台处理登记的起点无效。', '后台处理登记记录的绑定无效。', '后台处理登记缺少状态记录。',
  '后台处理登记种类不一致。', '后台处理登记状态指向的版本不存在。', '后台处理登记状态种类不一致。',
  ].map((text) => ({ file: 'background-analysis-enrollments.ts', text, why: STORAGE_ERROR, issue: '#1616' as const })),
];
