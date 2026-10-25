/** Authored recognizers, grounded in indexed primary clauses; no standard text, examples or tables are shipped. */
export const LOCAL_CHECK_CATEGORY = 'local-text-check';
export const LOCAL_CHECK_PROCEDURE = 'ai7-procedure/local-text-check';
export const LOCAL_RULE_IDS = ['P01', 'P02', 'P03', 'N01', 'N02'] as const;
export type LocalRuleId = (typeof LOCAL_RULE_IDS)[number];
/** H01 belongs only to the successor; the five-rule v1 registry is immutable. */
export const LOCAL_RULE_IDS_V2 = [...LOCAL_RULE_IDS, 'H01'] as const;
export type LocalRuleIdV2 = (typeof LOCAL_RULE_IDS_V2)[number];
export const HOUSE_RULE = { id: 'H01', version: 1, title: '命中本社词条，请编辑判断',
  limitation: '只匹配编辑保存并明确选定的字面词条；区分大小写，不规范化，不判断法律或标准合规，不生成替换。' } as const;
const P = 'https://www.moe.gov.cn/ewebeditor/uploadfile/2015/01/13/20150113091548267.pdf';
const N = 'https://www.moe.gov.cn/ewebeditor/uploadfile/2015/01/13/20150113091154536.pdf';
export const LOCAL_RULES = {
  P01: { version: 1, title: '成对标点可能不一致', edition: 'GB/T 15834-2011', clauses: '§§4.8.2,4.8.3.4–5,4.9.2,5.1.3', url: P,
    limitation: '仅识别中文双引号、引语内单引号和全角圆括号；选区边缘或排除间隙不判断缺失。重复段首引号只按可能续引处理。' },
  P02: { version: 1, title: '省略号长度可能有误', edition: 'GB/T 15834-2011', clauses: '§§4.11.2,4.11.3.7,5.1.5,A.9.1', url: P,
    limitation: '仅识别连续 U+2026；不判断语义、相邻标点或排版宽度；疑似目录引导线跳过。四字符须有省略段落或诗行声明。' },
  P03: { version: 1, title: '括号序号后的标点待核', edition: 'GB/T 15834-2011', clauses: '附录B（资料性）B.3.4；B.3.5–7排除', url: P,
    limitation: '仅识别相邻、同缩进、递增的两个以上全角括号阿拉伯数字序号及中文正文；不判断章节、叙述序列或其他层级。' },
  N01: { version: 1, title: '百分数小数可能缺少整数零', edition: 'GB/T 15835-2011', clauses: '§5.1.2；适用范围§1', url: N,
    limitation: '仅识别 .数字% 或 .数字％，可带正负号；数学示例或讨论该写法仍可能误报，须由编辑判断。' },
  N02: { version: 1, title: '数值范围的百分号或数量级待核', edition: 'GB/T 15835-2011', clauses: '§5.1.3；适用范围§1', url: N,
    limitation: '仅识别非负十进制、～/~ /—及有限百分号/万/亿后缀；不推断端点值，不补单位，不判断日期或普通共用单位。' },
} as const;
export const LOCAL_CHECK_LIMITATION = '仅按五项有限识别规则提示可能问题；未识别、未检查或无发现均不表示符合整部标准。专业符号和元语言讨论可能误报。依据为官方原始文档的索引条款，未能直接核看原页。';
