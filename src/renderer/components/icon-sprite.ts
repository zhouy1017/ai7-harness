/** Exact symbol geometry from September prototypes ②B and ①, editor-surfaces §0.4.
 * The 17 A4 IDs are fixed; i-nav and i-task are the prototype's right-rail extensions. Issue #1413 cluster 2 gives every
 * entry its own symbol: i-agent (全域智能体), i-workspace (Agent 工作区) and i-comment (批注).
 */
export const ICON_IDS = ['i-inbox', 'i-library', 'i-series', 'i-kb', 'i-learn', 'i-settings', 'i-ms', 'i-review', 'i-star', 'i-box', 'i-flag', 'i-analysis', 'i-source', 'i-overview', 'i-history', 'i-menu', 'i-back', 'i-nav', 'i-task', 'i-agent', 'i-workspace', 'i-comment', 'i-undo', 'i-redo'] as const;
export type IconId = (typeof ICON_IDS)[number];
const SYMBOLS: Readonly<Record<IconId, ReadonlyArray<readonly [string, Readonly<Record<string, string>>]>>> = {
  "i-undo": [["path", {"d": "M4 9h10a6 6 0 010 12"}], ["path", {"d": "M9 4L4 9l5 5"}]],
  "i-redo": [["path", {"d": "M20 9H10a6 6 0 000 12"}], ["path", {"d": "M15 4l5 5-5 5"}]],
  "i-inbox": [["path", {"d": "M3 12l2.6-7h12.8L21 12v7H3z"}], ["path", {"d": "M3 12h5l1.5 3h5L16 12h5"}]],
  "i-library": [["rect", {"x": "3", "y": "4", "width": "4", "height": "16", "rx": "1"}], ["rect", {"x": "9.5", "y": "4", "width": "4", "height": "16", "rx": "1"}], ["path", {"d": "M16.2 4.6l3.9.9-3.3 14.5-3.9-.9z"}]],
  "i-series": [["path", {"d": "M12 3l9 4.5-9 4.5-9-4.5z"}], ["path", {"d": "M3 12l9 4.5 9-4.5"}], ["path", {"d": "M3 16.5L12 21l9-4.5"}]],
  "i-kb": [["path", {"d": "M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z"}], ["path", {"d": "M4 20.5A2.5 2.5 0 016.5 18H20"}], ["path", {"d": "M9 7h7M9 11h7"}]],
  "i-learn": [["path", {"d": "M4 20v-8"}], ["path", {"d": "M10 20V5"}], ["path", {"d": "M16 20v-6"}], ["path", {"d": "M22 20V9"}], ["path", {"d": "M2 20h21"}]],
  "i-settings": [["path", {"d": "M4 7h16"}], ["circle", {"cx": "9", "cy": "7", "r": "2.3"}], ["path", {"d": "M4 17h16"}], ["circle", {"cx": "15", "cy": "17", "r": "2.3"}]],
  "i-ms": [["path", {"d": "M5 4h11l3 3v13H5z"}], ["path", {"d": "M8 9h8M8 13h8M8 17h5"}]],
  "i-review": [["circle", {"cx": "11", "cy": "11", "r": "6"}], ["path", {"d": "M15.5 15.5L21 21"}], ["path", {"d": "M8.5 11l2 2 3-3"}]],
  "i-star": [["path", {"d": "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"}]],
  "i-box": [["path", {"d": "M3 8l9-4 9 4-9 4z"}], ["path", {"d": "M3 8v9l9 4 9-4V8"}], ["path", {"d": "M12 12v9"}]],
  "i-flag": [["path", {"d": "M5 21V4"}], ["path", {"d": "M5 4h12l-2 4 2 4H5"}]],
  "i-analysis": [["circle", {"cx": "12", "cy": "12", "r": "8"}], ["circle", {"cx": "12", "cy": "12", "r": "3"}], ["path", {"d": "M12 4v2M12 18v2M4 12h2M18 12h2"}]],
  "i-source": [["path", {"d": "M4 6h16v12H4z"}], ["path", {"d": "M8 10h8M8 14h5"}]],
  "i-overview": [["rect", {"x": "3", "y": "4", "width": "7", "height": "7", "rx": "1"}], ["rect", {"x": "14", "y": "4", "width": "7", "height": "7", "rx": "1"}], ["rect", {"x": "3", "y": "15", "width": "7", "height": "6", "rx": "1"}], ["rect", {"x": "14", "y": "15", "width": "7", "height": "6", "rx": "1"}]],
  "i-history": [["path", {"d": "M20 12a8 8 0 11-2.3-5.7"}], ["path", {"d": "M20 4v5h-5"}], ["path", {"d": "M12 8v4l3 2"}]],
  "i-menu": [["path", {"d": "M4 7h16M4 12h16M4 17h16"}]],
  "i-back": [["path", {"d": "M10 6l-6 6 6 6"}], ["path", {"d": "M4 12h16"}]],
  "i-nav": [["path", {"d": "M4 6h10"}], ["path", {"d": "M4 12h7"}], ["path", {"d": "M4 18h9"}], ["circle", {"cx": "17", "cy": "13.5", "r": "3.3"}], ["path", {"d": "M19.5 16L22 18.5"}]],
  "i-task": [["path", {"d": "M4 20l3.6-.9 10.2-10.2-2.7-2.7L4.9 16.4z"}], ["path", {"d": "M13.6 7.7l2.7 2.7"}], ["path", {"d": "M14 20h6"}]],
  "i-agent": [["path", {"d": "M4 5h16v11H9l-4 3.5V16H4z"}], ["path", {"d": "M12 7.6l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z"}]],
  "i-workspace": [["rect", {"x": "3", "y": "4", "width": "18", "height": "16", "rx": "2"}], ["path", {"d": "M3 9h18"}], ["path", {"d": "M10 9v11"}], ["circle", {"cx": "15.5", "cy": "14.5", "r": "1.6"}]],
  "i-comment": [["path", {"d": "M5 5h14v10h-7l-4 3.5V15H5z"}], ["path", {"d": "M8.5 9h7M8.5 12h4"}]],
};
const NS = 'http://www.w3.org/2000/svg';
export function icon(id: IconId): SVGSVGElement {
  if (!document.querySelector('#editor-icon-sprite')) {
    const sprite = document.createElementNS(NS, 'svg');
    sprite.id = 'editor-icon-sprite';
    sprite.setAttribute('aria-hidden', 'true');
    sprite.classList.add('icon-sprite');
    for (const id of ICON_IDS) {
      const symbol = document.createElementNS(NS, 'symbol');
      symbol.id = id;
      symbol.setAttribute('viewBox', '0 0 24 24');
      for (const [tag, attributes] of SYMBOLS[id]) {
        const shape = document.createElementNS(NS, tag);
        for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
        symbol.append(shape);
      }
      sprite.append(symbol);
    }
    document.body.append(sprite);
  }
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('icon');
  svg.dataset['icon'] = id;
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

export function navigationIcon(value: string): SVGSVGElement { return icon(ICON_IDS.includes(value as IconId) ? value as IconId : 'i-library'); }
