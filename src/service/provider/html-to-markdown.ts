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

/**
 * The deepest list nesting the output indents. Deeper items keep their marker at this depth: a page of `<ul>` after `<ul>`
 * would otherwise make every item's indent as long as the nesting, and the output quadratic in the input (the re-review
 * of #671).
 */
export const LIST_INDENT_MAX_DEPTH = 8;

/** The marker that ends a converted text cut at its character bound. */
export const TRUNCATION_MARKER = '\n\n（以下已截断：正文超过字符上限。）';

/**
 * Convert one HTML document to Markdown. `baseUrl` resolves relative links; without it only absolute links survive. With
 * `maxCharacters`, the conversion stops once its output passes the bound and the text is cut there and ends with
 * `TRUNCATION_MARKER`, so the output never grows past the bound whatever the page holds.
 */
export function htmlToMarkdown(html: string, baseUrl: string | null = null, options: { readonly maxCharacters?: number } = {}): string {
  const budget = options.maxCharacters ?? Number.POSITIVE_INFINITY;
  const out: string[] = [];
  let emitted = 0;
  const emit = (piece: string): void => {
    out.push(piece);
    emitted += piece.length;
  };
  const links: Array<string | null> = [];
  const lists: Array<{ ordered: boolean; next: number }> = [];
  let dropDepth = 0;
  let dropName: string | null = null;
  let preDepth = 0;
  const pushText = (raw: string): void => {
    if (dropDepth > 0 || raw.length === 0) return;
    const decoded = decodeEntities(raw);
    emit(preDepth > 0 ? decoded : decoded.replace(/\s+/gu, ' '));
  };
  const block = (): void => {
    emit('\n\n');
  };
  let cut = false;
  for (const token of scanHtml(html)) {
    // Past the bound nothing more is read: whitespace normalization only shortens, so a margin of one bound is enough.
    if (emitted > budget * 2) {
      cut = true;
      break;
    }
    if (token.kind === 'text') {
      pushText(token.text);
      continue;
    }
    const { tag, name } = token;
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
      if (!closing) emit(`${'#'.repeat(Number(name[1]))} `);
      continue;
    }
    switch (name) {
      case 'br':
        emit('\n');
        continue;
      case 'hr':
        emit('\n\n---\n\n');
        continue;
      case 'li':
        if (!closing) {
          const list = lists[lists.length - 1];
          const marker = list?.ordered === true ? `${list.next++}. ` : '- ';
          emit(`\n${'  '.repeat(Math.min(LIST_INDENT_MAX_DEPTH, Math.max(0, lists.length - 1)))}${marker}`);
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
          if (href !== undefined && href !== null) emit(`](${href})`);
        } else {
          const raw = attributeOf(tag, 'href');
          const href = raw === null ? null : resolvedHref(raw, baseUrl);
          links.push(href);
          if (href !== null) emit('[');
        }
        continue;
      case 'strong':
      case 'b':
        emit('**');
        continue;
      case 'em':
      case 'i':
        emit('*');
        continue;
      case 'code':
        if (preDepth === 0) emit('`');
        continue;
      case 'pre':
        if (closing) {
          preDepth = Math.max(0, preDepth - 1);
          emit('\n```\n\n');
        } else {
          preDepth += 1;
          emit('\n\n```\n');
        }
        continue;
      case 'blockquote':
        block();
        if (!closing) emit('> ');
        continue;
      case 'td':
      case 'th':
        if (!closing) emit(' | ');
        continue;
      default:
        if (BLOCK_ELEMENTS.has(name)) block();
        continue;
    }
  }
  const text = out.join('')
    .split('\n')
    .map((line) => trimTrailingBlanks(line).replace(/^[ \t]+(?=[^-\d ])/u, ''))
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  // A conversion that stopped reading is cut even when what it kept is short: the model learns it read part of the page.
  return cut ? `${codePointPrefix(text, budget)}${TRUNCATION_MARKER}` : capText(text, budget);
}

/** The first `maxCharacters` code points of a text, never cut inside a surrogate pair. */
function codePointPrefix(text: string, maxCharacters: number): string {
  let end = 0;
  let points = 0;
  while (end < text.length && points < maxCharacters) {
    const code = text.charCodeAt(end);
    end += code >= 0xd800 && code <= 0xdbff && end + 1 < text.length ? 2 : 1;
    points += 1;
  }
  return text.slice(0, end);
}

/**
 * A text cut at `maxCharacters` code points, ending with `TRUNCATION_MARKER` when anything was cut. The marker is outside
 * the bound, so the model always learns that it read part of the source.
 */
export function capText(text: string, maxCharacters: number): string {
  const prefix = codePointPrefix(text, maxCharacters);
  return prefix.length === text.length ? text : `${prefix}${TRUNCATION_MARKER}`;
}

/** A line without its trailing spaces and tabs, by one backward walk (a `[ \t]+$` pattern backtracks over every run). */
function trimTrailingBlanks(line: string): string {
  let end = line.length;
  while (end > 0 && (line.charCodeAt(end - 1) === 0x20 || line.charCodeAt(end - 1) === 0x09)) end -= 1;
  return line.slice(0, end);
}

type HtmlToken = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'tag'; readonly tag: string; readonly name: string };

function isAsciiLetter(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

function isTagNameCode(code: number): boolean {
  return isAsciiLetter(code) || (code >= 0x30 && code <= 0x39) || code === 0x2d;
}

/**
 * One forward pass over the markup, linear in its length whatever it holds (the review of #671): each `<` is answered by
 * at most one `indexOf` for its end, and a construct whose end never comes ends the scan instead of being searched for
 * again from the next `<`. An unclosed comment, declaration, or processing instruction hides the rest of the page; an
 * unclosed tag leaves the rest as text. A `<` that opens no tag is text.
 */
export function* scanHtml(source: string): Generator<HtmlToken> {
  let index = 0;
  while (index < source.length) {
    const open = source.indexOf('<', index);
    if (open < 0) {
      yield { kind: 'text', text: source.slice(index) };
      return;
    }
    if (open > index) yield { kind: 'text', text: source.slice(index, open) };
    if (source.startsWith('<!--', open)) {
      const end = source.indexOf('-->', open + 4);
      if (end < 0) return;
      index = end + 3;
      continue;
    }
    const next = source.charCodeAt(open + 1);
    if (next === 0x21 || next === 0x3f) {
      // `<!doctype …>`, `<![CDATA[…]]>`-like declarations, and `<?…>` carry no text worth keeping.
      const end = source.indexOf('>', open + 2);
      if (end < 0) return;
      index = end + 1;
      continue;
    }
    const nameStart = next === 0x2f ? open + 2 : open + 1;
    if (!isAsciiLetter(source.charCodeAt(nameStart))) {
      yield { kind: 'text', text: '<' };
      index = open + 1;
      continue;
    }
    const end = source.indexOf('>', nameStart);
    if (end < 0) {
      yield { kind: 'text', text: source.slice(open) };
      return;
    }
    let nameEnd = nameStart;
    while (nameEnd < end && isTagNameCode(source.charCodeAt(nameEnd))) nameEnd += 1;
    yield { kind: 'tag', tag: source.slice(open, end + 1), name: source.slice(nameStart, nameEnd).toLowerCase() };
    index = end + 1;
  }
}
