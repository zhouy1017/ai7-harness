import { spawnSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Inspect versioned documentation only. Archives and local files are never read. */
export function activeMarkdown(paths) {
  return paths.filter((path) => path.endsWith('.md') && !path.startsWith('docs/archive/') &&
    (!path.startsWith('SampleBooks/') || path === 'SampleBooks/README.md'));
}

function escaped(text, index) {
  let slashes = 0;
  while (index > 0 && text[--index] === '\\') slashes += 1;
  return slashes % 2 === 1;
}

// Preserve newlines so a finding points at the source line, without interpreting examples as links.
function proseOnly(markdown) {
  const tokens = /^ {0,3}(`{3,}|~{3,})([^\n]*)|<!--|`+/gmu;
  let cursor = 0;
  let prose = '';
  for (let token; (token = tokens.exec(markdown)) !== null;) {
    let end;
    if (token[1] && (token[1][0] === '~' || !token[2].includes('`'))) {
      const close = new RegExp(`^ {0,3}${token[1][0]}{${token[1].length},}[ \\t\\r]*$`, 'gmu');
      close.lastIndex = tokens.lastIndex;
      const closing = close.exec(markdown);
      end = closing ? closing.index + closing[0].length : markdown.length;
    } else if (token[0] === '<!--') {
      const closing = markdown.indexOf('-->', tokens.lastIndex);
      end = closing < 0 ? markdown.length : closing + 3;
    } else {
      // Code spans may cross lines; only a run of exactly the same length closes them.
      const delimiter = token[1] ?? token[0];
      const start = token.index + (token[1] ? token[0].indexOf(delimiter) : 0);
      tokens.lastIndex = start + delimiter.length;
      if (escaped(markdown, start)) continue;
      const close = /`+/gu;
      close.lastIndex = tokens.lastIndex;
      let closing;
      while ((closing = close.exec(markdown)) !== null && closing[0].length !== delimiter.length) { /* Next run. */ }
      if (!closing) continue;
      end = closing.index + closing[0].length;
    }
    prose += markdown.slice(cursor, token.index) + markdown.slice(token.index, end).replace(/[^\n]/gu, ' ');
    cursor = end;
    tokens.lastIndex = end;
  }
  return prose + markdown.slice(cursor);
}

/** Markdown inline/image destinations and reference definitions; no remote requests. */
export function linkDestinations(markdown) {
  const prose = proseOnly(markdown);
  const destinations = [];
  const patterns = [
    /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|((?:[^\s()\\]|\\.|\([^()\n]*\))+))(?:\s+["'][^\n]*?["'])?\s*\)/gu,
    /^ {0,3}\[[^\]\n]+\]:\s*(?:<([^>\n]+)>|(\S+))/gmu,
    /\b(?:href|src)\s*=\s*["']([^"'\n]+)["']/giu,
  ];
  for (const pattern of patterns) {
    for (const match of prose.matchAll(pattern)) {
      const bracket = match.index + (match[0].startsWith('!') ? 1 : 0);
      if (prose[bracket] === '[' && escaped(prose, bracket)) continue;
      destinations.push({ target: match[1] ?? match[2], line: prose.slice(0, match.index).split('\n').length });
    }
  }
  return destinations.sort((a, b) => a.line - b.line);
}

export function localTarget(source, destination) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu.test(destination)) return null;
  const path = destination.split(/[?#]/u, 1)[0];
  if (!path) return null;
  let decoded;
  try { decoded = decodeURIComponent(path).replace(/\\([\\()[\] ])/gu, '$1'); }
  catch { throw new Error('invalid-url-encoding'); }
  const target = posix.normalize(path.startsWith('/') ? decoded.slice(1) : posix.join(posix.dirname(source), decoded));
  if (target === '..' || target.startsWith('../') || target.includes('\\') || target.includes('\0')) throw new Error('outside-repository');
  return target.replace(/\/$/u, '');
}

/** A case-sensitive tracked-path lookup also catches links that only happen to work on Windows. */
export async function checkDocuments(paths, readDocument) {
  const tracked = new Set(paths);
  const directories = new Set(['.']);
  for (const path of paths) {
    let parent = posix.dirname(path);
    while (parent !== '.') { directories.add(parent); parent = posix.dirname(parent); }
  }
  const findings = [];
  for (const source of activeMarkdown(paths)) {
    let markdown;
    try { markdown = await readDocument(source); }
    catch { findings.push({ source, line: 1, reason: 'unreadable-document' }); continue; }
    if (source === 'CLAUDE.md' && !/^@AGENTS\.md\r?\n?$/u.test(markdown)) {
      findings.push({ source, line: 1, reason: 'wrapper-must-be-@AGENTS.md' });
    }
    for (const link of linkDestinations(markdown)) {
      let target;
      try { target = localTarget(source, link.target); }
      catch (error) { findings.push({ source, line: link.line, reason: error.message }); continue; }
      if (target !== null && !tracked.has(target) && !directories.has(target)) {
        findings.push({ source, line: link.line, reason: 'missing-tracked-target', target });
      }
    }
  }
  for (const source of ['AGENTS.md', 'CLAUDE.md']) {
    if (!tracked.has(source)) findings.push({ source, line: 1, reason: 'missing-root-router' });
  }
  return findings;
}

/** Never follow a tracked document or replaced parent directory into excluded/local content. */
export async function readTrackedDocument(root, path) {
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('\\'))) throw new Error('invalid-document-path');
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = resolve(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) {
      throw new Error('non-regular-document');
    }
  }
  return readFile(current, 'utf8');
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node tools/check-docs.mjs\nCheck tracked active Markdown local file/directory links and root routers.\nArchives, external URLs and heading fragments are not inspected. Stage new files before checking.');
    return 0;
  }
  if (args.length !== 0) throw new Error('unsupported-arguments');
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (listed.error || listed.status !== 0) throw new Error('tracked-file-enumeration-failed');
  const paths = listed.stdout.split('\0').filter(Boolean);
  const findings = await checkDocuments(paths, (path) => readTrackedDocument(ROOT, path));
  for (const finding of findings) {
    console.error(`DOCS/${finding.reason}: ${finding.source}:${finding.line}${finding.target ? ` -> ${finding.target}` : ''}`);
  }
  console.log(`DOCS/${findings.length === 0 ? 'pass' : 'fail'}: ${activeMarkdown(paths).length} active documents; ${findings.length} findings`);
  return findings.length === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch(() => {
    console.error('DOCS/check-failed');
    process.exitCode = 1;
  });
}
