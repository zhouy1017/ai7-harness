import {
  RESEARCH_EVIDENCE_STALE_AFTER_DAYS,
  SOURCE_TRANSLATION_LABEL,
  type FactualAssertionCategory,
  type ResearchEvidenceAlignment,
  type ResearchEvidenceAnchor,
  type ResearchEvidenceCaptureState,
  type ResearchEvidenceQueryClass,
  type ResearchEvidenceTranslation,
  type ResearchEvidenceUnitState,
} from '../../shared/protocol.js';
import { htmlToMarkdown } from '../provider/html-to-markdown.js';
import { declaredCharset, decodeInCharset } from '../provider/public-source-fetch.js';
import type { ResearchSnapshot } from '../provider/research-snapshot-cache.js';
import { sha256Hex } from './canonical.js';

/**
 * The External Evidence Retention Procedure (Issue #425, plan slice S70; V2-UX-SRC-013, EGR-003, ADR 0079 §3): what a research
 * unit of 事实核查 keeps of the public sources its model used. Pure: it reads the unit's located findings and the captures its
 * platform tools brought back, asks the caller for at most one retention fetch per cited page it has no page of, and returns
 * the records the ledger keeps. It sends nothing itself, judges no claim, and never turns model knowledge into evidence
 * (FACT-009): a citation is a URL or a source name the model wrote in a finding's basis, and its alignment is a fact about the
 * captured text — whether the words it names are there — never a verdict on the manuscript.
 *
 * Offsets are UTF-16 code units of the captured text, as the source view slices it.
 */
export const RESEARCH_EVIDENCE_RECORD_SCHEMA = 'ai7.research-evidence/1' as const;
export const RESEARCH_EVIDENCE_UNIT_SCHEMA = 'ai7.research-evidence-unit/1' as const;
/** The shortest run of folded characters an anchor may stand on: two-character overlaps match almost any Chinese page. */
export const MIN_ANCHOR_CHARACTERS = 4;
/** The bound on the captured sentences a record carries for display and translation. */
export const MAX_PASSAGE_CHARACTERS = 600;
const DAY_MS = 86_400_000;

// ---- Folding ----------------------------------------------------------------------------------------------------------

interface FoldedText {
  readonly text: string;
  /** For each folded character, the [from, to) UTF-16 range of the original it came from. */
  readonly from: readonly number[];
  readonly to: readonly number[];
}

/** Quotation marks and brackets that a citation and its source spell differently and that carry no words. */
const IGNORED = /[\s"'“”‘’「」『』《》〈〉【】（）()­​-‍﻿*_`#>]/u;

/**
 * Fold for matching: compatibility-normalized (full-width digits, letters and punctuation fold to their ordinary forms),
 * lower-cased, and without whitespace, quotation marks, brackets or Markdown emphasis — so a citation that quotes 「一九七八年」
 * matches the page's “一九七八年”, and a sentence broken across lines still matches as one.
 */
function fold(text: string): FoldedText {
  const out: string[] = [];
  const from: number[] = [];
  const to: number[] = [];
  let index = 0;
  for (const character of text) {
    const start = index;
    index += character.length;
    if (IGNORED.test(character)) continue;
    for (const folded of character.normalize('NFKC').toLowerCase()) {
      if (IGNORED.test(folded)) continue;
      out.push(folded);
      // String matching indexes UTF-16 code units, including both halves of an astral character.
      for (let unit = 0; unit < folded.length; unit += 1) {
        from.push(start);
        to.push(index);
      }
    }
  }
  return { text: out.join(''), from, to };
}

// ---- Sentences --------------------------------------------------------------------------------------------------------

const SENTENCE_END = new Set(['。', '！', '？', '!', '?', '；', ';', '…']);
const CLOSERS = new Set(['”', '’', '」', '』', '）', ')', '》', '"', "'", ']', '】']);

/** The captured text's sentences, as [from, to) ranges in order: Chinese and Latin enders, closing quotes kept, blank lines. */
export function evidenceSentences(text: string): Array<{ from: number; to: number }> {
  const sentences: Array<{ from: number; to: number }> = [];
  let start = 0;
  const push = (end: number): void => {
    let from = start;
    let to = end;
    while (from < to && /\s/u.test(text[from]!)) from += 1;
    while (to > from && /\s/u.test(text[to - 1]!)) to -= 1;
    if (to > from) sentences.push({ from, to });
    start = end;
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '\n') {
      push(index + 1);
      continue;
    }
    const latinStop = character === '.' && (index + 1 === text.length || /\s/u.test(text[index + 1]!)) && index > 0 && /[\p{L}\p{N})"'”]/u.test(text[index - 1]!);
    if (SENTENCE_END.has(character) || latinStop) {
      let end = index + 1;
      while (end < text.length && (CLOSERS.has(text[end]!) || SENTENCE_END.has(text[end]!))) end += 1;
      push(end);
      index = end - 1;
    }
  }
  push(text.length);
  return sentences;
}

function sentenceOrdinal(sentences: ReadonlyArray<{ from: number; to: number }>, offset: number): number {
  for (let index = 0; index < sentences.length; index += 1) {
    if (offset < sentences[index]!.to) return index + 1;
  }
  return Math.max(1, sentences.length);
}

// ---- Alignment --------------------------------------------------------------------------------------------------------

export interface EvidenceAlignment {
  readonly alignment: ResearchEvidenceAlignment;
  readonly anchors: ReadonlyArray<ResearchEvidenceAnchor>;
  /** The share of the claim's folded characters the anchors cover, 0 to 1. */
  readonly coverage: number;
}

const PIECE_BREAK = /[，,、。；;：:！!？?…—–\-\/|·•]+/u;
const UNALIGNED: EvidenceAlignment = Object.freeze({ alignment: 'unaligned', anchors: Object.freeze([]), coverage: 0 });

/** A suffix automaton of the short claim scans the whole bounded page once, without a page-length × claim-length loop. */
function longestCommon(claim: string, text: string): { start: number; length: number } {
  const states: Array<{ length: number; link: number; next: Map<string, number> }> = [{ length: 0, link: -1, next: new Map() }];
  let last = 0;
  for (let index = 0; index < claim.length; index += 1) {
    const character = claim[index]!;
    const current = states.length;
    states.push({ length: states[last]!.length + 1, link: 0, next: new Map() });
    let previous = last;
    while (previous !== -1 && !states[previous]!.next.has(character)) {
      states[previous]!.next.set(character, current);
      previous = states[previous]!.link;
    }
    if (previous !== -1) {
      const target = states[previous]!.next.get(character)!;
      if (states[previous]!.length + 1 === states[target]!.length) states[current]!.link = target;
      else {
        const clone = states.length;
        states.push({ length: states[previous]!.length + 1, link: states[target]!.link, next: new Map(states[target]!.next) });
        while (previous !== -1 && states[previous]!.next.get(character) === target) {
          states[previous]!.next.set(character, clone);
          previous = states[previous]!.link;
        }
        states[target]!.link = clone;
        states[current]!.link = clone;
      }
    }
    last = current;
  }
  let best = { start: 0, length: 0 };
  let state = 0;
  let length = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    while (state !== 0 && !states[state]!.next.has(character)) {
      state = states[state]!.link;
      length = states[state]!.length;
    }
    const next = states[state]!.next.get(character);
    if (next === undefined) { state = 0; length = 0; continue; }
    state = next;
    length += 1;
    if (length > best.length) best = { start: index - length + 1, length };
  }
  return best;
}

/**
 * Align a citation's words against the captured text. `对应` when every piece of it is there; `部分对应` when at least one
 * piece of four folded characters or more is — or, for a claim that does not break into pieces, a common run of at least half
 * of it; `未能对应` otherwise, and always for a claim too short to stand on. Each anchor names the first place its piece occurs
 * and the sentence that place starts in.
 */
export function alignCitation(claims: ReadonlyArray<string>, captured: string): EvidenceAlignment {
  const haystack = fold(captured);
  const sentences = evidenceSentences(captured);
  const anchor = (start: number, length: number): ResearchEvidenceAnchor => {
    const from = haystack.from[start]!;
    return { from, to: haystack.to[start + length - 1]!, sentence: sentenceOrdinal(sentences, from) };
  };
  const wholes = claims.map((claim) => fold(claim).text).filter((claim) => claim.length >= 2);
  if (wholes.length === 0 || haystack.text.length === 0) return UNALIGNED;
  const total = wholes.reduce((sum, claim) => sum + claim.length, 0);
  const anchors: ResearchEvidenceAnchor[] = [];
  let covered = 0;
  let whole = true;
  for (const claim of wholes) {
    const at = haystack.text.indexOf(claim);
    if (at !== -1) {
      anchors.push(anchor(at, claim.length));
      covered += claim.length;
      continue;
    }
    whole = false;
    const pieces = claims.flatMap((raw) => raw.split(PIECE_BREAK)).map((piece) => fold(piece).text)
      .filter((piece) => piece.length >= MIN_ANCHOR_CHARACTERS && claim.includes(piece));
    let found = false;
    for (const piece of pieces) {
      const pieceAt = haystack.text.indexOf(piece);
      if (pieceAt === -1) continue;
      anchors.push(anchor(pieceAt, piece.length));
      covered += piece.length;
      found = true;
    }
    if (!found) {
      const common = longestCommon(claim, haystack.text);
      if (common.length >= Math.max(MIN_ANCHOR_CHARACTERS, Math.ceil(claim.length / 2))) {
        anchors.push(anchor(common.start, common.length));
        covered += common.length;
      }
    }
  }
  if (anchors.length === 0) return UNALIGNED;
  anchors.sort((left, right) => left.from - right.from || left.to - right.to);
  return { alignment: whole ? 'aligned' : 'partial', anchors, coverage: Math.min(1, covered / total) };
}

/** The captured sentences the anchors fall in, or the beginning when unaligned; the original stays visible in either case. */
export function evidencePassage(captured: string, anchors: ReadonlyArray<ResearchEvidenceAnchor>): string | null {
  if (anchors.length === 0) return captured.slice(0, MAX_PASSAGE_CHARACTERS) || null;
  const sentences = evidenceSentences(captured);
  const ordinals = [...new Set(anchors.map((entry) => entry.sentence))].sort((left, right) => left - right);
  const text = ordinals.map((ordinal) => sentences[ordinal - 1]).filter((sentence) => sentence !== undefined)
    .map((sentence) => captured.slice(sentence!.from, sentence!.to)).join(' … ');
  return text.length <= MAX_PASSAGE_CHARACTERS ? text : `${[...text].slice(0, MAX_PASSAGE_CHARACTERS).join('')}…`;
}

// ---- Citations --------------------------------------------------------------------------------------------------------

/** One source a research unit's tools brought back: a search result, or a page the model fetched. */
export interface UnitResearchSource {
  readonly url: string;
  readonly title: string | null;
  /** The excerpt the search returned with it, when the backend returned one. */
  readonly snippet: string | null;
  readonly via: 'search' | 'fetch';
  readonly capturedAt?: string;
  readonly snapshotDigest?: string;
}

/** A located finding of the unit, as the reducer will record it. */
export interface UnitResearchFinding {
  readonly findingId: string;
  readonly blockId: string;
  readonly quote: string;
  readonly basis: string;
  readonly category: FactualAssertionCategory;
}

export interface EvidenceCitation {
  readonly findingId: string | null;
  readonly queryClass: ResearchEvidenceQueryClass;
  readonly url: string;
  readonly claim: { readonly text: string; readonly origin: 'basis-quotation' | 'finding-quote' } | null;
  readonly claimPieces: ReadonlyArray<string>;
}

const QUOTED = /[「“『"]([^」”』"]{2,200})[」”』"]/gu;
const LABEL_BREAK = /\s[-–—|｜_]\s|[|｜_]/u;

/** Every absolute `https` address in a text, with trailing sentence punctuation trimmed by one backward walk. */
export function httpsAddresses(text: string): string[] {
  return [...text.matchAll(/https:\/\/[^\s<>"'()[\]{}，。；、）》」”]+/gu)].map((match) => {
    let end = match[0].length;
    while (end > 0 && '.,;:!?'.includes(match[0][end - 1]!)) end -= 1;
    return match[0].slice(0, end);
  });
}

/** The site a result's title names after its separator — 「…… - 维基百科」 names 维基百科 — or `null`. */
export function titleSiteLabel(title: string | null): string | null {
  if (title === null) return null;
  const parts = title.split(LABEL_BREAK).map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length < 2) return null;
  const label = parts[parts.length - 1]!;
  return label.length >= 2 && label.length <= 24 ? label : null;
}

function addressKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url;
  }
}

/**
 * The citations of a research unit. A finding cites a source when its basis names the source's address, its host, or the site
 * its title names; the words the alignment looks for are the quotations in the basis, else the finding's own quotation — what
 * the manuscript says, which a supporting source would state. A page the model fetched that no finding names is still a source
 * the unit used (SRC-013), kept without a finding. A basis address the unit's tools never returned is cited all the same: AI7
 * fetches what the model cites (ADR 0079 §3), and a page it cannot get is reported as not retrieved.
 */
export function evidenceCitations(findings: ReadonlyArray<UnitResearchFinding>, sources: ReadonlyArray<UnitResearchSource>): EvidenceCitation[] {
  const citations: EvidenceCitation[] = [];
  const named = new Set<string>();
  for (const finding of findings) {
    const basis = finding.basis;
    const urls = new Set<string>();
    for (const address of httpsAddresses(basis)) urls.add(addressKey(address));
    // A precise URL must not also cite every other result from its host. A site name alone can identify a page only when
    // that site contributed exactly one result; otherwise no exact source has been named.
    const namedText = basis.replace(/https:\/\/[^\s<>"'()[\]{}，。；、）》」”]+/gu, '');
    for (const source of sources) {
      let host: string | null = null;
      try { host = new URL(source.url).hostname; } catch { host = null; }
      const label = titleSiteLabel(source.title);
      const peers = sources.filter((other) => {
        try { return (host !== null && new URL(other.url).hostname === host) || (label !== null && titleSiteLabel(other.title) === label); }
        catch { return false; }
      });
      if (source.title !== null && source.title.length >= 4 && namedText.includes(source.title)) urls.add(addressKey(source.url));
      else if (new Set(peers.map((other) => addressKey(other.url))).size === 1 &&
        ((host !== null && namedText.includes(host)) || (label !== null && namedText.includes(label)))) urls.add(addressKey(source.url));
    }
    if (urls.size === 0) continue;
    const quoted = [...basis.matchAll(QUOTED)].map((match) => match[1]!.trim()).filter((text) => text.length > 0);
    const claim = quoted.length > 0 ? { text: quoted.join(' … '), origin: 'basis-quotation' as const } : { text: finding.quote, origin: 'finding-quote' as const };
    for (const url of [...urls].sort()) {
      named.add(url);
      citations.push({ findingId: finding.findingId, queryClass: finding.category, url, claim, claimPieces: quoted.length > 0 ? quoted : [finding.quote] });
    }
  }
  for (const source of sources) {
    const url = addressKey(source.url);
    if (source.via !== 'fetch' || named.has(url)) continue;
    named.add(url);
    citations.push({ findingId: null, queryClass: 'uncited', url, claim: null, claimPieces: [] });
  }
  return citations;
}

// ---- Staleness --------------------------------------------------------------------------------------------------------

/**
 * Whether a retained source may be out of date: older than the threshold (default 90 days), or captured again later under a
 * different content hash. Neither says the source is wrong; both say it should be read again before it is relied on.
 */
export function evidenceStaleness(input: {
  readonly capturedAt: string;
  readonly now: Date;
  readonly staleAfterDays?: number;
  readonly laterDifferentHash: boolean;
}): { state: 'current' | 'possibly-stale'; reasons: Array<'age' | 'hash-changed'> } {
  const days = input.staleAfterDays ?? RESEARCH_EVIDENCE_STALE_AFTER_DAYS;
  const reasons: Array<'age' | 'hash-changed'> = [];
  const captured = Date.parse(input.capturedAt);
  if (Number.isFinite(captured) && input.now.getTime() - captured > days * DAY_MS) reasons.push('age');
  if (input.laterDifferentHash) reasons.push('hash-changed');
  return { state: reasons.length === 0 ? 'current' : 'possibly-stale', reasons };
}

// ---- 来源译文 ---------------------------------------------------------------------------------------------------------

/** Whether a captured text is not Chinese: fewer than three Han characters in ten of its letters. */
export function needsSourceTranslation(text: string): boolean {
  let han = 0;
  let letters = 0;
  for (const character of text) {
    if (/\p{Script=Han}/u.test(character)) { han += 1; letters += 1; } else if (/\p{L}/u.test(character)) letters += 1;
  }
  return letters >= 8 && han / letters < 0.3;
}

/**
 * The rule a Run's 来源译文 answers to. A translation is a transmission of the source's words to the Run's own model, so it
 * is produced only under a rule that names it; of Provider Processing v18 and v19 only the research review rule does (`sourceTranslationAllowed`), and the absent field refuses.
 */
export interface SourceTranslationRule {
  readonly operationalScope: string;
  readonly sourceTranslationAllowed?: boolean;
}

export const SOURCE_TRANSLATION_NOT_ADMITTED = '当前准许规则没有列出来源译文这一步；未生成译文，只保留原文。' as const;
export const SOURCE_TRANSLATION_UNAVAILABLE = '本次运行没有可用的译文步骤；未生成译文，只保留原文。' as const;

/** The Run's own model translating one bounded passage; `null` when it gave no usable translation. */
export type SourceTranslator = (passage: { readonly text: string; readonly url: string }) => Promise<{ readonly text: string; readonly route: string; readonly model: string } | null>;

export function sourceTranslationAdmitted(rule: SourceTranslationRule | null): boolean {
  return rule !== null && rule.operationalScope === 'developer-live' && rule.sourceTranslationAllowed === true;
}

/**
 * The 来源译文 of one retained passage: `null` for a Chinese source, which needs none; a refusal — and no transmission — when
 * the rule does not admit it or the Run has no translator; else the translation, labelled machine translation and attributed
 * to the exact captured range and content hash it translates. The original is never replaced.
 */
export async function sourceTranslation(input: {
  readonly captured: string;
  readonly contentSha256: string;
  readonly url: string;
  readonly anchors: ReadonlyArray<ResearchEvidenceAnchor>;
  readonly rule: SourceTranslationRule | null;
  readonly translator: SourceTranslator | null;
}): Promise<ResearchEvidenceTranslation | null> {
  if (!needsSourceTranslation(input.captured)) return null;
  if (!sourceTranslationAdmitted(input.rule)) return { state: 'refused', reason: SOURCE_TRANSLATION_NOT_ADMITTED };
  if (input.translator === null) return { state: 'refused', reason: SOURCE_TRANSLATION_UNAVAILABLE };
  const sentences = evidenceSentences(input.captured);
  const range = input.anchors.length > 0
    ? { from: sentences[input.anchors[0]!.sentence - 1]?.from ?? 0, to: sentences[input.anchors[input.anchors.length - 1]!.sentence - 1]?.to ?? input.captured.length }
    : { from: sentences[0]?.from ?? 0, to: sentences[0]?.to ?? Math.min(input.captured.length, MAX_PASSAGE_CHARACTERS) };
  const to = Math.min(range.to, range.from + MAX_PASSAGE_CHARACTERS);
  const translated = await input.translator({ text: input.captured.slice(range.from, to), url: input.url });
  if (translated === null || translated.text.trim().length === 0) return { state: 'refused', reason: '模型没有给出可用的译文；只保留原文。' };
  return {
    state: 'translated', label: SOURCE_TRANSLATION_LABEL, machine: true, targetLanguage: 'zh-Hans',
    text: [...translated.text.trim()].slice(0, MAX_PASSAGE_CHARACTERS * 2).join(''), route: translated.route, model: translated.model,
    attribution: { url: input.url, contentSha256: input.contentSha256, from: range.from, to },
  };
}

// ---- The procedure ----------------------------------------------------------------------------------------------------

/** One page AI7 has of a cited source: the model's own fetch from the snapshot cache, or AI7's retention fetch. */
export interface RetainedPage {
  readonly url: string;
  readonly capturedAt: string;
  /** The page converted to text, whole (never the model's 25,000-character cut). */
  readonly text: string;
  readonly pageSha256: string;
  readonly snapshotDigest: string;
}

/** What retention asks for a cited page it has no page of: the page, or why it could not be had. */
export type RetentionFetch = (url: string) => Promise<RetainedPage | { readonly failed: string }>;

export interface RetainedEvidence {
  readonly findingId: string | null;
  readonly queryClass: ResearchEvidenceQueryClass;
  readonly url: string;
  readonly sourceTitle: string | null;
  readonly capturedAt: string;
  readonly captureState: ResearchEvidenceCaptureState;
  /** The captured text — the whole page, or the search's excerpt — or `null` when nothing was captured. */
  readonly content: string | null;
  readonly contentSha256: string | null;
  readonly pageSha256: string | null;
  readonly snapshotDigest: string | null;
  readonly claim: EvidenceCitation['claim'];
  readonly alignment: ResearchEvidenceAlignment;
  readonly anchors: ReadonlyArray<ResearchEvidenceAnchor>;
  readonly translation: ResearchEvidenceTranslation | null;
  readonly failure: string | null;
}

export interface RetainedUnit {
  readonly retentionFailure?: 'capture-processing' | 'storage';
  readonly state: ResearchEvidenceUnitState;
  readonly searchCalls: number;
  readonly retentionFetches: number;
  readonly failedRetrievals: number;
  readonly findings: ReadonlyArray<{ readonly findingId: string; readonly blockId: string; readonly quote: string; readonly category: FactualAssertionCategory; readonly sources: number }>;
  readonly evidence: ReadonlyArray<RetainedEvidence>;
}

// ---- Reading the Research Snapshot Cache ------------------------------------------------------------------------------

/** The identity of one Research Snapshot: the digest its cache entry is filed under (kind, origin, canonical arguments). */
export function researchSnapshotDigest(snapshot: Pick<ResearchSnapshot, 'kind' | 'origin' | 'argumentsDigest'>): string {
  return sha256Hex(JSON.stringify([snapshot.kind, snapshot.origin, snapshot.argumentsDigest]));
}

/**
 * A fetched page as retention keeps it: converted again from the snapshot's whole bytes — never the model's text, which is cut
 * at 25,000 characters — in the charset the response declared. `null` when nothing readable is there.
 */
export function retainedPageOf(snapshot: ResearchSnapshot): RetainedPage | null {
  if (snapshot.kind !== 'fetch' || snapshot.status !== 200) return null;
  const bytes = Buffer.from(snapshot.bodyBase64, 'base64');
  const decoded = decodeInCharset(bytes, declaredCharset(snapshot.contentType, bytes));
  const type = snapshot.contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  const html = type === 'text/html' || type === 'application/xhtml+xml' || (type === '' && /^\s*</u.test(decoded.text));
  const text = html ? htmlToMarkdown(decoded.text, snapshot.url) : decoded.text;
  if (text.trim().length === 0) return null;
  return { url: snapshot.url, capturedAt: snapshot.retrievedAt, text, pageSha256: snapshot.responseDigest, snapshotDigest: researchSnapshotDigest(snapshot) };
}

/** The results one search answer named, as the model read them: address, title and excerpt where the answer carried them. */
export function searchHitsOf(snapshot: ResearchSnapshot): UnitResearchSource[] {
  let parsed: unknown = null;
  try { parsed = JSON.parse(snapshot.text); } catch { parsed = null; }
  if (Array.isArray(parsed)) {
    return parsed.flatMap((hit): UnitResearchSource[] => {
      if (hit === null || typeof hit !== 'object' || typeof (hit as { url?: unknown }).url !== 'string') return [];
      const entry = hit as { url: string; title?: unknown; snippet?: unknown };
      if (!entry.url.startsWith('https://')) return [];
      return [{ url: entry.url, title: typeof entry.title === 'string' ? entry.title : null, snippet: typeof entry.snippet === 'string' ? entry.snippet : null, via: 'search',
        capturedAt: snapshot.retrievedAt, snapshotDigest: researchSnapshotDigest(snapshot) }];
    });
  }
  // A cut answer no longer parses: its addresses are still the ones the model read.
  return httpsAddresses(snapshot.text).map((url) => ({ url, title: null, snippet: null, via: 'search' as const }));
}

/**
 * Retain one research unit's evidence. Each distinct cited address is captured once: the unit's own fetched page if the model
 * read it, else — while `fetchAllowed` (the Run may still send) — one retention fetch, else the excerpt its search returned
 * (来源仅片段), else nothing (未能取回). Every citation is then aligned against what was captured, translated when its source
 * is not Chinese and the rule admits it, and recorded; a finding no source names is counted as unsupported.
 */
export async function retainUnitEvidence(input: {
  readonly findings: ReadonlyArray<UnitResearchFinding>;
  readonly sources: ReadonlyArray<UnitResearchSource>;
  readonly pages: ReadonlyMap<string, RetainedPage>;
  readonly searchSnapshotDigest: string | null;
  readonly searchState: ResearchEvidenceUnitState;
  readonly searchCalls: number;
  readonly fetchAllowed: boolean | (() => boolean);
  readonly fetch: RetentionFetch | null;
  readonly rule: SourceTranslationRule | null;
  readonly translator: SourceTranslator | null;
  readonly now: () => Date;
}): Promise<RetainedUnit> {
  const citations = evidenceCitations(input.findings, input.sources);
  const mayFetch = (): boolean => typeof input.fetchAllowed === 'function' ? input.fetchAllowed() : input.fetchAllowed;
  const captures = new Map<string, RetainedPage | { failed: string }>();
  for (const [url, page] of input.pages) captures.set(addressKey(url), page);
  let retentionFetches = 0;
  for (const url of new Set(citations.map((citation) => citation.url))) {
    if (captures.has(url)) continue;
    if (!mayFetch() || input.fetch === null) continue;
    retentionFetches += 1;
    try {
      captures.set(url, await input.fetch(url));
    } catch {
      captures.set(url, { failed: '取回失败；不重试。' });
    }
  }
  const evidence: RetainedEvidence[] = [];
  let failedRetrievals = 0;
  const failedUrls = new Set<string>();
  for (const citation of citations) {
    const capture = captures.get(citation.url);
    const hit = input.sources.find((source) => addressKey(source.url) === citation.url) ?? null;
    let captureState: ResearchEvidenceCaptureState;
    let content: string | null = null;
    let pageSha256: string | null = null;
    let snapshotDigest: string | null = null;
    let capturedAt = input.now().toISOString();
    let failure: string | null = null;
    if (capture !== undefined && 'text' in capture) {
      captureState = 'full-text';
      // The shared webfetch owner already enforces the byte bound; never label a second, truncated copy as full text.
      content = capture.text;
      pageSha256 = capture.pageSha256;
      snapshotDigest = capture.snapshotDigest;
      capturedAt = capture.capturedAt;
    } else {
      failure = capture === undefined ? mayFetch() ? '没有取回这个来源。' : '运行已停止发送；没有取回这个来源。' : capture.failed;
      const excerpt = hit?.snippet ?? null;
      if (excerpt !== null && excerpt.trim().length > 0) {
        captureState = 'snippet-only';
        content = excerpt;
        snapshotDigest = hit?.snapshotDigest ?? input.searchSnapshotDigest;
        capturedAt = hit?.capturedAt ?? capturedAt;
      } else {
        captureState = 'failed';
      }
      if (!failedUrls.has(citation.url)) { failedUrls.add(citation.url); failedRetrievals += 1; }
    }
    const contentSha256 = content === null ? null : sha256Hex(content);
    const aligned = content === null || citation.claimPieces.length === 0 ? UNALIGNED : alignCitation(citation.claimPieces, content);
    const translation = content === null || contentSha256 === null ? null : await sourceTranslation({
      captured: content, contentSha256, url: citation.url, anchors: aligned.anchors, rule: input.rule, translator: input.translator,
    });
    evidence.push({
      findingId: citation.findingId, queryClass: citation.queryClass, url: citation.url, sourceTitle: hit?.title ?? null, capturedAt,
      captureState, content, contentSha256, pageSha256, snapshotDigest, claim: citation.claim,
      alignment: aligned.alignment, anchors: aligned.anchors, translation, failure,
    });
  }
  const findings = input.findings.map((finding) => ({
    findingId: finding.findingId, blockId: finding.blockId, quote: finding.quote, category: finding.category,
    sources: evidence.filter((entry) => entry.findingId === finding.findingId && entry.captureState !== 'failed').length,
  }));
  return { state: input.searchState, searchCalls: input.searchCalls, retentionFetches, failedRetrievals, findings, evidence };
}

/** The canonical record of one retained source, as the ledger digests it. */
export function researchEvidenceRecord(input: {
  readonly evidenceId: string;
  readonly bookId: string;
  readonly runRecordId: string;
  readonly unitOrdinal: number;
  readonly backendId: string | null;
  readonly stalenessState: 'current' | 'hash-changed';
  readonly recordedAt: string;
  readonly evidence: RetainedEvidence;
}): Record<string, unknown> {
  const { evidence } = input;
  return {
    schema: RESEARCH_EVIDENCE_RECORD_SCHEMA,
    evidenceId: input.evidenceId,
    bookId: input.bookId,
    runRecordId: input.runRecordId,
    unitOrdinal: input.unitOrdinal,
    findingId: evidence.findingId,
    backendId: input.backendId,
    queryClass: evidence.queryClass,
    url: evidence.url,
    sourceTitle: evidence.sourceTitle,
    capturedAt: evidence.capturedAt,
    captureState: evidence.captureState,
    contentSha256: evidence.contentSha256,
    pageSha256: evidence.pageSha256,
    snapshotDigest: evidence.snapshotDigest,
    claim: evidence.claim,
    alignment: evidence.alignment,
    anchors: evidence.anchors,
    translation: evidence.translation,
    stalenessState: input.stalenessState,
    failure: evidence.failure,
    recordedAt: input.recordedAt,
  };
}
