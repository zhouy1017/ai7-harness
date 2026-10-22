import { canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { MATERIAL_TRANSLATION_LABEL } from '../../shared/protocol.js';
import { FastRoleError } from './fast-role-error.js';
import { MATERIAL_TRANSLATION_KIND } from '../launch-policy.js';
import type { FastRoleExecutionOwner, FastRoleProvenance } from './fast-role-execution.js';

/**
 * Material Translation Contract v1 (Issue #892; editor-surfaces §8.4, V2-UX-KB-009): the frozen text 生成来源译文 carries. One
 * request sends a bounded batch of one 资料库 item's paragraphs — at most {@link MATERIAL_TRANSLATION_BATCH_PARAGRAPHS}, at
 * most {@link MATERIAL_TRANSLATION_BATCH_CODE_UNITS} characters together — numbered, and nothing else of the item, of a Book
 * or of the house. The answer is one Chinese translation per paragraph, numbered the same way; an answer that does not align
 * one for one is not recorded at all. A translation is the machine's 来源译文: labelled, attributed to the paragraph it
 * translates, never in its place, never a quotation source.
 *
 * It is a Fast Interaction Role kind (`material-translation`): one bounded request per batch, no Run, through the Egress Gate
 * under the one rule of the selected policy that names it — the material's own words go out under the rule's category, the
 * public-or-synthetic category under developer-live, `frozen-material-reference-excerpt` under ordinary production. A policy
 * that names no such rule admits nothing: 「当前策略未开放来源译文」.
 *
 * The contract is frozen text; its digest binds every request, so changing one character of it changes every request digest.
 */
export { MATERIAL_TRANSLATION_KIND };
export const MATERIAL_TRANSLATION_PROMPT_CONTRACT_SCHEMA = 'ai7.material-translation-prompt-contract/1' as const;
export const MATERIAL_TRANSLATION_CONTRACT_VERSION = 'ai7.material-translation/1' as const;
export const MATERIAL_TRANSLATION_RESULT_SCHEMA = 'ai7.material-translation.result/1' as const;
/** The paragraphs one request sends at most, and their characters together. */
export const MATERIAL_TRANSLATION_BATCH_PARAGRAPHS = 20;
export const MATERIAL_TRANSLATION_BATCH_CODE_UNITS = 6_000;
/**
 * The requests one 生成来源译文 sends at most (Issue #892, brief revision 5): 50 batches, so at most 1,000 paragraphs; an item
 * with more stops there, says how many remain, and the editor asks again for the rest.
 */
export const MAX_MATERIAL_TRANSLATION_REQUESTS = 50;
/** The longest one translation may be, in characters: a translation longer than this is not one paragraph's. */
export const MAX_MATERIAL_TRANSLATION_CODE_UNITS = 20_000;
/** What 生成来源译文 says when the selected policy names no rule for it. */
export const MATERIAL_TRANSLATION_NOT_ADMITTED = '当前策略未开放来源译文';

export const MATERIAL_TRANSLATION_PROMPT_CONTRACT = {
  schema: MATERIAL_TRANSLATION_PROMPT_CONTRACT_SCHEMA,
  contractVersion: MATERIAL_TRANSLATION_CONTRACT_VERSION,
  systemPrompt: [
    '你是出版社的资料译者，把编辑收进资料库的一份非中文资料逐段译成简体中文，供编辑对照阅读。',
    '【段落】下每段以 [n] 开头，n 是它的序号。逐段翻译：每段原文译成一段中文，不合并、不拆分、不遗漏、不增写；保留人名、书名、数字和引文的原意，不加评论或解释。',
    '译文只供编辑对照原文阅读，不会替换原文，也不是可以直接引用的原文。不调用任何工具。',
    `只输出一个 JSON 对象，不要输出其他文字：{"schema":"${MATERIAL_TRANSLATION_RESULT_SCHEMA}","translations":[{"n":1,"text":"…"}]}，translations 按序号逐段排列，条数与段落数相同。`,
  ].join('\n'),
  messageHeader: 'AI7 来源译文 · 段落摘要 {paragraphsDigest} · 共 {count} 段',
  paragraphsHeader: '【段落】',
} as const;

export const MATERIAL_TRANSLATION_PROMPT_CONTRACT_DIGEST = sha256Hex(canonicalJson(MATERIAL_TRANSLATION_PROMPT_CONTRACT));

/** The digest of the paragraphs one request sends, in order. */
export function materialTranslationParagraphsDigest(paragraphs: readonly string[]): string {
  return sha256Hex(canonicalJson(paragraphs));
}

/** The one user message a translation request sends: the header, then each paragraph after its number on one line. */
export function buildMaterialTranslationMessage(paragraphs: readonly string[]): string {
  const contract = MATERIAL_TRANSLATION_PROMPT_CONTRACT;
  const header = contract.messageHeader
    .replace('{paragraphsDigest}', materialTranslationParagraphsDigest(paragraphs))
    .replace('{count}', String(paragraphs.length));
  return [header, contract.paragraphsHeader, ...paragraphs.map((text, index) => `[${index + 1}] ${text.replace(/[\r\n]+/gu, ' ')}`)].join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/**
 * A translation answer read against the paragraphs it was asked for: exactly one JSON object holding `schema` and
 * `translations`, one entry per paragraph numbered 1 to n in order, each a non-empty well-formed text within the bound.
 * Anything else is `null`, and nothing of it is recorded.
 */
export function readMaterialTranslationAnswer(text: string, count: number): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !sameKeys(parsed, ['schema', 'translations']) || parsed['schema'] !== MATERIAL_TRANSLATION_RESULT_SCHEMA ||
      !Array.isArray(parsed['translations']) || parsed['translations'].length !== count) return null;
  const texts: string[] = [];
  for (const [index, entry] of (parsed['translations'] as unknown[]).entries()) {
    if (!isRecord(entry) || !sameKeys(entry, ['n', 'text']) || entry['n'] !== index + 1 || typeof entry['text'] !== 'string') return null;
    const translation = entry['text'].trim();
    if (translation.length === 0 || translation.length > MAX_MATERIAL_TRANSLATION_CODE_UNITS || !translation.isWellFormed()) return null;
    texts.push(translation);
  }
  return texts;
}

/**
 * The 资料库 originals developer-live may send for 来源译文 (ADR 0089; ADR 0043's rule that development transmits only admitted
 * public material): the SHA-256 of each file as it arrives. Only the English passage written for this purpose,
 * `tests/fixtures/material-formats/public-passage-en.txt`, is admitted — synthetic, public and no manuscript.
 */
export const DEVELOPER_LIVE_TRANSMITTABLE_MATERIAL_DIGESTS: ReadonlySet<string> = new Set([
  'c70bad7ab24b39554f8925d0e357395d87855aed1442611760e0b06473fc42cc',
]);

/** How the made translations are recorded: the model, route, rule and contract of the request that answered. */
export interface MaterialTranslationMade {
  readonly model: string;
  readonly route: string;
  readonly policyRuleId: string | null;
  readonly promptContractDigest: string;
  readonly provenance?: FastRoleProvenance;
}

/** Who makes 来源译文 for the store: whether it may be asked for an item now, and one batch translated. */
export interface MaterialTranslator {
  /** Why 生成来源译文 cannot be asked for the item whose original has this SHA-256; `null` when it can. */
  refusal(originalSha256: string): string | null;
  translate(originalSha256: string, paragraphs: readonly string[], step: string): Promise<
    | { readonly kind: 'translated'; readonly texts: readonly string[]; readonly made: MaterialTranslationMade }
    | { readonly kind: 'failed'; readonly message: string; readonly provenance?: FastRoleProvenance }
  >;
}

/**
 * The translator a launch gives the store (Issue #892): the Fast Interaction Role owner, the launch's scope and the selected
 * policy as it reads now. A policy that names no rule for the kind refuses with 「当前策略未开放来源译文」; a rule that names it
 * still needs the route and credential the owner reads; and under developer-live only an admitted public original may go.
 */
export function materialTranslator(
  owner: FastRoleExecutionOwner,
  scope: 'development-ci' | 'developer-live' | 'ordinary-production',
  rulesNamingKind: () => number,
): MaterialTranslator {
  const refusal = (originalSha256: string): string | null => {
    if (rulesNamingKind() === 0 || scope === 'development-ci') return MATERIAL_TRANSLATION_NOT_ADMITTED;
    const route = owner.refusal(MATERIAL_TRANSLATION_KIND);
    if (route !== null) return route;
    if (scope === 'developer-live' && !DEVELOPER_LIVE_TRANSMITTABLE_MATERIAL_DIGESTS.has(originalSha256)) {
      return '当前运行范围未允许生成来源译文：这份资料不在开发者实时可发送的公开资料范围内。';
    }
    return null;
  };
  return {
    refusal,
    async translate(originalSha256, paragraphs, step) {
      const refused = refusal(originalSha256);
      if (refused !== null) return { kind: 'failed', message: refused };
      let answer: Awaited<ReturnType<FastRoleExecutionOwner['ask']>>;
      try {
        answer = await owner.ask(MATERIAL_TRANSLATION_KIND, buildMaterialTranslationMessage(paragraphs), step);
      } catch (error) {
        return { kind: 'failed', message: error instanceof FastRoleError ? error.message : '生成来源译文没有完成；没有记录任何译文。' };
      }
      if (answer.kind === 'failed') return { kind: 'failed', message: answer.message, ...(answer.provenance === undefined ? {} : { provenance: answer.provenance }) };
      const texts = readMaterialTranslationAnswer(answer.text, paragraphs.length);
      if (texts === null) return { kind: 'failed', message: `模型给出的${MATERIAL_TRANSLATION_LABEL}没有与原文逐段对齐；这一批没有记录任何译文。` };
      return {
        kind: 'translated',
        texts,
        made: {
          model: answer.binding.model,
          route: answer.binding.route,
          policyRuleId: answer.binding.policyRuleId,
          promptContractDigest: answer.binding.promptContractDigest,
          ...(answer.binding.provenance === undefined ? {} : { provenance: answer.binding.provenance }),
        },
      };
    },
  };
}
