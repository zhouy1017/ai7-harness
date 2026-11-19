import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANNED, BY_HAND, STAYS } from './words-table.mjs';

// `pnpm run words:report [-- <file or folder>…]` (Issue #1546, plan #1516 §5): per file, the banned terms of the vocabulary
// table found in text an editor reads in ordinary mode, with the line and the replacement; then the rows only a reader can
// judge. It reports and never blocks: the exit code is always 0. Without arguments it scans src/renderer/ and the
// editor-facing sentences of src/shared/report-wording.ts. #1531 turns the same scan into a failing test.
//
// A line-level scan, not a TypeScript parser. It keeps only the text of string and template literals, drops comments and
// regular expressions, and drops the first argument of `technicalWords(…)` (developer-mode text).
// What it cannot see: a term split by concatenation ('待' + '处理'), by an interpolation or by a line break inside a template.
// What it reports falsely: a longer word that contains a term (「连续行走」 holds 续行), developer-only screens and branches,
// and sentences that quote a banned word. A literal that is one ASCII word (`'tokens'`, a data key) is never text.
// An unreadable file or folder is named with its error code and skipped: nothing the scan meets changes the exit code.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_TARGETS = ['src/renderer', 'src/shared/report-wording.ts'];
const CODE = new Set(['.ts', '.mts', '.js', '.mjs']);
const TEXT = new Set(['.html']);
const REGEX_AFTER_CHARACTER = new Set('(,=:[!&|?{};+-*%<>~^');
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'in', 'of', 'void', 'delete', 'throw', 'else', 'do']);
const WORD_CHARACTER = /[A-Za-z0-9_$]/u;
const ASCII_KEY = /^[A-Za-z0-9_$.:/-]+$/u;

/**
 * Keeps only what an editor can read in source code: the characters of string and template-literal text. Everything else
 * (code, comments, regular expressions) and the first argument of every `technicalWords(…)` call become spaces; newlines
 * stay, so a position in the result is the position in the source. `lostSync` is true when the source ended inside a
 * string, comment or bracket, or a quote ran past its line — then the scan of that file cannot be trusted.
 */
export function maskSource(source) {
  const out = source.replace(/[^\r\n]/g, ' ').split('');
  const stack = []; // '(' | '[' | '{' | { call: true, arg } for `technicalWords(` | { template: true } for `${`
  let mode = 'code';
  let exempt = 0; // how many open `technicalWords(` calls are still in their first argument
  let lostSync = false;
  let previous = ''; // the last significant character of code
  let word = ''; // the identifier being read
  let lastWord = ''; // the identifier just before, while only blanks have come since
  let literalStart = -1; // where the text of a quoted literal began, while it has had no `${`
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (mode === 'line') { if (ch === '\n') mode = 'code'; continue; }
    if (mode === 'block') { if (ch === '*' && next === '/') { mode = 'code'; i += 1; } continue; }
    if (mode === 'sq' || mode === 'dq' || mode === 'tpl') {
      const quote = mode === 'sq' ? "'" : mode === 'dq' ? '"' : '`';
      if (ch === '\\') { i += next === '\r' && source[i + 2] === '\n' ? 2 : 1; continue; }
      if (ch === quote) {
        // A literal that is one ASCII word (`'tokens'`, `'data-key'`) is a key or an identifier, never a sentence (Issue #1531).
        if (literalStart >= 0 && ASCII_KEY.test(source.slice(literalStart, i))) for (let at = literalStart; at < i; at += 1) out[at] = ' ';
        mode = 'code'; previous = ch; lastWord = ''; literalStart = -1; continue;
      }
      if (mode === 'tpl' && ch === '$' && next === '{') { literalStart = -1; stack.push({ template: true }); mode = 'code'; previous = '{'; lastWord = ''; i += 1; continue; }
      if (ch === '\n' && mode !== 'tpl') { lostSync = true; mode = 'code'; continue; }
      if (exempt === 0) out[i] = ch;
      continue;
    }
    if (mode === 'regex' || mode === 'class') {
      if (ch === '\\') { i += 1; continue; }
      if (ch === '\n') { lostSync = true; mode = 'code'; continue; }
      if (mode === 'regex' && ch === '[') mode = 'class';
      else if (mode === 'class' && ch === ']') mode = 'regex';
      else if (mode === 'regex' && ch === '/') { mode = 'code'; previous = '/'; lastWord = ''; while (/[a-z]/.test(source[i + 1] ?? '')) i += 1; }
      continue;
    }
    // mode === 'code'
    if (WORD_CHARACTER.test(ch)) { word += ch; previous = ch; continue; }
    if (word !== '') { lastWord = word; word = ''; }
    if (/\s/u.test(ch)) continue;
    if (ch === '/' && next === '/') { mode = 'line'; i += 1; continue; }
    if (ch === '/' && next === '*') { mode = 'block'; i += 1; continue; }
    if (ch === "'") { mode = 'sq'; literalStart = i + 1; continue; }
    if (ch === '"') { mode = 'dq'; literalStart = i + 1; continue; }
    if (ch === '`') { mode = 'tpl'; literalStart = i + 1; continue; }
    if (ch === '/' && (previous === '' || REGEX_AFTER_CHARACTER.has(previous) || REGEX_AFTER_WORD.has(lastWord))) { mode = 'regex'; continue; }
    if (ch === '(') {
      const call = lastWord === 'technicalWords';
      stack.push(call ? { call: true, arg: 0 } : '(');
      if (call) exempt += 1;
    } else if (ch === '[' || ch === '{') stack.push(ch);
    else if (ch === ')' || ch === ']' || ch === '}') {
      const top = stack.pop();
      if (top !== undefined && typeof top === 'object') {
        if (top.call && top.arg === 0) exempt -= 1;
        if (top.template) mode = 'tpl';
      }
    } else if (ch === ',') {
      const top = stack[stack.length - 1];
      if (top !== undefined && typeof top === 'object' && top.call) {
        if (top.arg === 0) exempt -= 1;
        top.arg += 1;
      }
    }
    previous = ch;
    lastWord = '';
  }
  if ((mode !== 'code' && mode !== 'line') || stack.length > 0) lostSync = true;
  return { text: out.join(''), lostSync };
}

// A term that begins or ends with an ASCII letter or digit must not sit inside a longer ASCII name (`maxTokens`, `tokens-row`).
// A space inside a term matches blanks on the same line only, so a hit is always one line.
function pattern(term) {
  const body = term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/ +/gu, '[ \\t]*');
  const before = /^[A-Za-z0-9]/u.test(term) ? '(?<![A-Za-z0-9_-])' : '';
  const after = /[A-Za-z0-9]$/u.test(term) ? '(?![A-Za-z0-9_-])' : '';
  return `${before}${body}${after}`;
}

/**
 * Where the table's words stand in masked text: `banned` terms (longest first, and a term inside a longer banned term or a
 * word that stays is not reported: 应用凭据 is not 凭据) and the `hand` candidates (never inside a banned term or a word that stays).
 */
export function findTerms(masked, { banned = BANNED, byHand = BY_HAND, stays = STAYS } = {}) {
  const spans = [];
  const collect = (kind, source, flags, row) => {
    for (const match of masked.matchAll(new RegExp(source, flags))) {
      if (match[0] !== '') spans.push({ kind, row, found: match[0], start: match.index, end: match.index + match[0].length });
    }
  };
  for (const row of banned) for (const term of row.terms) collect('banned', pattern(term), 'giu', row);
  for (const word of stays) collect('stays', pattern(word), 'gu', undefined);
  const taken = [];
  const free = (span) => !taken.some((other) => span.start < other.end && other.start < span.end);
  for (const span of spans.sort((a, b) => a.start - b.start || b.end - a.end)) if (free(span)) taken.push(span);
  const found = taken.filter((span) => span.kind === 'banned');
  const hand = [];
  for (const row of byHand) {
    for (const match of masked.matchAll(new RegExp(row.candidate, 'gu'))) {
      const span = { kind: 'hand', row, found: match[0], start: match.index, end: match.index + match[0].length };
      if (span.end > span.start && free(span)) hand.push(span);
    }
  }
  return [...found, ...hand].sort((a, b) => a.start - b.start);
}

/** One file's result: { banned: [{ line, term, use }], hand: [{ from, line }], lostSync }. */
export function scanSource(source, extension = '.ts', table) {
  const masked = CODE.has(extension)
    ? maskSource(source)
    : { text: source.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\r\n]/g, ' ')), lostSync: false };
  const result = { banned: [], hand: [], lostSync: masked.lostSync };
  let line = 1;
  let offset = 0;
  for (const span of findTerms(masked.text, table)) {
    for (; offset < span.start; offset += 1) if (masked.text.charCodeAt(offset) === 10) line += 1;
    if (span.kind === 'banned') result.banned.push({ line, term: span.found.replace(/\s+/g, ' '), use: span.row.use });
    else result.hand.push({ from: span.row.from, line });
  }
  return result;
}

const shown = (path) => relative(ROOT, path).split(sep).join('/');
const failure = (error) => (typeof error?.code === 'string' ? error.code : 'ERROR');

// `target` is the path as the caller gave it, set for a top-level target only; a failure anywhere is recorded, never thrown.
function expand(path, found, target) {
  try {
    if (!statSync(path).isDirectory()) {
      if (target !== undefined || CODE.has(extname(path)) || TEXT.has(extname(path))) found.files.add(path);
      return;
    }
    for (const name of readdirSync(path).sort()) expand(resolve(path, name), found, undefined);
  } catch (error) {
    if (target !== undefined && failure(error) === 'ENOENT') found.missing.push(target);
    else found.unreadable.push(`${shown(path)} (${failure(error)})`);
  }
}

/**
 * Scan files or folders (relative to the repository root); the per-file results come back in path order. Targets that do not
 * exist are `missing`; anything that cannot be read is `unreadable` with its error code; the rest is still scanned.
 */
export function scanTargets(targets = DEFAULT_TARGETS, { read = (path) => readFileSync(path, 'utf8') } = {}) {
  const found = { files: new Set(), missing: [], unreadable: [] };
  for (const target of targets) expand(resolve(ROOT, target), found, target);
  const results = [];
  let skipped = 0;
  for (const path of [...found.files].sort()) {
    const extension = extname(path);
    if (!CODE.has(extension) && !TEXT.has(extension)) { skipped += 1; continue; }
    let source;
    try { source = read(path); } catch (error) { found.unreadable.push(`${shown(path)} (${failure(error)})`); continue; }
    results.push({ file: shown(path), ...scanSource(source, extension) });
  }
  return { results, skipped, missing: found.missing, unreadable: found.unreadable.sort() };
}

/** The report text: short and stable — the banned term, its line and its replacement; no sentence of the product. */
export function formatReport({ results, skipped, missing, unreadable = [] }) {
  const out = [];
  let total = 0;
  for (const result of results) {
    if (result.banned.length === 0) continue;
    total += result.banned.length;
    out.push(`${result.file} (${result.banned.length})`);
    for (const hit of result.banned) out.push(`  ${hit.line}  ${hit.term} -> ${hit.use}`);
  }
  const files = results.filter((result) => result.banned.length > 0).length;
  out.push(`${total} banned term${total === 1 ? '' : 's'} in ${files} of ${results.length} file${results.length === 1 ? '' : 's'}${skipped > 0 ? ` (${skipped} skipped: not .ts or .html)` : ''}`);
  for (const target of missing) out.push(`not found: ${target}`);
  for (const entry of unreadable) out.push(`unreadable: ${entry}`);
  out.push('', 'Check by hand (only the sentence decides; these lines are candidates, not findings):');
  for (const row of BY_HAND) {
    out.push(`  ${row.from} -> ${row.use}`);
    for (const result of results) {
      const lines = [...new Set(result.hand.filter((hit) => hit.from === row.from).map((hit) => hit.line))];
      if (lines.length > 0) out.push(`    ${result.file}: ${lines.join(', ')}`);
    }
  }
  const lost = results.filter((result) => result.lostSync).map((result) => result.file);
  if (lost.length > 0) out.push('', `The scan lost its place in ${lost.length} file${lost.length === 1 ? '' : 's'}; read these by hand: ${lost.join(', ')}`);
  return out.join('\n');
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.on('error', () => undefined); // a closed pipe (`| head`) is not a failure of the report
  try {
    const targets = process.argv.slice(2).filter((argument) => argument !== '--');
    process.stdout.write(`${formatReport(scanTargets(targets.length > 0 ? targets : undefined))}\n`);
  } catch (error) {
    process.stdout.write(`words:report could not finish (${failure(error)})\n`);
  }
  process.exitCode = 0;
}
