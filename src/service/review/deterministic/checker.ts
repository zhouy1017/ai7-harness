import { setImmediate } from 'node:timers/promises';
import { BLOCK_ID_PATTERN, canonicalJson, DIGEST_PATTERN, hasExactKeys, isRecord, sha256Hex, UUID_PATTERN } from '../../analysis/canonical.js';
import { graphemeCount, sliceGraphemes } from '../../analysis/factual-review-contract.js';
import { LocalCheckError, numeralBasis, validateLocalPlan, validateLocalPlanV2, type LocalCheckBlock, type LocalCheckPlan, type LocalCheckPlanV2 } from './plan.js';
import { HOUSE_RULE, LOCAL_RULE_IDS, LOCAL_RULE_IDS_V2, LOCAL_RULES, type LocalRuleId, type LocalRuleIdV2 } from './rules.js';
import { houseAnnotationDetail, type HouseWordListPin } from '../../../shared/protocol/house-word-list.js';

export interface LocalCandidate {
  readonly id: string; readonly ruleId: LocalRuleId; readonly version: 1;
  readonly blockId: string; readonly from: number; readonly to: number; readonly quote: string;
  readonly observation: string; readonly basis: 'national-standard' | 'editor-convention';
}
export interface HouseCandidate extends Omit<LocalCandidate, 'ruleId' | 'basis'> {
  readonly ruleId: 'H01'; readonly basis: 'house-word-list'; readonly houseWordList: HouseWordListPin; readonly entryId: string;
}
export type LocalCandidateV2 = LocalCandidate | HouseCandidate;
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
export interface LocalCheckResultV2 extends Omit<LocalCheckResult, 'schema' | 'candidates' | 'counts'> {
  readonly schema: 'ai7.review.local-result/2'; readonly candidates: readonly LocalCandidateV2[];
  readonly counts: Readonly<Record<LocalRuleIdV2, LocalRuleCounts>>;
}
export interface LocalCheckExecutionOptions {
  readonly cancelled?: () => boolean;
  readonly checkpoint?: (phase: 'scan' | 'matches') => Promise<void>;
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
export function candidateHasExactAnchor(plan: LocalCheckPlan | LocalCheckPlanV2, candidate: LocalCandidateV2, graphemes?: readonly string[],
  block: LocalCheckBlock | undefined = plan.blocks.find((frozen) => frozen.blockId === candidate.blockId)): boolean {
  if (plan.schema === 'ai7.review.local-plan/2') validateLocalPlanV2(plan);
  return candidateHasFrozenAnchor(plan, candidate, graphemes, block);
}
function houseCandidateId(plan: LocalCheckPlanV2, entryId: string, blockId: string, from: number, to: number): string {
  return sha256Hex(canonicalJson({ source: plan.source, planDigest: plan.digest, houseWordList: plan.houseWordList.pin,
    rule: 'H01', version: 1, entryId, blockId, from, to }));
}
function candidateHasFrozenAnchor(plan: LocalCheckPlan | LocalCheckPlanV2, candidate: LocalCandidateV2, graphemes?: readonly string[],
  block: LocalCheckBlock | undefined = plan.blocks.find((frozen) => frozen.blockId === candidate.blockId)): boolean {
  if (candidate.ruleId === 'H01') {
    if (plan.schema !== 'ai7.review.local-plan/2') return false;
    const entry = plan.houseWordList.document.entries.find((entry) => entry.entryId === candidate.entryId);
    return candidate.basis === 'house-word-list' && candidate.version === 1 && entry?.enabled === true && candidate.quote === entry.literal &&
      canonicalJson(candidate.houseWordList) === canonicalJson(plan.houseWordList.pin) &&
      candidate.id === houseCandidateId(plan, candidate.entryId, candidate.blockId, candidate.from, candidate.to) &&
      block !== undefined && block.blockId === candidate.blockId && Number.isSafeInteger(candidate.from) && Number.isSafeInteger(candidate.to) &&
      candidate.from >= 0 && candidate.to > candidate.from && candidate.to <= (graphemes?.length ?? graphemeCount(block.text)) &&
      (graphemes === undefined ? sliceGraphemes(block.text, candidate.from, candidate.to) : graphemes.slice(candidate.from, candidate.to).join('')) === entry.literal;
  }
  const basis = numeralBasis(plan.options);
  const enabled = candidate.ruleId.startsWith('P') ? plan.options.punctuation === 'chinese-prose' && candidate.basis === 'national-standard'
    : (basis === 'national-standard' || basis === 'editor-convention') && candidate.basis === basis && plan.options.numeralRules.some((id) => id === candidate.ruleId);
  const expectedId = sha256Hex(canonicalJson({ source: plan.source, rule: candidate.ruleId, version: 1, blockId: candidate.blockId, from: candidate.from, to: candidate.to }));
  return enabled && candidate.version === 1 && candidate.id === expectedId && block !== undefined && block.blockId === candidate.blockId && Number.isSafeInteger(candidate.from) && Number.isSafeInteger(candidate.to) && candidate.from >= 0 && candidate.to > candidate.from &&
    candidate.quote.length > 0 && candidate.to <= (graphemes?.length ?? graphemeCount(block.text)) &&
    (graphemes === undefined ? sliceGraphemes(block.text, candidate.from, candidate.to) : graphemes.slice(candidate.from, candidate.to).join('')) === candidate.quote;
}

/** Materialization validates each frozen block once, including repeated-text candidates with known offsets. */
export function exactLocalCandidateIds(plan: LocalCheckPlan | LocalCheckPlanV2, candidates: readonly LocalCandidateV2[]): ReadonlySet<string> {
  if (plan.schema === 'ai7.review.local-plan/2') validateLocalPlanV2(plan); else validateLocalPlan(plan);
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
    if (candidateHasFrozenAnchor(plan, candidate, graphemes, block)) valid.add(candidate.id);
  }
  return valid;
}

/** One pass over frozen paragraphs, with cooperative yields within large paragraphs as well as between them. */
export function checkLocalPlan(plan: LocalCheckPlan, options?: LocalCheckExecutionOptions): Promise<LocalCheckResult>;
export function checkLocalPlan(plan: LocalCheckPlanV2, options?: LocalCheckExecutionOptions): Promise<LocalCheckResultV2>;
export async function checkLocalPlan(plan: LocalCheckPlan | LocalCheckPlanV2, options: LocalCheckExecutionOptions = {}): Promise<LocalCheckResult | LocalCheckResultV2> {
  if (plan.schema === 'ai7.review.local-plan/2') validateLocalPlanV2(plan); else validateLocalPlan(plan);
  const house = plan.schema === 'ai7.review.local-plan/2' ? plan : null;
  const checkpoint = async (phase: 'scan' | 'matches' = 'scan'): Promise<void> => {
    if (options.cancelled?.()) throw new LocalCheckError('LOCAL_CHECK_CANCELLED', '本地检查已取消。');
    await (options.checkpoint?.(phase) ?? setImmediate());
    if (options.cancelled?.()) throw new LocalCheckError('LOCAL_CHECK_CANCELLED', '本地检查已取消。');
  };
  const counts = { P01: emptyCounts(), P02: emptyCounts(), P03: emptyCounts(), N01: emptyCounts(), N02: emptyCounts(), H01: emptyCounts() };
  const candidates: LocalCandidateV2[] = [];
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
    if (!candidateHasFrozenAnchor(plan, candidate, parts, block)) {
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
    if (house !== null) {
      counts.H01.checked++; if (hasExclusion) counts.H01.exempt++;
      const before = { ...counts.H01 }; let matches = 0; let work = 0;
      for (const entry of house.houseWordList.document.entries) {
        if (++work % 16 === 0) await checkpoint('matches');
        if (!entry.enabled) continue;
        // Search bounded overlapping windows, retaining every occurrence and yielding even on a huge no-hit paragraph.
        for (let window = 0; window < block.text.length; window += 16384) {
          if (++work % 16 === 0) await checkpoint('matches');
          const end = Math.min(block.text.length, window + 16384);
          const text = block.text.slice(window, end + entry.literal.length - 1);
          let offset = text.indexOf(entry.literal);
          while (offset >= 0 && window + offset < end) {
            if (++matches % 512 === 0) await checkpoint('matches');
            const from = indexAt.get(window + offset); const to = indexAt.get(window + offset + entry.literal.length);
            if (from === undefined || to === undefined || !exact(from, to)) counts.H01.skipped++;
            else {
              const candidate: HouseCandidate = { id: houseCandidateId(house, entry.entryId, block.blockId, from, to), ruleId: 'H01', version: 1,
                blockId: block.blockId, from, to, quote: entry.literal, observation: HOUSE_RULE.title, basis: 'house-word-list',
                houseWordList: house.houseWordList.pin, entryId: entry.entryId };
              if (candidates.length >= 10000) {
                counts.H01.error++;
                if (excluded.length < 256) excluded.push({ candidateId: candidate.id, reason: 'local-result-limit' });
              } else if (!candidateHasFrozenAnchor(house, candidate, graphemes, block)) {
                counts.H01.error++;
                if (excluded.length < 256) excluded.push({ candidateId: candidate.id, reason: 'exact-grapheme-anchor-invalid' });
              } else { candidates.push(candidate); counts.H01.findings++; }
            }
            offset = text.indexOf(entry.literal, offset + 1);
          }
        }
      }
      if (matches === 0) counts.H01.notRecognized++;
      if (counts.H01.findings === before.findings && counts.H01.skipped === before.skipped && counts.H01.error === before.error && !hasExclusion) counts.H01.noFinding++;
    }
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
  const entryOrder = new Map(house?.houseWordList.document.entries.map((entry, index) => [entry.entryId, index]) ?? []);
  candidates.sort((a, b) => order.get(a.blockId)! - order.get(b.blockId)! || a.from - b.from || a.ruleId.localeCompare(b.ruleId) ||
    (a.ruleId === 'H01' && b.ruleId === 'H01' ? entryOrder.get(a.entryId)! - entryOrder.get(b.entryId)! : 0));
  if (house !== null) return { schema: 'ai7.review.local-result/2', planDigest: plan.digest, paragraphs: plan.blocks.length, candidates, excluded, counts };
  return { schema: 'ai7.review.local-result/1', planDigest: plan.digest, paragraphs: plan.blocks.length,
    candidates: candidates.filter((candidate) => candidate.ruleId !== 'H01'), excluded,
    counts: { P01: counts.P01, P02: counts.P02, P03: counts.P03, N01: counts.N01, N02: counts.N02 } };
}

export function localCandidateNote(candidate: LocalCandidate): string {
  const rule = LOCAL_RULES[candidate.ruleId];
  return `${candidate.basis === 'editor-convention' ? '编辑约定' : '有限条款检查'} · ${candidate.ruleId}/v${candidate.version} · ${rule.title}。${candidate.observation} 依据：${rule.edition} ${rule.clauses}（${rule.url}）。局限：${rule.limitation} 专业或元语言用法可能误报；仅供编辑复核。`;
}

export function houseCandidateNote(plan: LocalCheckPlanV2, candidate: HouseCandidate): string {
  validateLocalPlanV2(plan);
  if (!candidateHasFrozenAnchor(plan, candidate)) throw new LocalCheckError('LOCAL_ANCHOR_INVALID', '词条命中位置与冻结来源不一致。');
  const entry = plan.houseWordList.document.entries.find((entry) => entry.entryId === candidate.entryId)!;
  return houseAnnotationDetail(entry, { pin: plan.houseWordList.pin, ordinal: plan.houseWordList.document.ordinal });
}

function requireV2(value: unknown): asserts value {
  if (!value) throw new LocalCheckError('LOCAL_RECORD_INVALID', '本地词表工序结果或摘要链无效。');
}
/** Structural validation preserves the per-candidate exact-anchor exclusion at materialization. */
export function validateLocalResultV2(value: unknown, plan: LocalCheckPlanV2): asserts value is LocalCheckResultV2 {
  validateLocalPlanV2(plan);
  requireV2(isRecord(value) && hasExactKeys(value, ['schema', 'planDigest', 'paragraphs', 'candidates', 'excluded', 'counts']) &&
    value.schema === 'ai7.review.local-result/2' && value.planDigest === plan.digest && value.paragraphs === plan.blocks.length &&
    Array.isArray(value.candidates) && value.candidates.length <= 10000 && Array.isArray(value.excluded) && value.excluded.length <= 256 &&
    isRecord(value.counts) && hasExactKeys(value.counts, [...LOCAL_RULE_IDS_V2]));
  const ids = new Set<string>(); const findings = { P01: 0, P02: 0, P03: 0, N01: 0, N02: 0, H01: 0 };
  for (const candidate of value.candidates) {
    requireV2(isRecord(candidate));
    const fields = ['id', 'ruleId', 'version', 'blockId', 'from', 'to', 'quote', 'observation', 'basis'];
    requireV2(hasExactKeys(candidate, candidate.ruleId === 'H01' ? [...fields, 'houseWordList', 'entryId'] : fields) &&
      typeof candidate.id === 'string' && DIGEST_PATTERN.test(candidate.id) && !ids.has(candidate.id) && candidate.version === 1 &&
      typeof candidate.blockId === 'string' && BLOCK_ID_PATTERN.test(candidate.blockId) && Number.isSafeInteger(candidate.from) && Number.isSafeInteger(candidate.to) && Number(candidate.from) >= 0 && Number(candidate.to) > Number(candidate.from) &&
      typeof candidate.quote === 'string' && candidate.quote.length > 0 && candidate.quote.length <= 65536 && candidate.quote.isWellFormed() &&
      typeof candidate.observation === 'string' && candidate.observation.length <= 500 && candidate.observation.isWellFormed());
    if (candidate.ruleId === 'H01') {
      requireV2(candidate.basis === 'house-word-list' && candidate.observation === HOUSE_RULE.title && typeof candidate.entryId === 'string' && UUID_PATTERN.test(candidate.entryId) &&
        canonicalJson(candidate.houseWordList) === canonicalJson(plan.houseWordList.pin));
      findings.H01++;
    } else {
      requireV2(candidate.ruleId === 'P01' || candidate.ruleId === 'P02' || candidate.ruleId === 'P03' || candidate.ruleId === 'N01' || candidate.ruleId === 'N02');
      requireV2(candidate.basis === 'national-standard' || candidate.basis === 'editor-convention'); findings[candidate.ruleId]++;
    }
    ids.add(candidate.id);
  }
  for (const id of LOCAL_RULE_IDS_V2) {
    const count = value.counts[id];
    requireV2(isRecord(count) && hasExactKeys(count, ['checked', 'exempt', 'skipped', 'error', 'findings', 'disabled', 'outOfApplicability', 'notRecognized', 'noFinding']) &&
      Object.values(count).every((number) => Number.isSafeInteger(number) && Number(number) >= 0) && count.findings === findings[id]);
  }
  for (const exclusion of value.excluded) requireV2(isRecord(exclusion) && hasExactKeys(exclusion, ['candidateId', 'reason']) &&
    typeof exclusion.candidateId === 'string' && DIGEST_PATTERN.test(exclusion.candidateId) && (exclusion.reason === 'local-result-limit' || exclusion.reason === 'exact-grapheme-anchor-invalid'));
}

export interface LocalStageArtifactV2 {
  readonly schema: 'ai7.review.local-stage-artifact/2'; readonly reviewRunId: string; readonly categoryId: 'local-text-check';
  readonly sequence: number; readonly attemptId: string;
  readonly state: 'started' | 'completed' | 'materialized' | 'interrupted' | 'cancelled' | 'failed' | 'refused';
  readonly planDigest: string; readonly procedure: LocalCheckPlanV2['procedure']; readonly source: LocalCheckPlanV2['source'];
  readonly plan: LocalCheckPlanV2; readonly previousDigest: string | null; readonly recordedAt: string;
  readonly result: LocalCheckResultV2 | null; readonly detail: string;
}
/** Pure unselected artifact contract. No ReviewRun table, lifecycle or materialization is activated here. */
export function validateLocalStageArtifactV2(value: unknown, plan: LocalCheckPlanV2,
  previous?: { readonly record: LocalStageArtifactV2; readonly digest: string }): asserts value is LocalStageArtifactV2 {
  validateLocalPlanV2(plan);
  requireV2(isRecord(value) && hasExactKeys(value, ['schema', 'reviewRunId', 'categoryId', 'sequence', 'attemptId', 'state', 'planDigest', 'procedure', 'source', 'plan', 'previousDigest', 'recordedAt', 'result', 'detail']) &&
    value.schema === 'ai7.review.local-stage-artifact/2' && value.categoryId === 'local-text-check' && typeof value.reviewRunId === 'string' && UUID_PATTERN.test(value.reviewRunId) &&
    typeof value.attemptId === 'string' && UUID_PATTERN.test(value.attemptId) && value.sequence === (previous?.record.sequence ?? 0) + 1 &&
    value.previousDigest === (previous?.digest ?? null) && value.planDigest === plan.digest && canonicalJson(value.plan) === canonicalJson(plan) &&
    canonicalJson(value.procedure) === canonicalJson(plan.procedure) && canonicalJson(value.source) === canonicalJson(plan.source) &&
    typeof value.recordedAt === 'string' && Number.isFinite(Date.parse(value.recordedAt)) && new Date(value.recordedAt).toISOString() === value.recordedAt &&
    typeof value.detail === 'string' && value.detail.isWellFormed() && value.detail.length <= 2000 &&
    ['started', 'completed', 'materialized', 'interrupted', 'cancelled', 'failed', 'refused'].includes(String(value.state)));
  if (previous !== undefined) requireV2(previous.digest === sha256Hex(canonicalJson(previous.record)) && previous.record.reviewRunId === value.reviewRunId && previous.record.planDigest === plan.digest);
  const last = previous?.record.state;
  const follows = value.state === 'started' ? previous === undefined || last === 'interrupted'
    : value.state === 'materialized' ? last === 'completed'
      : value.state === 'completed' || value.state === 'interrupted' ? last === 'started'
        : previous === undefined || last === 'started' || last === 'interrupted' || last === 'completed';
  requireV2(follows);
  if (previous !== undefined) requireV2(value.state === 'started' ? value.attemptId !== previous.record.attemptId : value.attemptId === previous.record.attemptId);
  if (value.state === 'completed' || value.state === 'materialized') {
    validateLocalResultV2(value.result, plan);
    if (value.state === 'materialized') requireV2(canonicalJson(value.result) === canonicalJson(previous?.record.result));
  } else requireV2(value.result === null);
}
