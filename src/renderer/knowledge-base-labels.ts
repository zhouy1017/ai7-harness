import type {
  ExemplarBookProjection,
  ExemplarProjection,
  ReviewGuidelineDocumentProjection,
  ReviewGuidelinePreviewProjection,
  ReviewGuidelineVersionProjection,
} from '../shared/protocol.js';

/**
 * 知识库's words (Issue #427, plan slice S79a; editor-surfaces §8.4, V2-UX-KB-001 to KB-010): its seven classes in the
 * specification's order, what each holds, and 审阅规范文件's own lines. Books and Tasks only select from it and record the
 * versions they used; nothing here is edited in place.
 */

export type KnowledgeBaseTab = 'guidelines' | 'evaluation' | 'rules' | 'memory' | 'exemplars' | 'library' | 'external';

export interface KnowledgeBaseTabView {
  readonly tab: KnowledgeBaseTab;
  readonly label: string;
  /** What the class holds, said once at the top of its panel. */
  readonly holds: string;
  /** Why it shows nothing yet, for the classes a later slice brings; `null` for the classes that work now. */
  readonly pending: string | null;
}

export const KNOWLEDGE_BASE_TITLE = '知识库';
export const KNOWLEDGE_BASE_LEDE = '社里管理的专业资料。图书与任务只选用这里的条目、记下用的版本，从不就地改动。';
export const KNOWLEDGE_BASE_TABS_LABEL = '知识库分类';

export const KNOWLEDGE_BASE_TAB_VIEWS: ReadonlyArray<KnowledgeBaseTabView> = [
  {
    tab: 'guidelines',
    label: '审阅规范文件',
    holds: '审阅按这些文件的编号条款找问题，每次审阅记下它用的版本。导入新版本后，之后的审阅按新版本；做过的审阅仍写着当时的版本。',
    pending: null,
  },
  {
    tab: 'evaluation',
    label: '评估方案',
    holds: '审稿评估用的方案：百分制的评分项、风险项与预测。',
    pending: '尚未提供：评估方案随「评估与审稿意见」一起到来。',
  },
  { tab: 'rules', label: '工序与规则', holds: '专家经验工序与「快速开始」的默认执行规则。', pending: null },
  {
    tab: 'memory',
    label: '社级编辑记忆',
    holds: '社里沉淀下来的编辑经验，供审阅与写作参考。',
    pending: '尚未提供：社级编辑记忆还没有接通。',
  },
  {
    tab: 'exemplars',
    label: '范例',
    holds: '按已出版图书组织的审稿意见、新闻稿、宣传文章与评论文章；本社的书设为发稿版本后，交付过的文档自动归入，学习准入默认「仅本社」。',
    pending: null,
  },
  {
    tab: 'library',
    label: '资料库',
    holds: '编辑收集的图书、资料、论文与网页；定了归属与学习准入，任务才能把它列进「允许参考」。',
    pending: '尚未提供：资料库还没有接通。',
  },
  {
    tab: 'external',
    label: '外部来源留存',
    holds: '审查时留存的外部资料的跨书索引；归属仍在各书的来源与证据。',
    pending: '尚未提供：外部来源留存随外部核查的留存一起到来。',
  },
];

export function knowledgeBaseTabView(tab: KnowledgeBaseTab): KnowledgeBaseTabView {
  return KNOWLEDGE_BASE_TAB_VIEWS.find((view) => view.tab === tab)!;
}

// ---- 审阅规范文件 ----------------------------------------------------------------------------------------------------

export const GUIDELINE_IMPORT = '导入新版本…';
export const GUIDELINE_CONFIRM = '确认导入';
export const GUIDELINE_CANCEL = '取消';
export const GUIDELINE_UNUSED = '还没有审阅用过';
export const GUIDELINE_STATUS = {
  loading: '正在读取审阅规范文件…',
  opened: '审阅规范文件已打开',
  unavailable: '无法读取审阅规范文件。',
  choosing: '正在读取所选文件…',
  cancelled: '没有选择文件。',
  importing: '正在导入新版本…',
  failed: '无法导入这个文件。',
} as const;

/** The pill of a document: the version that applies now, and who issued it. */
export function guidelineVersionPill(document: Pick<ReviewGuidelineDocumentProjection, 'currentOrdinal' | 'issuer'>): string {
  return `第 ${document.currentOrdinal} 版 · ${document.issuer}`;
}

/** Which review categories apply a document. */
export function guidelineAppliedBy(document: Pick<ReviewGuidelineDocumentProjection, 'appliedBy'>): string {
  return `用于：${document.appliedBy.map((category) => category.label).join('、')}`;
}

/** The Books that will read under a newer version at their next review, or `null` when none still reads an older one. */
export function guidelineOlderBooks(document: Pick<ReviewGuidelineDocumentProjection, 'olderVersionBooks' | 'currentOrdinal'>): string | null {
  if (document.olderVersionBooks.length === 0) return null;
  const books = document.olderVersionBooks.map((book) => `《${book.bookTitle}》第 ${book.ordinal} 版`).join('、');
  return `还在用旧版：${books}；这些书下次审阅会按第 ${document.currentOrdinal} 版。`;
}

export function guidelineClausesSummary(count: number): string {
  return `编号条款（${count} 条）`;
}

export function guidelineCitations(citations: number): string {
  return citations === 0 ? '未被引用' : `被引用 ${citations} 次`;
}

export function guidelineVersionsSummary(count: number): string {
  return `版本（${count}）`;
}

/** One version's line: its number and issuer, when and from what it came, and which reviews used it. */
export function guidelineVersionLine(version: ReviewGuidelineVersionProjection, instant: (iso: string) => string): string {
  const origin = version.recordedAt === null ? '内置' : `导入于 ${instant(version.recordedAt)}${version.source === null ? '' : ` · ${version.source.displayName}`}`;
  const used = version.usedBy.length === 0
    ? GUIDELINE_UNUSED
    : `用于 ${version.usedBy.map((run) => `《${run.bookTitle}》第 ${run.reviewOrdinal} 次审阅`).join('、')}`;
  return `第 ${version.ordinal} 版 · ${version.issuer} · ${origin} · ${version.clauseCount} 条 · ${used}`;
}

export function guidelinePreviewHeading(preview: Pick<ReviewGuidelinePreviewProjection, 'ordinal' | 'title'>): string {
  return `将导入为《${preview.title}》第 ${preview.ordinal} 版`;
}

/** How the file's clauses differ from the version that applies now. */
export function guidelinePreviewChanges(preview: Pick<ReviewGuidelinePreviewProjection, 'source' | 'currentOrdinal' | 'changes' | 'clauses'>): string {
  const { changed, added, removed } = preview.changes;
  return `${preview.source.displayName} · ${preview.clauses.length} 条 · 与第 ${preview.currentOrdinal} 版相比：改动 ${changed} 条，新增 ${added} 条，删去 ${removed} 条`;
}

export function guidelineImported(title: string, ordinal: number): string {
  return `已导入《${title}》第 ${ordinal} 版；之后的审阅按第 ${ordinal} 版。`;
}

// ---- 范例 (Issue #427, plan slice S79b; KB-004, KB-006) --------------------------------------------------------------

export const EXEMPLARS_EMPTY = '还没有设为发稿版本的图书。本社的书设为发稿版本后，交付过的文档自动归入这里。';
export const EXEMPLARS_NONE_DELIVERED = '还没有交付过的文档；交付后自动归入。';
/** What 范例 does not hold yet, said once below the Books. */
export const EXEMPLARS_LATER = [
  '审稿意见随「评估与审稿意见」到来后，也会在设为发稿版本时归入。',
  '以前出版的书的范例由编辑导入并标明图书、作者、责编：尚未提供。',
] as const;
export const EXEMPLAR_ELIGIBILITY_LABELS: Readonly<Record<ExemplarProjection['eligibility'], string>> = { 'house-only': '仅本社' };

/** Who a published Book is attributed to, as its 人员 read now. */
export function exemplarAttribution(book: Pick<ExemplarBookProjection, 'authors' | 'editors'>): string {
  const authors = book.authors.length === 0 ? '未填写' : book.authors.join('、');
  const editors = book.editors.length === 0 ? '未填写' : book.editors.join('、');
  return `作者：${authors} · 责编：${editors}`;
}

export function exemplarDesignation(book: Pick<ExemplarBookProjection, 'designatedAt'>, instant: (iso: string) => string): string {
  return `设为发稿版本于 ${instant(book.designatedAt)}`;
}

/** One exemplar's line: its type and version, where it was delivered and when, when it came in, and its eligibility. */
export function exemplarLine(exemplar: ExemplarProjection, instant: (iso: string) => string): string {
  const earlier = exemplar.earlierVersions.length === 0 ? '' : ` · 此前还交付过版本 ${exemplar.earlierVersions.join('、')}`;
  return `${exemplar.typeLabel} · 版本 ${exemplar.version} · 交付给${exemplar.deliveredTo}于 ${instant(exemplar.deliveredAt)} · 归入于 ${instant(exemplar.archivedAt)}` +
    ` · 学习准入：${EXEMPLAR_ELIGIBILITY_LABELS[exemplar.eligibility]}${earlier}`;
}
