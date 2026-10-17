import type { ParagraphAnalysisProjection } from '../shared/protocol.js';

export const PARAGRAPH_ANALYSIS_LABELS = { entities: '人物与名称', events: '事件', settingClaims: '设定', relationships: '关系' } as const;
const noticesByBook = new Map<string, Set<number>>();

/** One notice per revision during this editor visit. Showing it never marks the panel as viewed. */
export function analysisHintNeeded(ordinal: number, lastViewed: number, items: number, shown: ReadonlySet<number>): boolean {
  return ordinal > lastViewed && items > 0 && !shown.has(ordinal);
}

export function mountParagraphAnalysis(options: {
  bookId: string;
  root: HTMLElement;
  entry: HTMLButtonElement;
  read(): Promise<ParagraphAnalysisProjection | null>;
  lastViewed(): number;
  viewed(revision: { revisionId: string; ordinal: number }): Promise<void>;
  notice(): void;
  beforeOpen(): void;
  openItem(item: ParagraphAnalysisProjection['items'][number], revisionId: string): void;
}): { refresh(): void; close(): void; toggle(): void; destroy(): void } {
  const { root, entry } = options;
  root.hidden = true;
  entry.setAttribute('aria-controls', root.id);
  entry.setAttribute('aria-expanded', 'false');
  const shown = noticesByBook.get(options.bookId) ?? new Set<number>();
  noticesByBook.set(options.bookId, shown);
  let timer: number | undefined;
  let disposed = false;
  let pending = false;
  let reading = false;
  let projection: ParagraphAnalysisProjection | null = null;
  const viewed = (): void => {
    if (projection?.revision != null) void options.viewed({ revisionId: projection.revision.revisionId, ordinal: projection.revision.ordinal }).catch(() => {
      if (!disposed && !root.hidden) root.append(words('无法记住本次查看位置，下次打开时可能再次提示。'));
    });
  };
  const words = (text: string): HTMLParagraphElement => { const p = document.createElement('p'); p.textContent = text; return p; };
  const paint = (): void => {
    root.replaceChildren();
    const title = document.createElement('h3'); title.textContent = '当前段落的分析'; root.append(title);
    const revision = projection?.revision;
    if (revision == null) { root.append(words('尚无可用的段落分析。')); return; }
    root.dataset['analysisRevision'] = revision.revisionId;
    root.append(words(`分析第 ${revision.ordinal} 版 · ${revision.freshness.label}`));
    if (projection!.total === 0) root.append(words('当前段落附近暂无分析发现。'));
    if (projection!.total > projection!.items.length) root.append(words(`共 ${projection!.total} 项，显示前 ${projection!.items.length} 项；查看分析可读完整结果。`));
    for (const kind of Object.keys(PARAGRAPH_ANALYSIS_LABELS) as Array<keyof typeof PARAGRAPH_ANALYSIS_LABELS>) {
      const items = projection!.items.filter((item) => item.kind === kind);
      if (items.length === 0) continue;
      const section = document.createElement('section'); const heading = document.createElement('h4'); heading.textContent = PARAGRAPH_ANALYSIS_LABELS[kind]; section.append(heading);
      for (const item of items) {
        const line = words(item.label); const link = document.createElement('button'); link.type = 'button'; link.textContent = '查看'; link.addEventListener('click', () => options.openItem(item, revision.revisionId)); line.append(' ', link); section.append(line);
      }
      root.append(section);
    }
  };
  const load = async (): Promise<void> => {
    if (disposed || !entry.isConnected) return;
    if (reading) { pending = true; return; }
    reading = true;
    try {
      const next = await options.read();
      if (disposed || !entry.isConnected) return;
      projection = next;
      if (root.hidden && next?.revision != null && analysisHintNeeded(next.revision.ordinal, options.lastViewed(), next.total, shown)) {
        shown.add(next.revision.ordinal); options.notice();
      }
      if (!root.hidden) { paint(); viewed(); }
    } catch { if (!disposed && !root.hidden) root.replaceChildren(words('无法读取段落分析，请重新打开重试。')); }
    finally { reading = false; if (pending) { pending = false; refresh(); } }
  };
  const refresh = (): void => { if (timer !== undefined) window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 220); };
  const close = (): void => { root.hidden = true; entry.setAttribute('aria-expanded', 'false'); };
  root.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); close(); entry.focus(); } });
  const interval = window.setInterval(refresh, 5_000);
  refresh();
  return { refresh, close, toggle: () => {
    if (!root.hidden) { close(); return; }
    options.beforeOpen(); root.hidden = false; entry.setAttribute('aria-expanded', 'true'); paint(); refresh();
  }, destroy: () => { disposed = true; window.clearInterval(interval); if (timer !== undefined) window.clearTimeout(timer); } };
}
