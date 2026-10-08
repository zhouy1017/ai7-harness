/**
 * HTML to Markdown for `webfetch` (ADR 0080 §7.1, Issue #473 S87-f3a), written here rather than taken as a dependency: a
 * fetched page is read for its text, its headings, its lists, and its links, and nothing else of the markup matters to
 * the model or to the retention step that will share this owner (S70). Scripts, styles, and every other non-content
 * element are dropped with their content; entities are decoded; whitespace collapses outside `pre`.
 */

const DROPPED_ELEMENTS = new Set(['script', 'style', 'noscript', 'template', 'svg', 'head', 'iframe', 'object', 'canvas', 'select', 'button', 'form']);
const BLOCK_ELEMENTS = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'table', 'thead', 'tbody', 'tfoot', 'tr',
  'ul', 'ol', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'address', 'details', 'summary', 'body', 'html',
]);
const NAMED_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', ldquo: '“', rdquo: '”',
  lsquo: '‘', rsquo: '’', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™', middot: '·', bull: '•', times: '×',
  deg: '°', yen: '¥', euro: '€', pound: '£', sect: '§', para: '¶', ensp: ' ', emsp: ' ', thinsp: ' ', shy: '',
});

/** Decode character references: the common named set, and every decimal or hexadecimal reference to a valid code point. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/gu, (whole, body: string) => {
    if (body.startsWith('#')) {
      const point = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff && (point < 0xd800 || point > 0xdfff) ? String.fromCodePoint(point) : whole;
    }
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function attributeOf(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'iu').exec(tag);
  if (match === null) return null;
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? '');
}

/** A link target as the page's own URL resolves it, kept only when it is http(s). */
function resolvedHref(href: string, baseUrl: string | null): string | null {
  try {
    const url = baseUrl === null ? new URL(href) : new URL(href, baseUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Convert one HTML document to Markdown. `baseUrl` resolves relative links; without it only absolute links survive. */
export function htmlToMarkdown(html: string, baseUrl: string | null = null): string {
  const source = html.replace(/<!--[\s\S]*?-->/gu, '').replace(/<!doctype[^>]*>/giu, '');
  const out: string[] = [];
  const links: Array<string | null> = [];
  const lists: Array<{ ordered: boolean; next: number }> = [];
  let dropDepth = 0;
  let dropName: string | null = null;
  let preDepth = 0;
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/gu;
  let cursor = 0;
  const pushText = (raw: string): void => {
    if (dropDepth > 0 || raw.length === 0) return;
    const decoded = decodeEntities(raw);
    out.push(preDepth > 0 ? decoded : decoded.replace(/\s+/gu, ' '));
  };
  const block = (): void => {
    out.push('\n\n');
  };
  for (let match = tagPattern.exec(source); match !== null; match = tagPattern.exec(source)) {
    pushText(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const tag = match[0];
    const name = match[1]!.toLowerCase();
    const closing = tag.startsWith('</');
    if (dropDepth > 0) {
      if (name === dropName) dropDepth += closing ? -1 : tag.endsWith('/>') ? 0 : 1;
      if (dropDepth === 0) dropName = null;
      continue;
    }
    if (DROPPED_ELEMENTS.has(name)) {
      if (!closing && !tag.endsWith('/>')) {
        dropDepth = 1;
        dropName = name;
      }
      continue;
    }
    if (/^h[1-6]$/u.test(name)) {
      block();
      if (!closing) out.push(`${'#'.repeat(Number(name[1]))} `);
      continue;
    }
    switch (name) {
      case 'br':
        out.push('\n');
        continue;
      case 'hr':
        out.push('\n\n---\n\n');
        continue;
      case 'li':
        if (!closing) {
          const list = lists[lists.length - 1];
          const marker = list?.ordered === true ? `${list.next++}. ` : '- ';
          out.push(`\n${'  '.repeat(Math.max(0, lists.length - 1))}${marker}`);
        }
        continue;
      case 'ul':
      case 'ol':
        if (closing) lists.pop();
        else lists.push({ ordered: name === 'ol', next: 1 });
        block();
        continue;
      case 'a':
        if (closing) {
          const href = links.pop();
          if (href !== undefined && href !== null) out.push(`](${href})`);
        } else {
          const raw = attributeOf(tag, 'href');
          const href = raw === null ? null : resolvedHref(raw, baseUrl);
          links.push(href);
          if (href !== null) out.push('[');
        }
        continue;
      case 'strong':
      case 'b':
        out.push('**');
        continue;
      case 'em':
      case 'i':
        out.push('*');
        continue;
      case 'code':
        if (preDepth === 0) out.push('`');
        continue;
      case 'pre':
        if (closing) {
          preDepth = Math.max(0, preDepth - 1);
          out.push('\n```\n\n');
        } else {
          preDepth += 1;
          out.push('\n\n```\n');
        }
        continue;
      case 'blockquote':
        block();
        if (!closing) out.push('> ');
        continue;
      case 'td':
      case 'th':
        if (!closing) out.push(' | ');
        continue;
      default:
        if (BLOCK_ELEMENTS.has(name)) block();
        continue;
    }
  }
  pushText(source.slice(cursor));
  return out.join('')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/u, '').replace(/^[ \t]+(?=[^-\d ])/u, ''))
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}
