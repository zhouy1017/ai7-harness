// The vocabulary table of plan #1516 §5 (mirrored in docs/ui-ux-v2/editor-surfaces.md §10.2) as data, in one module.
// `tools/words-report.mjs` reads it to report the banned terms of ordinary-mode text; #1531 imports the same table for
// its failing test. Words are replaced by meaning, never by blind find-and-replace: the report only locates them.
//
// A `space` inside a term matches zero or more spaces ("AI7 初评" also finds "AI7初评"); ASCII letters match any case.

/** Terms whose replacement does not depend on the sentence. `from` is the row of the table as the plan writes it. */
export const BANNED = [
  { from: '待你处理 / 待处理 / 待复核', terms: ['待你处理', '待复核'], use: '待处理' },
  { from: '随书稿件 / 生产文档 / 文档 / 工作文档', terms: ['随书稿件', '生产文档', '工作文档'], use: '衍生稿件' },
  { from: '社级 / 全社 / 出版社经验', terms: ['社级', '全社', '出版社经验'], use: '本社' },
  { from: '修订建议 / 提案 / 提议内容', terms: ['修订建议', '提案', '提议内容'], use: '修改建议' },
  { from: '续行', terms: ['续行'], use: '继续' },
  { from: '再做一次 / 改计划重做 / 重新准备 / 按新计划开始', terms: ['再做一次', '改计划重做', '重新准备', '按新计划开始'], use: '重新开始' },
  { from: '停止任务', terms: ['停止任务'], use: '取消任务' },
  { from: 'API 凭据 / 凭据', terms: ['API 凭据', '凭据'], use: '密钥' },
  { from: 'AI7 初评 / AI7 初稿 / AI7 评估报告', terms: ['AI7 初评', 'AI7 初稿', 'AI7 评估报告'], use: '评估报告（校准页上与编辑定稿分数对比的 AI 分数：AI 初始评分）' },
  { from: '本社审阅偏好 / 记忆', terms: ['本社审阅偏好'], use: '审阅偏好（自动归纳的标「AI 归纳」）' },
  { from: '阅读范围 / 单元 / 结构单元', terms: ['阅读范围', '结构单元'], use: '部分' },
  { from: '缺口 / 保留缺口', terms: ['保留缺口', '缺口'], use: '未完成的部分' },
  { from: 'tokens / 词元（预算）', terms: ['tokens', '词元'], use: '用量（较少 / 标准 / 较多三档）' },
  { from: '派发前已阻止', terms: ['派发前已阻止'], use: '没有开始' },
  { from: '运行名额已满 / 等待运行名额', terms: ['运行名额已满', '等待运行名额'], use: '排队中' },
  { from: '应用结果待确认 / 应用凭据', terms: ['应用结果待确认', '应用凭据'], use: '修改是否生效待确认' },
  { from: '后台处理登记', terms: ['后台处理登记'], use: '空闲时自动更新分析（只有一项可选时，下拉框和「登记」按钮合成一个开关）' },
  { from: '证据保证级别', terms: ['证据保证级别'], use: '核查力度（快速 / 标准 / 严格）' },
  { from: '学习准入 / 归属', terms: ['学习准入'], use: '可用于学习' },
  { from: '本社敏感词表 / 本社自用词表', terms: ['本社敏感词表', '本社自用词表'], use: '本社词表' },
  { from: '当前更改尚未持久保存', terms: ['当前更改尚未持久保存'], use: '还没有保存' },
];

/** Established nouns that end in 版本 (the word 发稿版本 stays; a source or software version has no date to give). */
const VERSION_COMPOUNDS = ['发稿', '里程碑', '来源', '关系', '软件', '数据'];

/**
 * Rows that only the sentence can decide. The report never calls these wrong: it lists where a candidate stands, and the
 * author reads it. `candidate` is a regular expression source (flags `gu`) matched against string text only.
 */
export const BY_HAND = [
  {
    from: '已应用（AI 或导入的建议 / 编辑自己的修改）',
    use: '已接受（AI 或导入的建议）/ 已改（编辑自己的修改）',
    candidate: '已应用',
  },
  {
    from: '阅读范围 / 单元 / 结构单元 中单独的「单元」',
    use: '部分（「单元格」等表格用语不改）',
    candidate: '单元(?!格)',
  },
  {
    from: '严重度里混用的「注意」「高 / 中 / 低」',
    use: '必须处理 / 建议处理 / 提示；评估风险单列高 / 中 / 低',
    candidate: '(?<!\\p{Script=Han})(?:注意|高|中|低)(?!\\p{Script=Han})',
  },
  {
    from: '文档',
    use: '衍生稿件（Word 文档等文件格式的名字不改）',
    candidate: '文档',
  },
  {
    from: '校准页上与编辑定稿分数对比的 AI 分数',
    use: 'AI 初始评分（只在校准页）',
    candidate: 'AI\\s*(?:分数|评分)',
  },
  {
    from: '重写（评估）',
    use: '重新生成（只在评估；改写稿件的「重写」不改）',
    candidate: '重写',
  },
  {
    from: '本社审阅偏好 / 记忆',
    use: '审阅偏好；自动归纳的标「AI 归纳」（只在 AI 归纳出的偏好；「记住」的界面设置不改）',
    candidate: '记忆',
  },
  {
    from: '「版本」（原「第 N 版」被抹掉后的病句）',
    use: '用日期区分，如「11 月 16 日的定稿」',
    candidate: `(?<!${VERSION_COMPOUNDS.join('|')})版本`,
  },
  {
    from: '学习准入 / 归属',
    use: '给谁用（只在资料库的归属层级；其他「归属」不改）',
    candidate: '归属',
  },
];

/** The words that stay as they are (plan #1516 §5). A banned or candidate term inside one of them is not reported. */
export const STAYS = ['工序', '基线分析', '里程碑', '发稿版本', '批注', '备注', '已拒绝', '已忽略', '已处理', '模型@思考强度'];
