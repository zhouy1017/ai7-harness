/** Located for individual review, excluded from automatic batch application. */
export const REVIEW_GUESSED_ANCHOR_NOTE_PREFIX = '【锚点不唯一】';
export const REVIEW_PUNCTUATION_ALIGNED_NOTE = '（标点已与原稿对齐）';

/** Production disclosure is prepended without changing the reducer's note bytes. */
export const REVIEW_UNCHECKED_DISCLOSURE = '【未联网核查】';

export function reviewFindingHasGuessedAnchor(note: string): boolean {
  let findingNote = note;
  while (findingNote.startsWith(REVIEW_UNCHECKED_DISCLOSURE)) findingNote = findingNote.slice(REVIEW_UNCHECKED_DISCLOSURE.length);
  return findingNote.startsWith(REVIEW_GUESSED_ANCHOR_NOTE_PREFIX);
}

/** Structured review basis. Historical snapshots/report records retain their original text. */
export interface ReviewCategoryBasis {
  readonly categoryId: string;
  readonly executor: string;
  readonly searchEngine: boolean;
  readonly modelChannelSearchLabel?: string;
  readonly guidelineDocuments: ReadonlyArray<{ readonly documentId: string; readonly title: string; readonly issuer: string; readonly version: string }>;
  readonly procedure: { readonly title: string; readonly version: string };
  readonly localChecks?: { readonly punctuationEnabled: boolean; readonly numerals: 'disabled' | 'out-of-applicability' | 'national-standard' | 'editor-convention' };
  readonly seriesKnowledge?: boolean;
  readonly seriesScopes?: ReadonlyArray<{ readonly title: string }>;
  readonly deliverables?: {
    readonly participants: ReadonlyArray<{ readonly typeLabel: string; readonly title: string; readonly versionLabel: string; readonly documentId: string; readonly revisionId: string; readonly laterSaves: number; readonly omittedParagraphs: number; readonly paragraphs: ReadonlyArray<{ readonly truncated: boolean }> }>;
    readonly leftOut: ReadonlyArray<{ readonly title: string; readonly reason: string }>;
  };
}

export function technicalReviewBasis(entry: ReviewCategoryBasis): string {
  const procedure = `工序：${entry.procedure.title}（第 ${entry.procedure.version} 版）`;
  if (entry.executor === 'local-text-check') {
    const statement = `依据：GB/T 15834-2011、GB/T 15835-2011 的有限条款识别或编辑明确选择的数字约定 · ${procedure} · 本机确定性检查，不调用模型 · 不表示整部标准合规`;
    const checks = entry.localChecks;
    return checks === undefined ? statement : statement + `；标点：${checks.punctuationEnabled ? '编辑确认中文正文' : '未启用'}；数字：${checks.numerals === 'editor-convention' ? '编辑约定' : checks.numerals === 'national-standard' ? '编辑声明在适用范围内' : checks.numerals === 'out-of-applicability' ? '不在声明的适用范围内，未检查' : '未启用'}`;
  }
  if (entry.deliverables !== undefined) {
    const named = entry.deliverables.participants.map((document) => `${document.typeLabel}《${document.title}》${document.versionLabel}（文档 ${document.documentId} · 修订 ${document.revisionId}）`
      + (document.laterSaves === 0 ? '' : `；定稿后另有 ${document.laterSaves} 次保存，未参与`)
      + (document.omittedParagraphs === 0 && !document.paragraphs.some((paragraph) => paragraph.truncated) ? '' : '；仅比较标明的有界片段'));
    return `依据：所选稿件与${named.length === 0 ? '这本书的编辑交付物' : named.join('、')}`
      + entry.deliverables.leftOut.map((document) => `；未参与《${document.title}》：${document.reason}`).join('') + ` · ${procedure} · 交付物只读 · 不使用搜索引擎`;
  }
  if (entry.executor === 'baseline-leads') return `依据：这本书最新的基线分析结果 · ${procedure} · 不调用模型，不使用搜索引擎`;
  if (entry.executor === 'unavailable' || entry.executor === 'series-knowledge') {
    const source = entry.categoryId === 'series-consistency' ? '依据：书系知识' : '依据：这本书的编辑交付物';
    return `${source} · ${procedure}`;
  }
  if (entry.seriesKnowledge !== undefined) {
    // REV-013: the basis names the exact Series Knowledge revisions used, each Series with the items it gave.
    const bySeries = new Map<string, string[]>();
    for (const document of entry.guidelineDocuments) {
      bySeries.set(document.issuer, [...(bySeries.get(document.issuer) ?? []), `${document.title}第 ${document.version} 版`]);
    }
    const knowledge = Array.from(bySeries, ([series, items]) => `${series}的书系知识：${items.join('、')}`).join('；');
    return `依据：${knowledge} · ${procedure} · 不使用搜索引擎`;
  }
  const documents = entry.guidelineDocuments.map((document) => `${document.issuer} · ${document.title}（第 ${document.version} 版）`).join('、');
  const search = entry.searchEngine ? `${entry.modelChannelSearchLabel === undefined ? '使用用户所选的联网检索后端' : `将使用 ${entry.modelChannelSearchLabel} 自带的联网搜索`}；是否完成以本次运行的核查状态为准` : '不使用搜索引擎 · 未联网核查';
  const series = entry.seriesScopes?.map((scope) => `允许参考 · 书系《${scope.title}》的知识条目`).join('；');
  return `依据：${documents} · ${procedure} · ${search}${series === undefined ? '' : `；${series}`}`;
}
