// First-run words (Issue #961, wave 13 slice 13b; Owner decision 27; RET-004, MSET-001/002, DSTO-001/002): the data-location
// chooser main shows before any window, the skippable card on the empty 书库 and the 引导 strip on a sample Book's 工作概览.
// Every step names the existing page it opens; none of them starts work.

/** The native chooser main shows once, before the first window, on an ordinary-production launch with no stored choice. */
export const STARTUP_LOCATION_LABELS = Object.freeze({
  title: '选择数据位置',
  message: '图书、稿件与历史保存在本机',
  defaultLocation: (root: string) => `默认位置：${root}\n模型服务凭据由操作系统单独保护。`,
  useDefault: '使用默认位置',
  chooseFolder: '选择文件夹…',
  cancel: '取消',
  folderTitle: '选择产品数据位置',
  refusedTitle: '此位置不可用',
  refusedMessage: '此位置无法用于保存数据。返回后可选择默认位置，或换一个可以保存文件的本机文件夹。',
  refusedBack: '返回选择',
});

/** The first-run card inside `data-screen="landing"`, beside (never instead of) 新建图书 and 导入稿件. */
export const FIRST_RUN_CARD_LABELS = Object.freeze({
  title: '开始使用 AI7',
  dataStep: '① 数据位置',
  dataNote: '在 设置 › 数据与存储 查看',
  dataOpen: '查看数据与存储',
  modelStep: '② 模型服务（可选）',
  modelNote: '本地编辑与恢复不依赖模型服务',
  modelOpen: '设置模型服务',
  startStep: '③ 开始',
  startNote: '使用上方的 新建图书 或 导入稿件，也可以先导入示例书。',
  sampleImport: '导入示例书',
  sampleBusy: '正在本地解析示例书…',
  sampleStaged: '示例书已完成本地暂存',
  sampleFailed: '无法导入示例书。',
  sampleNote: '仅供开发环境试用；导入前仍需选择图书目标并复核。',
  sampleUnavailable: '示例书尚未提供',
  sampleUnavailableNote: '公开发行的示例书正在准备中。',
  skip: '跳过引导',
  skipped: '已跳过引导',
  skipFailed: '无法保存引导选择，请重试。',
});

/** The 引导 strip on a sample Book's 工作概览: four links to existing surfaces, in their fixed order. */
export const SAMPLE_GUIDANCE_LABELS = Object.freeze({
  title: '引导',
  note: '按需了解 分析 → 审阅 → 标记 → 导出；打开页面不会开始任务。',
  steps: Object.freeze([
    { label: '分析', section: 'analysis' },
    { label: '审阅', section: 'review' },
    { label: '标记', section: 'manuscript' },
    { label: '导出', section: 'deliverables' },
  ] as const),
});
