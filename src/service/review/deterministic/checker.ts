import { setImmediate } from 'node:timers/promises';
import { canonicalJson, sha256Hex } from '../../analysis/canonical.js';
import { graphemeCount, sliceGraphemes } from '../../analysis/factual-review-contract.js';
import { LocalCheckError, numeralBasis, validateLocalPlan, type LocalCheckBlock, type LocalCheckPlan } from './plan.js';
import { LOCAL_RULE_IDS, LOCAL_RULES, type LocalRuleId } from './rules.js';

export interface LocalCandidate {
  readonly id: string; readonly ruleId: LocalRuleId; readonly version: 1;
  readonly blockId: string; readonly from: number; readonly to: number; readonly quote: string;
  readonly observation: string; readonly basis: 'national-standard' | 'editor-convention';
}
export interface LocalRuleCounts {
  checked: number; exempt: number; skipped: number; error: number; findings: number;
  disabled: number; outOfApplicability: number; notRecognized: number; noFinding: number;
}
export interface LocalCheckResult {
  readonly schema: 'ai7.review.local-result/1'; readonly planDigest: string;
  readonly paragraphs: number; readonly candidates: readonly LocalCandidate[];
  readonly excluded: readonly { readonly candidateId: string; readonly reason: string }[];
  readonly counts: Readonly<Record<LocalRuleId, LocalRuleCounts>>;
}
type Opener = { mark: string; block: LocalCheckBlock; from: number; to: number; uncertain: boolean };
type ListRow = { block: LocalCheckBlock; indent: string; number: bigint; from: number; to: number };
const SEGMENTER = new Intl.Segmenter('zh', { granularity: 'grapheme' });
const PAIRS: Readonly<Record<string, string>> = { '”': '“', '’': '‘', '）': '（' };
const IDENTIFIER_CHARACTER = /^(?!\p{Script=Han})[\p{L}\p{N}\p{M}_]$/u;
// Sign glyphs other than the ASCII pair N01 spells: a token they start is signed, so it stays outside both grammars.
const OTHER_SIGN = /[＋－±∓﹢﹣]/u;
const emptyCounts = (): LocalRuleCounts => ({ checked: 0, exempt: 0, skipped: 0, error: 0, findings: 0, disabled: 0, outOfApplicability: 0, notRecognized: 0, noFinding: 0 });

/** Deterministic offsets never enter the quotation-search fallback used by a model. */
export function candidateHasExactAnchor(plan: LocalCheckPlan, candidate: LocalCandidate, graphemes?: readonly string[],
  block: LocalCheckBlock | undefined = plan.blocks.find((frozen) => frozen.blockId === candidate.blockId)): boolean {
  const basis = numeralBasis(plan.options);
  const enabled = candidate.ruleId.startsWith('P') ? plan.options.punctuation === 'chinese-prose' && candidate.basis === 'national-standard'
    : (basis === 'national-standard' || basis === 'editor-convention') && candidate.basis === basis && plan.options.numeralRules.some((id) => id === candidate.ruleId);
  const expectedId = sha256Hex(canonicalJson({ source: plan.source, rule: candidate.ruleId, version: 1, blockId: candidate.blockId, from: candidate.from, to: candidate.to }));
  return enabled && candidate.version === 1 && candidate.id === expectedId && block !== undefined && block.blockId === candidate.blockId && Number.isSafeInteger(candidate.from) && Number.isSafeInteger(candidate.to) && candidate.from >= 0 && candidate.to > candidate.from &&
    candidate.quote.length > 0 && candidate.to <= (graphemes?.length ?? graphemeCount(block.text)) &&
    (graphemes === undefined ? sliceGraphemes(block.text, candidate.from, candidate.to) : graphemes.slice(candidate.from, candidate.to).join('')) === candidate.quote;
}

/** Materialization validates each frozen block once, including repeated-text candidates with known offsets. */
export function exactLocalCandidateIds(plan: LocalCheckPlan, candidates: readonly LocalCandidate[]): ReadonlySet<string> {
  const blocks = new Map(plan.blocks.map((block) => [block.blockId, block]));
  const cache = new Map<string, readonly string[]>();
  const valid = new Set<string>();
  for (const candidate of candidates) {
    const block = blocks.get(candidate.blockId);
    if (block === undefined) continue;
    let graphemes = cache.get(candidate.blockId);
    if (graphemes === undefined) {
      graphemes = Array.from(SEGMENTER.segment(block.text), (segment) => segment.segment); cache.set(candidate.blockId, graphemes);
    }
    if (candidateHasExactAnchor(plan, candidate, graphemes, block)) valid.add(candidate.id);
  }
  return valid;
}

/** One pass over frozen paragraphs, with cooperative yields within large paragraphs as well as between them. */
export async function checkLocalPlan(plan: LocalCheckPlan, options: {
  readonly cancelled?: () => boolean;
  readonly checkpoint?: (phase: 'scan' | 'matches') => Promise<void>;
} = {}): Promise<LocalCheckResult> {
  validateLocalPlan(plan);
  const checkpoint = async (phase: 'scan' | 'matches' = 'scan'): Promise<void> => {
    if (options.cancelled?.()) throw new LocalCheckError('LOCAL_CHECK_CANCELLED', '本地检查已取消。');
    await (options.checkpoint?.(phase) ?? setImmediate());
    if (options.cancelled?.()) throw new LocalCheckError('LOCAL_CHECK_CANCELLED', '本地检查已取消。');
  };
  const counts = Object.fromEntries(LOCAL_RULE_IDS.map((id) => [id, emptyCounts()])) as Record<LocalRuleId, LocalRuleCounts>;
  const candidates: LocalCandidate[] = [];
  const excluded: { candidateId: string; reason: string }[] = [];
  const emitted = new Set<string>();
  const frozenGraphemes = new Map<string, readonly string[]>();
  const basis = numeralBasis(plan.options);
  const enabled = (id: LocalRuleId): boolean => id.startsWith('P') ? plan.options.punctuation === 'chinese-prose'
    : basis !== 'disabled' && basis !== 'out-of-applicability' && plan.options.numeralRules.includes(id as 'N01' | 'N02');
  const emit = (id: LocalRuleId, block: LocalCheckBlock, from: number, to: number, observation: string): void => {
    const parts = frozenGraphemes.get(block.blockId);
    const quote = parts?.slice(from, to).join('') ?? '';
    const candidate: LocalCandidate = { id: sha256Hex(canonicalJson({ source: plan.source, rule: id, version: 1, blockId: block.blockId, from, to })),
      ruleId: id, version: 1, blockId: block.blockId, from, to, quote, observation,
      basis: id.startsWith('N') && basis === 'editor-convention' ? 'editor-convention' : 'national-standard' };
    if (emitted.has(candidate.id)) return;
    emitted.add(candidate.id);
    if (candidates.length >= 10000 || candidate.quote.length > 65536) {
      counts[id].error++;
      if (excluded.length < 256) excluded.push({ candidateId: candidate.id, reason: 'local-result-limit' });
      return;
    }
    if (!candidateHasExactAnchor(plan, candidate, parts, block)) {
      // Counted in full; the listed reasons stay within the artifact's 256-entry bound.
      counts[id].error += 1; if (excluded.length < 256) excluded.push({ candidateId: candidate.id, reason: 'exact-grapheme-anchor-invalid' }); return;
    }
    candidates.push(candidate); counts[id].findings += 1;
  };
  const stack: Opener[] = [];
  const discardedClosers = new Map<string, number>();
  let gap = false;
  let fence: { char: string; length: number } | null = null;
  let previousList: ListRow | null = null;
  let previousPosition = 0;
  for (const block of plan.blocks) {
    await checkpoint();
    if (previousPosition > 0 && block.position !== previousPosition + 1) { stack.length = 0; discardedClosers.clear(); gap = true; previousList = null; }
    previousPosition = block.position;
    const graphemes: string[] = [];
    const boundaries: number[] = [];
    for (const segment of SEGMENTER.segment(block.text)) {
      boundaries.push(segment.index); graphemes.push(segment.segment);
      if (graphemes.length % 2048 === 0) await checkpoint();
    }
    boundaries.push(block.text.length);
    frozenGraphemes.set(block.blockId, graphemes);
    const indexAt = new Map(boundaries.map((offset, index) => [offset, index]));
    const mask = new Uint8Array(graphemes.length);
    const exclude = (from: number, to: number): void => { mask.fill(1, from, to); };
    const exclusionByUtf16 = (from: number, to: number): void => {
      // Exclusions widen to grapheme boundaries; findings never do.
      const lowerBound = (offset: number): number => {
        let low = 0; let high = boundaries.length;
        while (low < high) { const middle = (low + high) >>> 1; if (boundaries[middle]! < offset) low = middle + 1; else high = middle; }
        return low;
      };
      const first = lowerBound(from); const last = lowerBound(to);
      mask.fill(1, boundaries[first] === from ? first : Math.max(0, first - 1), last);
    };
    const fenceMark = /^(\s*)(`{3,}|~{3,})/u.exec(block.text);
    if (fence !== null) {
      exclude(0, mask.length);
      if (fenceMark?.[2]?.[0] === fence.char && fenceMark[2].length >= fence.length && block.text.slice(fenceMark[0].length).trim() === '') fence = null;
    } else if (fenceMark !== null) {
      fence = { char: fenceMark[2]![0]!, length: fenceMark[2]!.length }; exclude(0, mask.length);
    } else {
      let offset = 0;
      while (offset < block.text.length) {
        const start = block.text.indexOf('`', offset);
        if (start < 0) break;
        let endStart = start;
        while (block.text[endStart] === '`') endStart++;
        const delimiter = block.text.slice(start, endStart);
        let end = block.text.indexOf(delimiter, endStart);
        while (end >= 0 && (block.text[end - 1] === '`' || block.text[end + delimiter.length] === '`')) end = block.text.indexOf(delimiter, end + 1);
        offset = end < 0 ? block.text.length : end + delimiter.length;
        exclusionByUtf16(start, offset);
      }
      for (const token of block.text.matchAll(/\S+/gu)) {
        if (/^(?:https?:\/\/|www\.)/iu.test(token[0]) || /^[\x21-\x7e]+@[^@\s]+\.[^@\s]+$/u.test(token[0])) exclusionByUtf16(token.index, token.index + token[0].length);
      }
    }
    for (const range of plan.options.excludedRanges) if (range.blockId === block.blockId) exclude(range.from, range.to);
    const hasExclusion = mask.some((value) => value === 1);
    for (const id of LOCAL_RULE_IDS) {
      if (!enabled(id)) {
        if (id.startsWith('N') && basis === 'out-of-applicability') counts[id].outOfApplicability++;
        else counts[id].disabled++;
      } else { counts[id].checked++; if (hasExclusion) counts[id].exempt++; }
    }
    const before = new Map(LOCAL_RULE_IDS.map((id) => [id, counts[id].findings]));
    const skippedBefore = new Map(LOCAL_RULE_IDS.map((id) => [id, counts[id].skipped]));
    const recognized = new Set<LocalRuleId>();
    const exact = (from: number, to: number): boolean => from >= 0 && to > from && to <= mask.length && !mask.subarray(from, to).some((value) => value === 1);
    if (enabled('P01')) {
      const first = graphemes.findIndex((value) => !/^\s+$/u.test(value));
      for (let index = 0; index < graphemes.length; index++) {
        if (index % 2048 === 0) await checkpoint();
        if (mask[index]) { stack.length = 0; discardedClosers.clear(); gap = true; continue; }
        const mark = graphemes[index]!;
        const insideQuote = stack.some((entry) => entry.mark === '“');
        if (mark === '“' || mark === '（' || (mark === '‘' && insideQuote)) {
          recognized.add('P01');
          if (mark === '“' && index === first && insideQuote) continue;
          stack.push({ mark, block, from: index, to: index + 1, uncertain: gap });
        } else if (PAIRS[mark] !== undefined && (mark !== '’' || insideQuote)) {
          recognized.add('P01');
          const matched = stack.findLastIndex((entry) => entry.mark === PAIRS[mark]);
          if (matched >= 0) {
            if (matched !== stack.length - 1) {
              const opener = stack[matched]!;
              emit('P01', block, index, index + 1, `闭合标点与当前已知开符交叉；对应开符位于内容块 ${opener.block.position}、字位 ${opener.from}。`);
              for (const discarded of stack.slice(matched + 1)) {
                const closer = Object.keys(PAIRS).find((key) => PAIRS[key] === discarded.mark)!;
                discardedClosers.set(closer, (discardedClosers.get(closer) ?? 0) + 1);
              }
            }
            stack.splice(matched);
          } else if ((discardedClosers.get(mark) ?? 0) > 0) discardedClosers.set(mark, discardedClosers.get(mark)! - 1);
          // A right single quote with no left single quote open is a possible apostrophe, which this rule never diagnoses.
          else if (mark === '’') counts.P01.skipped++;
          else if (plan.scope === 'whole' && !gap) emit('P01', block, index, index + 1, '在完整全书边界内未找到对应开符。');
          else counts.P01.skipped++;
        }
      }
    }
    if (enabled('P02')) {
      let matches = 0;
      for (const match of block.text.matchAll(/…+/gu)) {
        if (++matches % 512 === 0) await checkpoint('matches');
        recognized.add('P02');
        const from = indexAt.get(match.index); const to = indexAt.get(match.index + match[0].length);
        if (from === undefined || to === undefined || !exact(from, to)) { counts.P02.skipped++; continue; }
        const count = match[0].length;
        if (/^\s*\d+\s*$/u.test(block.text.slice(match.index + count))) { counts.P02.skipped++; continue; }
        if (count === 4) { if (!plan.options.doubledEllipsisBlockIds.includes(block.blockId)) counts.P02.skipped++; }
        else if (count !== 2) emit('P02', block, from, to, `识别到连续 ${count} 个 U+2026，需核对省略号形式。`);
      }
    }
    if (enabled('P03')) {
      const match = /^(\s*)（([1-9]\d*)）\s*([、，。；：,.]?)([^\r\n]+)$/u.exec(block.text);
      let current: ListRow | null = null;
      if (match !== null && /\p{Script=Han}/u.test(match[4]!) && !hasExclusion) {
        recognized.add('P03');
        const utf = match[1]!.length + match[2]!.length + 2 + (block.text.slice(match[1]!.length + match[2]!.length + 2).match(/^\s*/u)?.[0].length ?? 0);
        const from = indexAt.get(utf);
        current = { block, indent: match[1]!, number: BigInt(match[2]!), from: from ?? -1, to: match[3] ? (from ?? -1) + 1 : -1 };
        if (previousList !== null && previousList.indent === current.indent && previousList.number + 1n === current.number) {
          for (const row of [previousList, current]) if (row.to > row.from && row.from >= 0) emit('P03', row.block, row.from, row.to, '相邻递增的括号序号后紧接标点，请核对序号形式。');
        } else counts.P03.skipped++;
      }
      previousList = current;
    }
    const numeric = async (id: 'N01' | 'N02', expression: RegExp): Promise<void> => {
      if (!enabled(id)) return;
      let matches = 0;
      for (const match of block.text.matchAll(expression)) {
        if (++matches % 512 === 0) await checkpoint('matches');
        recognized.add(id);
        const start = match.index; const end = start + match[0].length;
        const preceding = Array.from(block.text.slice(Math.max(0, start - 2), start)).at(-1) ?? '';
        const following = Array.from(block.text.slice(end, end + 2))[0] ?? '';
        // Identifier, path, signed/scientific and dotted continuations are outside this grammar.
        if (IDENTIFIER_CHARACTER.test(preceding) || IDENTIFIER_CHARACTER.test(following) || /[.\/%％万亿+\-−—~～]/u.test(preceding) || OTHER_SIGN.test(preceding) || preceding === '\\' ||
            /[.\/]/u.test(following) || following === '\\') { counts[id].skipped++; continue; }
        const from = indexAt.get(start); const to = indexAt.get(end);
        if (from === undefined || to === undefined || !exact(from, to)) { counts[id].skipped++; continue; }
        emit(id, block, from, to, id === 'N01' ? '识别到没有整数部分的百分数小数；请核对是否缺少零。' : '范围前端未写百分号或数量级；请逐端核对实际含义。');
      }
    };
    await numeric('N01', /[+\-]?\.\d+[%％]/gu);
    await numeric('N02', /\d+(?:\.\d+)?[～~—]\d+(?:\.\d+)?(?:亿元|万元|[%％万亿])/gu);
    for (const id of LOCAL_RULE_IDS) if (enabled(id)) {
      if (!recognized.has(id)) counts[id].notRecognized++;
      else if (counts[id].findings === before.get(id) && counts[id].skipped === skippedBefore.get(id) && !hasExclusion) counts[id].noFinding++;
    }
  }
  if (enabled('P01')) for (const opener of stack) {
    if (plan.scope === 'whole' && !gap && !opener.uncertain) emit('P01', opener.block, opener.from, opener.to, '在完整全书边界内未找到对应闭符。');
    else counts.P01.skipped++;
  }
  await checkpoint();
  // Block order by a precomputed index: a lookup per comparison would hold the event loop on a dense whole Book.
  const order = new Map(plan.blocks.map((block, index) => [block.blockId, index]));
  candidates.sort((a, b) => order.get(a.blockId)! - order.get(b.blockId)! || a.from - b.from || a.ruleId.localeCompare(b.ruleId));
  return { schema: 'ai7.review.local-result/1', planDigest: plan.digest, paragraphs: plan.blocks.length, candidates, excluded, counts };
}

export function localCandidateNote(candidate: LocalCandidate): string {
  const rule = LOCAL_RULES[candidate.ruleId];
  return `${candidate.basis === 'editor-convention' ? '编辑约定' : '有限条款检查'} · ${candidate.ruleId}/v${candidate.version} · ${rule.title}。${candidate.observation} 依据：${rule.edition} ${rule.clauses}（${rule.url}）。局限：${rule.limitation} 专业或元语言用法可能误报；仅供编辑复核。`;
}
