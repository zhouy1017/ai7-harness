import type { ManuscriptRailProjection, RendererApi } from '../shared/protocol.js';

/**
 * The Whole-manuscript Position Rail's drawing (Issue #409; editor-surfaces §1 右缘一列; V2-UX-ED-010,
 * ED-011, ED-015, ED-020, ED-059). Three parallel lanes stand in one narrow column: chapter ticks and
 * the ranges the analysis left unread on one side of the track, the track with the current position
 * in the middle, and the open 修改建议, 批注 and 备注 on the other side, each kind in its fixed colour
 * and its own sub-lane. The range input the surface already had stays the control — pointer, keyboard
 * and the accessible value are its — and this module only draws behind it and answers a click on a
 * marker with a jump. It reads no manuscript text: every place is a proportion.
 */
export interface PositionRail {
  /** Read the places again: marks changed, text moved, or an analysis settled. */
  refresh(): void;
  /** Where the manuscript window now stands, 0 to 1. */
  setPosition(proportion: number): void;
  destroy(): void;
}

interface MountOptions {
  /** The positioned box the track is drawn in; the range input lies over it. */
  track: HTMLElement;
  api: Pick<RendererApi, 'getManuscriptRail'>;
  binding(): { manuscriptId: string; branchId: string };
  jumpToBlock(blockId: string): void;
  onError(error: unknown): void;
}

/** A lane is drawn in this many slots, so a manuscript with thousands of marks still draws a bounded rail. */
const LANE_SLOTS = 160;
const LANE_KINDS = ['change-suggestion', 'annotation', 'editor-note'] as const;
const LANE_LABELS: Readonly<Record<(typeof LANE_KINDS)[number], string>> = {
  'change-suggestion': '修改建议',
  annotation: '批注',
  'editor-note': '备注',
};

function el(tag: 'div' | 'button', className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function percent(proportion: number): string {
  return `${(Math.min(1, Math.max(0, proportion)) * 100).toFixed(3)}%`;
}

/**
 * Draw `items` into `host` keeping the node each key had (Issue #1178): a refresh after one decision changes the few markers whose
 * slot it moved, instead of drawing the column again. Only a key new to the rail creates a node and only a key gone removes one; the
 * others are updated in place and stay in the order drawn.
 */
function keyed<T>(host: HTMLElement, nodes: Map<string, HTMLElement>, items: ReadonlyArray<T>, key: (item: T, index: number) => string,
  create: (item: T) => HTMLElement, update: (node: HTMLElement, item: T) => void): void {
  const ordered = items.map((item, index) => {
    const id = key(item, index);
    let node = nodes.get(id);
    if (node === undefined) {
      node = create(item);
      nodes.set(id, node);
    }
    update(node, item);
    return [id, node] as const;
  });
  const kept = new Set(ordered.map(([id]) => id));
  for (const [id, node] of nodes) {
    if (kept.has(id)) continue;
    node.remove();
    nodes.delete(id);
  }
  ordered.forEach(([, node], index) => {
    if (host.children[index] !== node) host.insertBefore(node, host.children[index] ?? null);
  });
}

export function mountPositionRail(options: MountOptions): PositionRail {
  const ticks = el('div', 'rail-ticks');
  const gaps = el('div', 'rail-gaps');
  const line = el('div', 'rail-line');
  const now = el('div', 'rail-now');
  const lanes = el('div', 'rail-lanes');
  ticks.setAttribute('aria-hidden', 'true');
  line.setAttribute('aria-hidden', 'true');
  now.setAttribute('aria-hidden', 'true');
  options.track.append(gaps, ticks, line, now, lanes);
  let destroyed = false;
  let generation = 0;

  const tickNodes = new Map<string, HTMLElement>();
  const gapNodes = new Map<string, HTMLElement>();
  const markerNodes = new Map<string, HTMLElement>();
  /** The paragraph each marker jumps to, as last drawn. */
  const targets = new WeakMap<HTMLElement, string>();

  const draw = (rail: ManuscriptRailProjection): void => {
    keyed(ticks, tickNodes, rail.chapters, (_chapter, index) => String(index), () => el('div', 'rail-tick'), (tick, chapter) => {
      tick.style.top = percent(chapter.proportion);
      tick.dataset['railLevel'] = String(chapter.level);
      const marked = chapter.suggestions + chapter.annotations + chapter.notes;
      tick.title = marked === 0
        ? chapter.title
        : `${chapter.title} · 修改建议 ${chapter.suggestions} · 批注 ${chapter.annotations} · 备注 ${chapter.notes}`;
    });
    keyed(gaps, gapNodes, rail.uncovered ?? [], (_range, index) => String(index), () => {
      const gap = el('div', 'rail-gap');
      gap.dataset['railGap'] = 'uncovered';
      return gap;
    }, (gap, range) => {
      gap.style.top = percent(range.fromProportion);
      gap.style.height = percent(Math.max(0.004, range.toProportion - range.fromProportion));
      gap.title = `分析未覆盖：${range.reason}`;
    });
    const markers: Array<{ kind: (typeof LANE_KINDS)[number]; lane: number; slot: number; count: number; blockId: string }> = [];
    LANE_KINDS.forEach((kind, lane) => {
      const slots = new Map<number, { count: number; blockId: string }>();
      for (const mark of rail.marks) {
        if (mark.kind !== kind) continue;
        const slot = Math.min(LANE_SLOTS - 1, Math.floor(mark.proportion * LANE_SLOTS));
        const held = slots.get(slot);
        if (held) held.count += 1;
        else slots.set(slot, { count: 1, blockId: mark.blockId });
      }
      for (const [slot, held] of slots) markers.push({ kind, lane, slot, ...held });
    });
    keyed(lanes, markerNodes, markers, (marker) => `${marker.kind}:${marker.slot}`, (held) => {
      const marker = el('button', 'rail-marker') as HTMLButtonElement;
      marker.type = 'button';
      marker.dataset['railKind'] = held.kind;
      marker.dataset['railLane'] = String(held.lane + 1);
      marker.style.top = percent((held.slot + 0.5) / LANE_SLOTS);
      marker.tabIndex = -1;
      marker.addEventListener('click', () => options.jumpToBlock(targets.get(marker)!));
      return marker;
    }, (marker, held) => {
      targets.set(marker, held.blockId);
      if (marker.dataset['railCount'] === String(held.count)) return;
      marker.dataset['railCount'] = String(held.count);
      marker.setAttribute('aria-label', `${LANE_LABELS[held.kind]} ${held.count} 处，跳到这里`);
      marker.title = `${LANE_LABELS[held.kind]} ${held.count} 处`;
    });
    options.track.dataset['railChapters'] = String(rail.chapters.length);
    options.track.dataset['railMarks'] = String(rail.marks.length);
    options.track.dataset['railSparse'] = rail.chaptersTruncated || rail.marksTruncated ? 'true' : 'false';
    options.track.dataset['railAnalysed'] = rail.uncovered === null ? 'false' : 'true';
    options.track.dataset['railJournal'] = String(rail.journalSequence);
  };

  const refresh = (): void => {
    if (destroyed) return;
    const current = ++generation;
    void options.api.getManuscriptRail(options.binding()).then((rail) => {
      // A later refresh speaks for a later state; an earlier answer arriving after it draws nothing.
      if (!destroyed && current === generation) draw(rail);
    }, (error: unknown) => {
      if (!destroyed && current === generation) options.onError(error);
    });
  };

  return {
    refresh,
    setPosition: (proportion) => {
      now.style.top = percent(proportion);
    },
    destroy: () => {
      destroyed = true;
      for (const node of [ticks, gaps, line, now, lanes]) node.remove();
    },
  };
}
