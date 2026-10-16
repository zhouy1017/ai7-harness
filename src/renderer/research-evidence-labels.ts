import {
  RESEARCH_EVIDENCE_STALE_LABEL,
  SOURCE_TRANSLATION_LABEL,
  type ResearchEvidenceBookProjection,
  type ResearchEvidenceFindingProjection,
  type ResearchEvidenceProjection,
  type RendererApi,
} from '../shared/protocol.js';

/**
 * The words of 来源与证据 and of a 事实核查 finding's sources (Issue #425, plan slice S70; V2-UX-SRC-013, EGR-003, FACT-007,
 * FACT-009). Pure: every line is a function of the projection and the instant formatter it is handed, so the unit suite reads
 * exactly what the editor reads. No line calls a source a verdict: a source is what was captured and whether the cited words
 * are in it, never 已验证.
 */
export const SOURCES_TITLE = '来源与证据';
export const SOURCES_ENTRY_LABEL = '来源与证据';
export const SOURCES_LEDE = '联网核查的运行留存的外部来源：AI7 自己取回的页面全文，取不到时只有检索返回的片段。来源不是事实结论；对应只说明引文的词句在不在取回的文字里。';
export const SOURCES_STATUS = {
  leaving: '正在保存并打开来源与证据…',
  loading: '正在读取来源与证据…',
  opened: '已打开来源与证据。',
  unavailable: '无法读取来源与证据。',
  openFailed: '无法打开来源与证据。',
  saving: '正在保存为来源材料…',
  saved: '已保存为来源材料：资料库里多了一份网页资料，归属与学习准入由你决定。',
  saveFailed: '无法保存为来源材料。',
} as const;
export const SOURCES_MORE = '更多来源';
export const SOURCE_SAVE_ACTION = '保存为来源材料';
export const SOURCE_SAVE_NOTE = '只在本机资料库里保存一份副本；不发布、不导出、不发送，也不授予任何任务读取它。';
export const SOURCE_ORIGINAL_LABEL = '原文';
export const SOURCE_TRANSLATION_MACHINE = '机器翻译，仅供理解；以原文为准。';
export const SOURCE_UNITS_HEADING = '各阅读范围的联网核查';

type InstantLabel = (iso: string) => string;

/** The site a source names: its title, else its host. */
export function sourceName(record: Pick<ResearchEvidenceProjection, 'sourceTitle' | 'url'>): string {
  if (record.sourceTitle !== null && record.sourceTitle.trim().length > 0) return record.sourceTitle.trim();
  try {
    return new URL(record.url).hostname;
  } catch {
    return record.url;
  }
}

/** 「来源全文 · 取回于 …」: how the source was captured, and when. */
export function sourceCaptureLine(record: Pick<ResearchEvidenceProjection, 'captureLabel' | 'capturedAt'>, instant: InstantLabel): string {
  return `${record.captureLabel} · 取回于 ${instant(record.capturedAt)}`;
}

/** 「可能已过期（取回于 …，已超过 90 天）」, or `null` for a source still current. */
export function sourceStalenessLine(record: Pick<ResearchEvidenceProjection, 'staleness' | 'capturedAt'>, staleAfterDays: number, instant: InstantLabel): string | null {
  if (record.staleness.state !== 'possibly-stale') return null;
  const why = record.staleness.reasons.map((reason) => reason === 'age' ? `已超过 ${staleAfterDays} 天` : '之后再次取回时内容已变').join('，');
  return `${RESEARCH_EVIDENCE_STALE_LABEL}（取回于 ${instant(record.capturedAt)}，${why}）`;
}

/** 「引文对应：对应 · 句 3」 — what the alignment found, and where — or why it found nothing. */
export function sourceAlignmentLine(record: Pick<ResearchEvidenceProjection, 'alignment' | 'alignmentLabel' | 'anchors' | 'claim' | 'captureState'>): string {
  if (record.captureState === 'failed') return `引文对应：${record.alignmentLabel}（没有取回任何文字）`;
  if (record.claim === null) return `引文对应：${record.alignmentLabel}（没有发现引用这个来源）`;
  const looked = record.claim.origin === 'basis-quotation' ? '依据中引用的词句' : '稿件引文';
  if (record.anchors.length === 0) return `引文对应：${record.alignmentLabel}（${looked}不在取回的文字里）`;
  const sentences = [...new Set(record.anchors.map((anchor) => anchor.sentence))];
  return `引文对应：${record.alignmentLabel} · ${looked} · 第 ${sentences.join('、')} 句`;
}

/** The side-by-side reading of a translated passage: the original, then the labelled machine translation; `null` without one. */
export function sourceTranslationView(record: Pick<ResearchEvidenceProjection, 'translation' | 'passage'>): { original: string; label: string; text: string; note: string } | { refused: string } | null {
  const translation = record.translation;
  if (translation === null) return null;
  if (translation.state === 'refused') return { refused: `${SOURCE_TRANSLATION_LABEL}：${translation.reason}` };
  return { original: record.passage ?? '', label: SOURCE_TRANSLATION_LABEL, text: translation.text, note: SOURCE_TRANSLATION_MACHINE };
}

/** One source as a finding card lists it: its name, capture, alignment and staleness, in one line. */
export function findingSourceLine(record: ResearchEvidenceProjection, staleAfterDays: number, instant: InstantLabel): string {
  const stale = sourceStalenessLine(record, staleAfterDays, instant);
  return [`来源：${sourceName(record)}`, sourceCaptureLine(record, instant), sourceAlignmentLine(record).replace('引文对应：', ''), stale]
    .filter((part): part is string => part !== null).join(' · ');
}

/** The research reading of one finding: a line per retained source, or why there is none. `null` outside research Runs. */
export function findingResearchLines(projection: ResearchEvidenceBookProjection, finding: { blockId: string; quote: string }, instant: InstantLabel): string[] | null {
  const research: ResearchEvidenceFindingProjection | undefined = projection.findings.find((entry) => entry.blockId === finding.blockId && entry.quote === finding.quote);
  if (research === undefined) return null;
  const records = projection.records.filter((record) => record.findingId === research.findingId && record.runRecordId === research.runRecordId);
  if (records.length === 0) return [research.label];
  return records.map((record) => findingSourceLine(record, projection.staleAfterDays, instant));
}

/** 「单元 2 · 联网核查已完成 · 检索 1 次 · 留存取回 1 次 · 1 个来源未能取回 · 1 条发现没有外部来源」. */
export function researchUnitLine(unit: ResearchEvidenceBookProjection['units'][number]): string {
  if (unit.retentionFailure !== undefined) return `阅读范围 ${unit.unitOrdinal} · 来源留存失败（${unit.retentionFailure === 'storage' ? '保存失败' : '处理失败'}）；没有可查看的留存来源。`;
  return [
    `阅读范围 ${unit.unitOrdinal}`, unit.label, `检索 ${unit.searchCalls} 次`, `留存取回 ${unit.retentionFetches} 次`,
    unit.failedRetrievals > 0 ? `${unit.failedRetrievals} 个来源未能取回全文` : null,
    unit.unsupportedFindings > 0 ? `${unit.unsupportedFindings} 条发现没有可留存的外部来源` : null,
  ].filter((part): part is string => part !== null).join(' · ');
}

/** Read all source pages for this exact Task and review finding; every individual response remains bounded. */
export async function readFindingResearch(api: Pick<RendererApi, 'inspectResearchEvidence'>, bookId: string, taskIntentId: string, reviewFindingId: string): Promise<ResearchEvidenceBookProjection> {
  let answer = await api.inspectResearchEvidence({ bookId, taskIntentId, reviewFindingId });
  const records = [...answer.records];
  while (answer.next !== null) {
    answer = await api.inspectResearchEvidence({ bookId, taskIntentId, reviewFindingId, after: answer.next });
    records.push(...answer.records);
  }
  return { ...answer, records };
}
