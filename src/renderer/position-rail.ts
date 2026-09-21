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

  const draw = (rail: ManuscriptRailProjection): void => {
    ticks.replaceChildren(...rail.chapters.map((chapter) => {
      const tick = el('div', 'rail-tick');
      tick.style.top = percent(chapter.proportion);
      tick.dataset['railLevel'] = String(chapter.level);
      const marked = chapter.suggestions + chapter.annotations + chapter.notes;
      tick.title = marked === 0
        ? chapter.title
        : `${chapter.title} · 修改建议 ${chapter.suggestions} · 批注 ${chapter.annotations} · 备注 ${chapter.notes}`;
      return tick;
    }));
    gaps.replaceChildren(...(rail.uncovered ?? []).map((range) => {
      const gap = el('div', 'rail-gap');
      gap.style.top = percent(range.fromProportion);
      gap.style.height = percent(Math.max(0.004, range.toProportion - range.fromProportion));
      gap.title = `分析未覆盖：${range.reason}`;
      gap.dataset['railGap'] = 'uncovered';
      return gap;
    }));
    const markers: HTMLElement[] = [];
    LANE_KINDS.forEach((kind, lane) => {
      const slots = new Map<number, { count: number; blockId: string }>();
      for (const mark of rail.marks) {
        if (mark.kind !== kind) continue;
        const slot = Math.min(LANE_SLOTS - 1, Math.floor(mark.proportion * LANE_SLOTS));
        const held = slots.get(slot);
        if (held) held.count += 1;
        else slots.set(slot, { count: 1, blockId: mark.blockId });
      }
      for (const [slot, held] of slots) {
        const marker = el('button', 'rail-marker') as HTMLButtonElement;
        marker.type = 'button';
        marker.dataset['railKind'] = kind;
        marker.dataset['railLane'] = String(lane + 1);
        marker.dataset['railCount'] = String(held.count);
        marker.style.top = percent((slot + 0.5) / LANE_SLOTS);
        marker.setAttribute('aria-label', `${LANE_LABELS[kind]} ${held.count} 处，跳到这里`);
        marker.title = `${LANE_LABELS[kind]} ${held.count} 处`;
        marker.tabIndex = -1;
        marker.addEventListener('click', () => options.jumpToBlock(held.blockId));
        markers.push(marker);
      }
    });
    lanes.replaceChildren(...markers);
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
