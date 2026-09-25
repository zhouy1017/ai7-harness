import type {
  FidelityCategoryProjection,
  ImportFidelityOutcome,
  ManuscriptConversionProjection,
  TextBoxDisposition,
} from '../shared/protocol.js';

/**
 * Every word of the Import Fidelity Review (④ 保真审阅; V2-UX-IMP-002 to 005, IMP-055; ADR 0086) that the
 * service projection does not already carry. The rows' labels, counts, status labels and details are the
 * service's and are shown as they come; these are the sentences around them. Pure, so the unit suite pins
 * every string byte for byte.
 */

/** The class that closes the review as a card rather than a row (ADR 0086 §1). */
export const ROUND_TRIP_KEY = 'round-trip-export';

/** A status reads in text and in shape as well as in colour (V2-UX-IMP-003). */
export function fidelityStatusShape(status: FidelityCategoryProjection['status']): string {
  if (status === 'preserved') return '✓';
  if (status === 'retained') return '◆';
  if (status === 'degraded') return '△';
  return '⊘';
}

export function fidelityPillText(category: FidelityCategoryProjection): string {
  return `${fidelityStatusShape(category.status)} ${category.statusLabel}`;
}

export function fidelityCountText(count: number): string {
  return ` · ${count} 项`;
}

/** The rows of a review: every class but the closing 预计往返 card. */
export function fidelityRows(fidelity: ReadonlyArray<FidelityCategoryProjection>): FidelityCategoryProjection[] {
  return fidelity.filter((category) => category.key !== ROUND_TRIP_KEY);
}

/** The closing card, when the review has one (every review does). */
export function roundTripCard(fidelity: ReadonlyArray<FidelityCategoryProjection>): FidelityCategoryProjection | undefined {
  return fidelity.find((category) => category.key === ROUND_TRIP_KEY);
}

/**
 * Whether a class needs the Import Degradation Decision: only a class that is `降级导入` or `不支持导入` and
 * counts something (ADR 0086 §2). A class retained with the file needs none.
 */
export function needsDegradationDecision(fidelity: ReadonlyArray<FidelityCategoryProjection>): boolean {
  return fidelityRows(fidelity).some((category) =>
    (category.status === 'degraded' || category.status === 'unsupported') && category.count > 0);
}

export function fidelityReviewHeading(fidelity: ReadonlyArray<FidelityCategoryProjection>): string {
  return `导入保真审阅 · ${fidelityRows(fidelity).length} 类与预计往返`;
}

export function reimportFidelityHeading(fidelity: ReadonlyArray<FidelityCategoryProjection>): string {
  return `重新导入保真审阅 · ${fidelityRows(fidelity).length} 类与预计往返`;
}

export function fidelityDisclosureSummary(fidelity: ReadonlyArray<FidelityCategoryProjection>): string {
  return `查看导入保真审阅 · ${fidelityRows(fidelity).length} 类与预计往返`;
}

/**
 * Whether a class was found in the file. Every class the service reports as not found reads 未检测到… and
 * counts nothing; one it found may still count nothing — 批注与修订 of a file whose only revisions are
 * formatting ones stays with the file and becomes no mark (Issue #411).
 */
function fidelityClassFound(category: FidelityCategoryProjection): boolean {
  return category.count > 0 || !category.detail.startsWith('未检测到');
}

/**
 * The concise reading of a review that asks for no decision (interaction-spec, New-Book fidelity review
 * contains only 完整保留): how many classes there are, which are kept with the file and how many, which
 * become marks on the manuscript and how many (Issue #411: a file's comments and tracked changes, which are
 * `完整保留` with a count and are not kept with the file), and how many were not found at all. Text boxes the review
 * was formed to merge (Issue #532) are said to go into the text, never to stay with the file.
 */
export function fidelitySummaryLine(fidelity: ReadonlyArray<FidelityCategoryProjection>, textBoxes: TextBoxDisposition | null = null): string {
  const rows = fidelityRows(fidelity);
  const found = rows.filter(fidelityClassFound);
  const absent = rows.length - found.length;
  if (found.length === 0) return `${rows.length} 类内容都未检测到，稿件完整保留，不需要导入降级决定。`;
  const converted = found.filter((category) => category.status === 'preserved' && category.count > 0);
  const merged = found.filter((category) => textBoxes === 'merge' && category.key === 'text-boxes' && category.count > 0);
  const kept = found.filter((category) => !converted.includes(category) && !merged.includes(category));
  const counted = (category: FidelityCategoryProjection): string =>
    category.count > 0 ? `${category.label}${fidelityCountText(category.count)}` : category.label;
  const clauses = [
    ...(kept.length > 0 ? [`${kept.map(counted).join('、')}随文件保留`] : []),
    ...(merged.length > 0 ? [`${merged.map(counted).join('、')}并入正文`] : []),
    ...(converted.length > 0 ? [`${converted.map(counted).join('、')}转为稿件上的批注与修改建议`] : []),
  ];
  return `${rows.length} 类内容都完整保留，不需要导入降级决定：${clauses.join('；')}` +
    (absent > 0 ? `，其余 ${absent} 类未检测到。` : '。');
}

export const FIDELITY_DETAILS_SUMMARY = '展开各类明细';

/** A converted file says so above its review (ADR 0072 §3). */
export function conversionNoteText(conversion: ManuscriptConversionProjection): string {
  return `本稿件由 ${conversion.converterIdentity} 从 ${conversion.sourceFormat} 转换为 DOCX 工作表示后读取；` +
    '下列损失由转换造成，原始文件原样保留。';
}

// ---- the text-box choice (ADR 0086 §2) ---------------------------------------------------------------

export const TEXT_BOX_CHOICE_LEGEND = '文本框怎样进来';
export const TEXT_BOX_CHOICE_OPTIONS: ReadonlyArray<{ disposition: TextBoxDisposition; label: string; hint: string }> = [
  {
    disposition: 'retain',
    label: '保留为文本框（默认）',
    hint: '随来源版本保留，不显示在稿件中，导出时恢复。',
  },
  {
    disposition: 'merge',
    label: '并入正文',
    hint: '文本框中的段落进入稿件，紧接在锚定它的段落之后；导出时不再写出原文本框。',
  },
];

/** The choice as the review screen states it once made: the review is formed with it. */
export function textBoxChoiceStatement(disposition: TextBoxDisposition): string {
  const option = TEXT_BOX_CHOICE_OPTIONS.find((candidate) => candidate.disposition === disposition)!;
  return `本次复核的选择：${option.label.replace('（默认）', '')}。`;
}

/** Whether a staged review offers the choice: a text box the parser read natively, never a converted file. */
export function offersTextBoxChoice(
  fidelity: ReadonlyArray<FidelityCategoryProjection>,
  conversion: ManuscriptConversionProjection | null,
): boolean {
  return conversion === null && fidelity.some((category) => category.key === 'text-boxes' && category.count > 0 && category.status === 'retained');
}

// ---- around the review --------------------------------------------------------------------------------

/** The commit bar's note: what the one commit links, and — true of every import — that the original stays. */
export function commitNote(acceptedDegradation: boolean): string {
  return acceptedDegradation
    ? '已接受的完整降级集合、保真审阅、降级决定和稿件导入记录会原子关联；原文件随来源版本完整保留，导入不修改它。'
    : '本次导入不创建导入降级决定；原文件随来源版本完整保留，导入不修改它。';
}

/** How a committed import's fidelity outcome reads on its record. */
export function fidelityOutcomeLabel(outcome: ImportFidelityOutcome): string {
  return outcome === 'degraded-import-no-round-trip'
    ? '含已接受的降级 · 原文件随来源版本保留'
    : '完整保留 · 原文件随来源版本保留';
}
