import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Turn one Provider Result Cache entry (ADR 0067, ADR 0089) into an `ai7.model-fixture/1` file.
 *
 *   node tools/generate-model-fixture.mjs --from-cache <test item id | request digest> \
 *     --cache-root <dir> --identity <id> --description <text> --out <file> \
 *     [--sample1-store <external ai7.sqlite> --sample1-task <task intent id>]
 *
 * Every argument but the optional sample1 pair is required, and nothing defaults to any host's paths:
 * the cache lives outside every checkout, and a tool that guessed where would be one flag away from
 * reading it by accident.
 *
 * The point of the tool is that a cached live result becomes a deterministic fixture without anyone
 * hand-copying a digest. Only proved exact sample1 may retain manuscript free text (ADR 0079 §5).
 * Existing request subjects convert, each keyed the way the deterministic adapter resolves it (Issue #808): an Analysis Unit, under its unit
 * ordinal and the request digest of its frozen prompt contract and manifest unit, and additionally a
 * `contentDigest` over its own block texts alone, so the same entry also answers a fresh import of the
 * same manuscript; and the Run's cross-unit reduction, an assurance sampling turn and the Run Report
 * reflection, each under ordinal `0` and its own contract's request digest. Factual/review/evaluation/
 * writing units, their existing syntheses and dialogue retain the keys their adapters already consume;
 * recognizing a header grants no live capability. Dialogue chunk boundaries are deterministic conversion,
 * not evidence of the original stream's timing.
 *
 * Identities a capture carries are minted per import or per Run, so they are remapped, explicitly: a
 * unit's own block identities become `{{block:N}}`, the reduction's cited blocks `{{unit:U:block:N}}`,
 * a sampling turn's listed findings `{{ref:N}}` where its result names them — the placeholders the
 * deterministic adapter fills from the request it is answering — and the fixture entry's `capture`
 * lists each replacement. A block
 * identity the request never named cannot be remapped, and refuses as `FIXTURE_GEN/identity-unmapped`;
 * so does a response that already carried placeholder-shaped text of its own.
 * The same `capture` keeps the provenance: the item that captured the response (when a replay of it was
 * named, both), the route, endpoint, request shape and model, the stage's own prompt contract and the
 * enclosing task's, the capture time, the digests of the exact request and response, and the development
 * validation it belonged to. An entry cached before #808 says it is legacy and leaves route, endpoint,
 * shape and task contract null; such a line recorded only the enclosing task's contract, so a legacy
 * reduction, sampling turn or reflection cannot prove its stage contract and refuses.
 *
 * Nothing is written until every check has passed: the fixture is assembled in memory and the single
 * write is the last thing that happens, so a refusal leaves no file behind. The refusals are the
 * interesting part of the tool. A capture the ledger retired — a stale line, an invalidation of its
 * item, or an invalidation of its validation case at or after the ledger position the call observed
 * before it was claimed — refuses as `FIXTURE_GEN/item-retired`: retired evidence answers nothing. A
 * free-text field outside the proved sample1 exemption that still shares a run of MANUSCRIPT_ECHO_THRESHOLD
 * characters with a block the request carried, after placeholder substitution, refuses as `FIXTURE_GEN/manuscript-echo`, naming a
 * bounded JSON path and the run length and never the characters themselves. Earlier model results,
 * tool results and other carried user text are checked too; a reviewer still reads every free-text
 * field. An `--out` under `tests/fixtures/` refuses outright: a fixture enters that directory only
 * through a reviewed pull request, which is where a human reads every free-text field.
 *
 * One body shape only: `openai-chat-completions`. Note that the cache keeps an entry only for HTTP 200,
 * so from the real cache a limit or a server error refuses `entry-missing` before the non-200 mappings
 * below are reached; they exist for entries that carry such a status, and the unit suite drives them
 * from a synthetic cache.
 *
 * Ordinary conversion is plain ESM run before a TypeScript build and duplicates the small pure
 * constants its agreement suite checks. Exact sample1 admission additionally bundles the existing
 * source extraction/manifest/message owners in memory after normal bootstrap; no built output is read.
 */
const MODEL_FIXTURE_SCHEMA = 'ai7.model-fixture/1';
const FIXTURE_IDENTITY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const LEDGER_ITEM_ID_PATTERN = /^[A-Za-z0-9]+\/[a-z0-9-]+\/[1-9][0-9]{0,5}$/u;
const UNIT_MESSAGE_HEADER = /^分析单元 (\d+)\/(\d+) · 单元摘要 ([0-9a-f]{64})$/u;
const OWN_BLOCKS_HEADER = '以下为本单元需要归纳的内容块：';
const BLOCK_LINE = /^\[(blk_[0-9a-f]{24})\] /u;
const BLOCK_KIND_MARKER = /^\((?:title|heading|paragraph)(?: h[1-6])?\) /u;
const PROVIDER_LEDGER_FILE = 'ledger.jsonl';
const PROVIDER_CACHE_DIRECTORY = 'entries';

// --- Duplicated from src/service/analysis/{cross-unit,assurance-sampling,run-report}-contract.ts (Issue #808) ---------------
export const BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST = '8298dc9db1b95f26072cabb00a8c9a14997f68ebe7bf07d01181985f848e66cb';
export const ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST = '4c05e66ba8077c85aa1334b53e98155566fcd9f51d9bd3343e95e7b14ddc03db';
/**
 * The two admitted sampling contracts (Issue #826) and the SHA-256 of each nine-line instruction as a message carries it
 * after its header. The instruction must match one exactly, and the capture's recorded stage contract must agree.
 */
export const ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST = '1bfd29ecb6ba5d9bdbd1e1d097da4de6a0d1c9e6319c5f2318d2ca8c5eeb112c';
export const ASSURANCE_SAMPLING_V1_INSTRUCTION_SHA256 = 'aa072ff68b48dcb124cf7eff205c3c5630118a55d46aa137bbe414efa6d805d4';
export const ASSURANCE_SAMPLING_V2_INSTRUCTION_SHA256 = '522b3a3c19b5d456ec9d9611720cca0eab7d042e92cc47bd0a18eaa20b89b262';
const ASSURANCE_SAMPLING_INSTRUCTION_LINES = 9;
export const RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST = '96456fc99625e12014633439564f17a54cdb1f4f0a05b8076c10a4b03bbd7676';
const CROSS_UNIT_HEADER = /^跨单元归纳 (\d+)\/(\d+) · 单元集摘要 ([0-9a-f]{64})$/u;
const CITED_BLOCKS_HEADER = '各单元引用的内容块标识（按首次引用顺序）：';
const CITED_BLOCKS_LINE = /^单元 (\d+)：(.+)$/u;
const CITED_BLOCK_SEPARATOR = '、';
const SAMPLING_HEADER = /^保证抽样 (\d+)\/(\d+) · 单元摘要 ([0-9a-f]{64}) · 抽样摘要 ([0-9a-f]{64})$/u;
const SAMPLING_OVERLAP_HEADER = '以下为承接上一单元的重叠上下文（仅供理解）：';
const SAMPLING_OWN_HEADER = '以下为本单元的内容块：';
const SAMPLING_FINDING_HEADER = '以下为需要复核的发现：';
const SAMPLING_FINDING_LINE = /^- \[([A-Za-z0-9_-]{1,64})\]（/u;
const REFLECTION_HEADER = /^运行反思 ([A-Za-z0-9_-]{1,64}) · 账目摘要 ([0-9a-f]{64})$/u;
// --- Duplicated from src/service/provider/provider-result-cache.ts (its key, generation and usage formulas below too) ------
const PROVIDER_CACHE_NAMESPACE = 'ai7.provider-cache/2';
const ANY_BLOCK_IDENTITY = /blk_[0-9a-f]{24}/gu;
/** Anything shaped like a placeholder the deterministic adapter or a fixture author could fill. */
const PLACEHOLDER_SHAPE = /\{\{[^{}]+\}\}/gu;

/**
 * How many consecutive characters a free-text field may share with an own block before the tool
 * refuses. Twelve is short enough that a quoted clause cannot slip through and long enough that the
 * contract's own vocabulary — a name, a place, a term the response is supposed to carry — does not
 * trip it. Whitespace is collapsed before the comparison and a run of only punctuation or digits is
 * ignored, so formatting and numbering are never mistaken for manuscript.
 */
export const MANUSCRIPT_ECHO_THRESHOLD = 12;
const IGNORABLE_RUN = /^[\p{P}\p{S}\p{N}\s]+$/u;
const MAX_DESCRIPTION_LENGTH = 512;
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;

/** Fixed messages: a fixture never restates a provider's own words, which could quote the request. */
const QUOTA_MESSAGE = '来源测试项在实时调用中触及提供方账户限额。';
const HTTP_FAILURE_MESSAGE = '来源测试项的实时调用未返回单元结果。';

export class FixtureGenerationError extends Error {
  constructor(code, detail) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = 'FixtureGenerationError';
    this.code = code;
  }
}

function refuse(condition, code, detail) {
  if (!condition) throw new FixtureGenerationError(code, detail);
}

// --- Duplicated from src/service/analysis/canonical.ts and contract.ts ------------------------

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** Object keys sorted by code point, arrays in order, no whitespace; `undefined` members dropped. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Recover the unit identity from a unit message; `null` for anything else. */
export function parseUnitMessageHeader(text) {
  const firstLine = text.split('\n', 1)[0] ?? '';
  const match = UNIT_MESSAGE_HEADER.exec(firstLine);
  if (match === null) return null;
  const ordinal = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || !Number.isSafeInteger(total) || total < ordinal) return null;
  return { ordinal, total, unitDigest: match[3] };
}

/** The request-digest key: a pure function of the frozen prompt contract and the exact manifest unit. */
export function unitRequestDigest(promptContractDigest, unitOrdinal, unitDigest) {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(unitDigest)) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, unitOrdinal, unitDigest }));
}

/** The reduction's identity: how many units it closes over, of how many, and the digest of that closed set; `null` otherwise. */
export function parseCrossUnitMessageHeader(text) {
  const match = CROSS_UNIT_HEADER.exec(text.split('\n', 1)[0] ?? '');
  if (match === null) return null;
  const closed = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(closed) || closed < 2 || !Number.isSafeInteger(total) || total < closed) return null;
  return { closed, total, unitSetDigest: match[3] };
}

/** The reduction's request-digest key: the frozen cross-unit contract and the closed unit set. */
export function crossUnitRequestDigest(promptContractDigest, setDigest) {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(setDigest)) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, unitSetDigest: setDigest }));
}

/** The reduction message's cited-blocks section: each unit's cited block identities, in the order the section lists them. */
export function parseCrossUnitCitedBlocks(text) {
  const lines = text.split('\n');
  const start = lines.indexOf(CITED_BLOCKS_HEADER);
  const cited = new Map();
  if (start === -1) return cited;
  for (const line of lines.slice(start + 1)) {
    const match = CITED_BLOCKS_LINE.exec(line);
    if (match === null) continue;
    cited.set(Number(match[1]), match[2].split(CITED_BLOCK_SEPARATOR).filter((blockId) => /^blk_[0-9a-f]{24}$/u.test(blockId)));
  }
  return cited;
}

/** A sampling turn's identity: its anchor unit, the total, the unit's digest and the digest of the findings listed; `null` otherwise. */
export function parseAssuranceSamplingMessageHeader(text) {
  const match = SAMPLING_HEADER.exec(text.split('\n', 1)[0] ?? '');
  if (match === null) return null;
  const unitOrdinal = Number(match[1]);
  const totalUnits = Number(match[2]);
  if (!Number.isSafeInteger(unitOrdinal) || unitOrdinal < 1 || !Number.isSafeInteger(totalUnits) || totalUnits < unitOrdinal) return null;
  return { unitOrdinal, totalUnits, unitDigest: match[3], sampleDigest: match[4] };
}

/** A sampling turn's request-digest key: the frozen sampling contract, the anchor unit, its digest and the findings listed. */
export function assuranceSamplingRequestDigest(promptContractDigest, unitOrdinal, unitDigest, sampleDigest) {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(unitDigest) || !DIGEST_PATTERN.test(sampleDigest)) {
    throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  }
  if (!Number.isSafeInteger(unitOrdinal) || unitOrdinal < 1) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, unitOrdinal, unitDigest, sampleDigest }));
}

/** The findings a sampling turn listed, by reference, in order. */
export function parseAssuranceSamplingListedRefs(text) {
  const lines = text.split('\n');
  const start = lines.indexOf(SAMPLING_FINDING_HEADER);
  if (start === -1) return [];
  const refs = [];
  for (const line of lines.slice(start + 1)) {
    const match = SAMPLING_FINDING_LINE.exec(line);
    if (match !== null) refs.push(match[1]);
  }
  return refs;
}

/** The reflection's identity: the Run it reflects on and the digest of that Run's accounting; `null` otherwise. */
export function parseRunReportReflectionMessageHeader(text) {
  const match = REFLECTION_HEADER.exec(text.split('\n', 1)[0] ?? '');
  if (match === null) return null;
  return { runRecordId: match[1], accountingDigest: match[2] };
}

/** The reflection's request-digest key: the frozen reflection contract and the Run's accounting alone. */
export function runReportReflectionRequestDigest(promptContractDigest, accountingDigest) {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(accountingDigest)) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, accountingDigest }));
}

function ownBlockLinesOf(unitMessage) {
  const lines = unitMessage.split('\n');
  const start = lines.findIndex((line) => [OWN_BLOCKS_HEADER, '以下为本单元需要核查的内容块：', '以下为本单元需要审阅的内容块：', '以下为本单元的内容块：'].includes(line));
  if (start === -1) return [];
  const blocks = [];
  for (const line of lines.slice(start + 1)) {
    const match = BLOCK_LINE.exec(line);
    if (match !== null) blocks.push({ id: match[1], rest: line.slice(match[0].length) });
  }
  return blocks;
}

/** Own block identities of a unit message, in order. */
export function ownBlockIdsOf(unitMessage) {
  return ownBlockLinesOf(unitMessage).map((block) => block.id);
}

/** Own block texts of a unit message, in order: identity and kind marker stripped, text and nothing else. */
export function ownBlockTextsOf(unitMessage) {
  return ownBlockLinesOf(unitMessage).map((block) => block.rest.replace(BLOCK_KIND_MARKER, ''));
}

/** Every block text a message carries, under whichever header: what a response may not echo. */
function carriedBlockTextsOf(message) {
  return message.split('\n').flatMap((line) => {
    const match = BLOCK_LINE.exec(line);
    return match === null ? [] : [line.slice(match[0].length).replace(BLOCK_KIND_MARKER, '')];
  });
}

/** The content-digest key: SHA-256 over the own block texts joined by a newline. */
export function unitContentDigest(ownBlockTexts) {
  return sha256Hex(ownBlockTexts.join('\n'));
}

// --- Arguments --------------------------------------------------------------------------------

const ARGUMENT_KEYS = ['--from-cache', '--cache-root', '--identity', '--description', '--out'];
const SAMPLE1_PROOF_KEYS = ['--sample1-store', '--sample1-task'];

/**
 * A path is reserved when any two consecutive segments are `tests` and `fixtures`. The check is on
 * the shape of the path rather than on this checkout's location, so it holds from a worktree, from a
 * copy, and from wherever a later caller runs the tool.
 */
export function withinReservedFixtures(path) {
  const segments = path.split(/[\\/]/u).filter((segment) => segment.length > 0).map((segment) => segment.toLowerCase());
  return segments.some((segment, index) => segment === 'tests' && segments[index + 1] === 'fixtures');
}

/** Parse the exact argument form. Every key is required, none is repeated, and none has a default. */
export function parseGenerationArguments(argv) {
  refuse(Array.isArray(argv), 'FIXTURE_GEN/arguments-invalid', '参数序列无效。');
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    refuse([...ARGUMENT_KEYS, ...SAMPLE1_PROOF_KEYS].includes(key), 'FIXTURE_GEN/arguments-invalid', `无法识别的参数 ${String(key)}。`);
    const value = argv[index + 1];
    refuse(typeof value === 'string' && value.length > 0 && !values.has(key), 'FIXTURE_GEN/arguments-invalid', `参数 ${key} 缺少值或重复出现。`);
    values.set(key, value);
    index += 1;
  }
  for (const key of ARGUMENT_KEYS) refuse(values.has(key), 'FIXTURE_GEN/arguments-invalid', `缺少必需参数 ${key}。`);
  const identity = values.get('--identity');
  refuse(FIXTURE_IDENTITY_PATTERN.test(identity), 'FIXTURE_GEN/arguments-invalid', '夹具身份不符合允许的形式。');
  const selector = values.get('--from-cache');
  refuse(DIGEST_PATTERN.test(selector) || LEDGER_ITEM_ID_PATTERN.test(selector),
    'FIXTURE_GEN/arguments-invalid', '--from-cache 既不是测试项标识也不是请求摘要。');
  const description = values.get('--description');
  refuse(description.isWellFormed() && description.length <= MAX_DESCRIPTION_LENGTH,
    'FIXTURE_GEN/arguments-invalid', '夹具描述超出边界。');
  const cacheRoot = resolve(values.get('--cache-root'));
  refuse(isAbsolute(cacheRoot), 'FIXTURE_GEN/arguments-invalid', '缓存根目录必须解析为绝对路径。');
  const out = resolve(values.get('--out'));
  refuse(!withinReservedFixtures(out), 'FIXTURE_GEN/out-path-reserved',
    '生成的夹具只能经过评审的拉取请求进入 tests/fixtures/。');
  const proofCount = SAMPLE1_PROOF_KEYS.filter((key) => values.has(key)).length;
  refuse(proofCount === 0 || proofCount === 2, 'FIXTURE_GEN/arguments-invalid', 'sample1 来源证明参数必须成对提供。');
  if (proofCount === 0) return { selector, cacheRoot, identity, description, out };
  const sample1Store = resolve(values.get('--sample1-store'));
  const sample1Task = values.get('--sample1-task');
  refuse(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(sample1Task), 'FIXTURE_GEN/arguments-invalid', 'sample1 任务身份无效。');
  return { selector, cacheRoot, identity, description, out, sample1Store, sample1Task };
}

const SAMPLE1_SOURCE_SHA256 = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';
const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let sample1Owners;

/** Load the existing extraction and message owners before a build, without writing a second extractor or generated code. */
async function loadSample1Owners() {
  sample1Owners ??= (async () => {
    const { build } = await import('esbuild');
    const result = await build({
      stdin: { contents: [
        "export { parseDocx } from './src/service/docx.ts';",
        "export { deriveCoverageManifest } from './src/service/analysis/coverage-manifest.ts';",
        "export { buildUnitMessage, BASELINE_PROMPT_CONTRACT, BASELINE_PROMPT_CONTRACT_DIGEST, BASELINE_PROMPT_CONTRACT_V1, BASELINE_PROMPT_CONTRACT_V1_DIGEST } from './src/service/analysis/contract.ts';",
        "export { buildCrossUnitMessage } from './src/service/analysis/cross-unit-contract.ts';",
        "export { buildAssuranceSamplingMessage, drawAssuranceSample, assuranceSamplingTurns } from './src/service/analysis/assurance-sampling-contract.ts';",
        "export { baselineAnalysisKindDefinition } from './src/service/analysis/kind-definition.ts';",
        "export { reviewCategoryKindDefinition } from './src/service/review/review-category-kind.ts';",
        "export { reviewCategoryContract, reviewCategoryContractDigest } from './src/service/review/review-category-contract.ts';",
        "export { reviewCategoryContractInput } from './src/service/review/category-configuration.ts';",
        "export { buildRunReportReflectionMessage } from './src/service/analysis/run-report-contract.ts';",
        "export { runReportAccountingOf } from './src/service/analysis/run-report.ts';",
        "export { EDITORIAL_POLISH_PROMPT_CONTRACT, parseEditorialPolishMessage } from './src/service/fast-role/polish-contract.ts';",
        "export { CONFLICT_REGENERATE_PROMPT_CONTRACT, parseConflictRegenerateMessage } from './src/service/fast-role/conflict-regenerate-contract.ts';",
      ].join('\n'), resolveDir: TOOL_ROOT, loader: 'ts' },
      bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
    });
    return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  })();
  return sample1Owners;
}

/**
 * The two Fast Interaction Role subjects of Issue #842 carry no Task record to rebuild their message from: what proves them
 * is the words themselves. A 润色这段 message is exempt only when its context, selection and context read contiguously in one
 * block of exact `sample1` as the existing DOCX extractor reads the hash-checked file; a 重新生成建议 message only when its
 * context, 提案基准 and context do, its 当前稿件 and 原提议 — the tester's edits of `sample1` — being bounded beside them. The
 * system prompt must be the kind's frozen contract and the message must read back exactly. Anything else is not proven, and
 * the ordinary echo rule then decides.
 */
const FAST_ROLE_SUBJECTS = ['editorial-polish', 'conflict-regenerate'];
/** How far a conflict unit's 当前稿件 or 原提议 may exceed its 提案基准 and still read as an edit of it. */
const MAX_TESTER_EDIT_EXCESS = 64;

async function verifySample1FastRoleExcerpt(parsed) {
  try {
    const source = join(TOOL_ROOT, 'SampleBooks', 'sample1.docx');
    if (sha256Hex(await readFile(source)) !== SAMPLE1_SOURCE_SHA256) return false;
    const owners = await loadSample1Owners();
    const polish = parsed.subject === 'editorial-polish';
    const contract = polish ? owners.EDITORIAL_POLISH_PROMPT_CONTRACT : owners.CONFLICT_REGENERATE_PROMPT_CONTRACT;
    if (parsed.carriedMessageCount !== 1 || parsed.systemMessages.length !== 1 || parsed.systemMessages[0] !== contract.systemPrompt) return false;
    const words = polish ? owners.parseEditorialPolishMessage(parsed.unitMessage) : owners.parseConflictRegenerateMessage(parsed.unitMessage);
    if (words === null || (polish ? words.selection : words.base).length === 0) return false;
    if (!polish && [words.current, words.proposed].some((edited) => edited.length > words.base.length + MAX_TESTER_EDIT_EXCESS)) return false;
    const excerpt = polish ? `${words.before}${words.selection}${words.after}` : `${words.before}${words.base}${words.after}`;
    const blocks = [];
    await owners.parseDocx(source, 'sample1.docx', (block) => blocks.push(block.text), { digest: SAMPLE1_SOURCE_SHA256, bytes: 29_550 });
    return blocks.some((text) => text.includes(excerpt));
  } catch {
    // An excerpt that cannot be proved is not exempt: the ordinary echo rule decides, and refuses manuscript text.
    return false;
  }
}

/**
 * ADR 0079 §5: only the exact admitted carrier is exempt. Its frozen product manifest is checked
 * against the existing DOCX extractor; the entire selected stage message is rebuilt from that
 * task's integrity-checked records. A flag, filename, declared digest or validation label is never proof.
 * Protected records stay in the external read-only store, and only the sanitized candidate is emitted.
 */
export async function verifySample1Capture(request, selection, parsed) {
  if (FAST_ROLE_SUBJECTS.includes(parsed.subject)) return verifySample1FastRoleExcerpt(parsed);
  if (request.sample1Store === undefined && request.sample1Task === undefined) return false;
  let step = 'source';
  const fail = () => { throw new FixtureGenerationError('FIXTURE_GEN/sample1-source-unproved', step); };
  let database;
  try {
    if (typeof request.sample1Store !== 'string' || typeof request.sample1Task !== 'string') fail();
    const relation = relative(TOOL_ROOT, resolve(request.sample1Store));
    if (!relation.startsWith('..') && !isAbsolute(relation)) fail();
    const source = join(TOOL_ROOT, 'SampleBooks', 'sample1.docx');
    if (sha256Hex(await readFile(source)) !== SAMPLE1_SOURCE_SHA256) fail();
    const owners = await loadSample1Owners();
    // The task contract the capture was made under (Issue #826): the current /2, or /1 for a capture of the original Run. Its
    // system prompt, plan, revision and sampling contract are all that contract's; another contract proves nothing.
    const contracts = [
      { selection: 'current', prompt: owners.BASELINE_PROMPT_CONTRACT, digest: owners.BASELINE_PROMPT_CONTRACT_DIGEST },
      { selection: 'retained-v1', prompt: owners.BASELINE_PROMPT_CONTRACT_V1, digest: owners.BASELINE_PROMPT_CONTRACT_V1_DIGEST },
    ];
    step = 'records';
    const { DatabaseSync } = await import('node:sqlite');
    database = new DatabaseSync(request.sample1Store, { readOnly: true });
    const checked = (row) => {
      if (row === undefined || sha256Hex(row.canonical_json) !== row.sha256) fail();
      return JSON.parse(row.canonical_json);
    };
    const plan = (component) => checked(database.prepare('SELECT canonical_json, sha256 FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = 1 AND component = ?').get(request.sample1Task, component));
    const pin = plan('manuscript-pin');
    const manifest = plan('coverage-manifest');
    const envelope = plan('plan-envelope');
    let contract = contracts.find((candidate) => candidate.digest === selection.taskPromptContractDigest);
    let definition;
    if (contract === undefined) {
      // #809: a review contract is the exact category configuration the Review Run froze, never
      // today's defaults or a category inferred from a filename. Only one Run may own this Task.
      const rows = database.prepare("SELECT DISTINCT r.canonical_json, r.sha256 FROM review_runs r, json_each(r.canonical_json, '$.categories') c WHERE json_extract(c.value, '$.task.taskIntentId') = ?").all(request.sample1Task);
      if (rows.length !== 1) fail();
      const snapshot = checked(rows[0]);
      const categories = snapshot.categories.filter((category) => category.task?.taskIntentId === request.sample1Task);
      if (snapshot.materialReferences !== undefined || categories.length !== 1) fail();
      const category = categories[0];
      if (category.executor !== 'review-category-contract' || category.entry.searchEngine ||
          category.entry.seriesKnowledge !== undefined || category.task.planEnvelopeDigest !== sha256Hex(canonicalJson(envelope))) fail();
      const input = owners.reviewCategoryContractInput(category.entry);
      const prompt = owners.reviewCategoryContract(input);
      contract = { prompt, digest: owners.reviewCategoryContractDigest(prompt) };
      definition = owners.reviewCategoryKindDefinition(input);
      if (category.task.kind !== definition.kind) fail();
    } else definition = owners.baselineAnalysisKindDefinition(contract.selection);
    if (contract.digest !== selection.taskPromptContractDigest || parsed.carriedMessageCount !== 1 ||
        parsed.systemMessages.length !== 1 || parsed.systemMessages[0] !== contract.prompt.systemPrompt) fail();
    if (pin.sourceDigest !== SAMPLE1_SOURCE_SHA256 || pin.revisionDigest !== manifest.manuscript.revisionDigest ||
      pin.revisionId !== manifest.manuscript.revisionId || envelope.promptContractDigest !== contract.digest) fail();
    step = 'extract';
    const blocks = [];
    await owners.parseDocx(source, 'sample1.docx', (block) => blocks.push({ ...block, graphemes: block.graphemeLength }),
      { digest: SAMPLE1_SOURCE_SHA256, bytes: 29_550 });
    const ids = manifest.units.flatMap((unit) => unit.blockIds);
    if (ids.length !== blocks.length) fail();
    const frozenBlocks = blocks.map((block, index) => ({ ...block, blockId: ids[index] }));
    const rebuilt = owners.deriveCoverageManifest({ ...manifest.manuscript, blocks: frozenBlocks });
    step = 'manifest';
    if (canonicalJson(rebuilt) !== canonicalJson(manifest)) fail();
    const byId = new Map(frozenBlocks.map((block) => [block.blockId, block]));
    const revision = checked(database.prepare('SELECT canonical_json, sha256 FROM analysis_result_set_revisions WHERE task_intent_id = ? ORDER BY ordinal LIMIT 1').get(request.sample1Task));
    step = 'binding';
    if (revision.coverageManifestDigest !== manifest.digest || revision.adapterPin.model !== selection.model ||
      revision.adapterPin.route !== selection.captured.route || revision.bindingPin.promptContractDigest !== selection.taskPromptContractDigest) fail();
    step = 'message';
    let expected;
    if (parsed.subject === 'unit' || parsed.subject === 'review-unit') {
      const unit = manifest.units[parsed.unitOrdinal - 1];
      if (unit === undefined) fail();
      expected = definition.buildUnitMessage(unit, manifest.units.length, byId);
    } else if (parsed.subject === 'reduction') {
      const rows = database.prepare("SELECT canonical_json, sha256 FROM analysis_unit_results WHERE revision_id = ? AND state = 'closed' ORDER BY unit_ordinal").all(revision.revisionId);
      const closed = rows.map((row) => {
        const result = checked(row);
        const { state: _state, requestDigest: _request, responseDigest: _response, usage: _usage, ...fields } = result;
        return { unitOrdinal: result.unitOrdinal, result: { schema: 'ai7.baseline-manuscript-analysis.unit-result/1', ...fields } };
      });
      expected = owners.buildCrossUnitMessage(closed, manifest.units.length);
    } else if (parsed.subject === 'sampling') {
      const candidates = definition.assurance.candidates({ components: revision });
      const draw = owners.drawAssuranceSample(manifest, candidates);
      const messages = owners.assuranceSamplingTurns(draw.sampled).map((turn) =>
        owners.buildAssuranceSamplingMessage(manifest.units[turn.unitOrdinal - 1], manifest.units.length, byId, turn.findings, definition.assurance.prompt));
      if (selection.promptContractDigest !== definition.assurance.promptContractDigest) fail();
      expected = messages.find((message) => message === parsed.unitMessage);
    } else if (parsed.subject === 'reflection') {
      const outcome = checked(database.prepare('SELECT canonical_json, sha256 FROM analysis_task_outcomes WHERE task_intent_id = ?').get(request.sample1Task));
      if (outcome.resultSetRevisionId !== revision.revisionId) fail();
      expected = owners.buildRunReportReflectionMessage(outcome.runRecordId, owners.runReportAccountingOf(outcome.report));
    } else fail();
    if (expected === undefined || expected !== parsed.unitMessage) fail();
    return true;
  } catch { fail(); } finally { database?.close(); }
}

// --- Ledger and cache -------------------------------------------------------------------------

/**
 * The append-only Provider Test Ledger as parsed lines; a malformed line refuses, never silently skips. An invalidation line
 * (Issue #808) names what it retires instead of carrying an item of its own.
 */
export async function readLedgerLines(cacheRoot) {
  let raw;
  try {
    raw = await readFile(join(cacheRoot, PROVIDER_LEDGER_FILE), 'utf8');
  } catch {
    throw new FixtureGenerationError('FIXTURE_GEN/ledger-unreadable', '找不到或无法读取 Provider Test Ledger。');
  }
  const lines = [];
  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new FixtureGenerationError('FIXTURE_GEN/ledger-unreadable', 'Provider Test Ledger 含有无法解析的记录。');
    }
    refuse(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) &&
      (typeof parsed.itemId === 'string' || (parsed.kind === 'invalidation' && parsed.target !== null && typeof parsed.target === 'object')),
    'FIXTURE_GEN/ledger-unreadable', 'Provider Test Ledger 记录缺少测试项标识。');
    if (parsed.kind === 'invalidation') {
      const target = parsed.target;
      refuse(!Array.isArray(target) && (Object.keys(target).length === 1 && LEDGER_ITEM_ID_PATTERN.test(target.itemId) ||
        Object.keys(target).length === 2 && typeof target.family === 'string' && typeof target.case === 'string') &&
        typeof parsed.reason === 'string' && parsed.reason.length > 0 && typeof parsed.recordedAt === 'string',
      'FIXTURE_GEN/ledger-unreadable', '作废记录的目标或原因无效。');
    } else {
      // The ledger length a call observed before it was claimed can only point at lines already written.
      refuse(parsed.evidencePosition === undefined ||
        (Number.isSafeInteger(parsed.evidencePosition) && parsed.evidencePosition >= 0 && parsed.evidencePosition <= lines.length),
      'FIXTURE_GEN/ledger-unreadable', 'Provider Test Ledger 证据位置无效。');
    }
    lines.push(parsed);
  }
  return lines;
}

function isModelCallLine(line) {
  return typeof line.itemId === 'string' && (line.kind === undefined || line.kind === 'model-call');
}

/** The line that captured an item's response: its latest non-stale send, or `undefined`. */
function captureLineOf(lines, itemId) {
  return lines.filter((line) => isModelCallLine(line) && line.itemId === itemId && line.stale !== true &&
    ['transmitted', 'failed'].includes(line.outcome)).at(-1);
}

/**
 * Whether the ledger retired a capture, by the rule `ProviderResultCache.isRetired` follows: every line of the item stale, an
 * invalidation naming it, or an invalidation of its validation family and case at or after the ledger position the call
 * observed before it was claimed — so an invalidation recorded while the call was in flight retires it even though its
 * capture line lands later. A capture line without that position falls back to the invalidation following it.
 */
export function captureRetired(lines, itemId) {
  const own = lines.filter((line) => line.kind !== 'invalidation' && line.itemId === itemId);
  if (own.length > 0 && own.every((line) => line.stale === true)) return true;
  const capture = captureLineOf(lines, itemId);
  const captured = capture === undefined ? -1 : lines.indexOf(capture);
  const purpose = capture?.validation;
  return lines.some((line, index) => {
    if (line.kind !== 'invalidation') return false;
    if (typeof line.target.itemId === 'string') return line.target.itemId === itemId;
    if (purpose === undefined || line.target.family !== purpose.family || line.target.case !== purpose.case) return false;
    return capture.evidencePosition === undefined ? index > captured : index >= capture.evidencePosition;
  });
}

/**
 * The item whose capture a line answered with. A send is its own capture; an #808 replay names the capture it replayed as its
 * one piece of evidence; a replay written before #808 names nothing, and the legacy cache answered it by model and request
 * digest alone, so its capture is the latest earlier legacy send of that pair. `null` when nothing proves which it was.
 */
function captureItemOf(lines, chosen) {
  if (chosen.outcome !== 'replayed') return chosen.itemId;
  if (chosen.validation !== undefined) {
    const evidence = chosen.validation.evidence;
    return chosen.validation.decision === 'exact-replay' && Array.isArray(evidence) && evidence.length === 1 &&
      typeof evidence[0] === 'string' && LEDGER_ITEM_ID_PATTERN.test(evidence[0]) ? evidence[0] : null;
  }
  if (chosen.cacheKey !== undefined) return null;
  const earlier = lines.slice(0, lines.indexOf(chosen)).filter((line) => isModelCallLine(line) && line.cacheKey === undefined &&
    line.outcome === 'transmitted' && line.stale !== true && line.model === chosen.model && line.requestDigest === chosen.requestDigest);
  return earlier.at(-1)?.itemId ?? null;
}

/**
 * Which capture the selector names. A test item id resolves to its latest non-stale line; a request digest resolves through
 * every line carrying it. Either way the lines must agree on one model and, since #808, on one exact namespace: two models, or
 * two endpoints, under one digest are two different cached results, and picking one of them silently is exactly the mistake
 * this tool exists to prevent. A replay resolves to the capture it replayed; a capture the ledger retired, a result it never
 * proved, or a call it refused, answers nothing.
 */
export function resolveLedgerSelection(lines, selector) {
  const models = lines.filter(isModelCallLine);
  const carrying = DIGEST_PATTERN.test(selector)
    ? models.filter((line) => line.requestDigest === selector)
    : models.filter((line) => line.itemId === selector);
  const live = carrying.filter((line) => line.stale !== true && line.outcome !== 'refused');
  refuse(live.length > 0, 'FIXTURE_GEN/item-unknown', 'Provider Test Ledger 中没有该测试项或请求摘要的未作废记录。');
  const modelIds = new Set(live.map((line) => line.model));
  refuse(modelIds.size === 1, 'FIXTURE_GEN/model-ambiguous', `该请求摘要在 Provider Test Ledger 中对应 ${modelIds.size} 个模型。`);
  const keys = new Set(live.map((line) => line.cacheKey ?? null));
  refuse(keys.size === 1, 'FIXTURE_GEN/namespace-ambiguous', `该请求摘要在 Provider Test Ledger 中对应 ${keys.size} 个请求命名空间。`);
  const chosen = live[live.length - 1];
  refuse(typeof chosen.model === 'string' && chosen.model.length > 0, 'FIXTURE_GEN/item-unknown', '账本记录缺少模型标识。');
  refuse(typeof chosen.requestDigest === 'string' && DIGEST_PATTERN.test(chosen.requestDigest),
    'FIXTURE_GEN/item-unknown', '账本记录缺少有效的请求摘要。');
  refuse(typeof chosen.promptContractDigest === 'string' && DIGEST_PATTERN.test(chosen.promptContractDigest),
    'FIXTURE_GEN/item-unknown', '账本记录缺少有效的提示契约摘要。');
  const captureItemId = captureItemOf(lines, chosen);
  refuse(captureItemId !== null, 'FIXTURE_GEN/capture-unproven', '账本没有该回放所用的可确认捕获。');
  refuse(!captureRetired(lines, captureItemId), 'FIXTURE_GEN/item-retired', `测试项 ${captureItemId} 的捕获已被作废，不再生成夹具。`);
  const captured = captureLineOf(lines, captureItemId);
  refuse(captured !== undefined && captured.classification !== 'outcome-unknown' &&
    captured.model === chosen.model && captured.requestDigest === chosen.requestDigest &&
    captured.promptContractDigest === chosen.promptContractDigest && Number.isSafeInteger(captured.status) &&
    typeof captured.recordedAt === 'string' && !Number.isNaN(Date.parse(captured.recordedAt)) && LEDGER_ITEM_ID_PATTERN.test(chosen.itemId),
  'FIXTURE_GEN/capture-unproven', '账本没有该请求的可确认捕获。');
  const legacyReplay = chosen.evidenceScope === 'legacy-unnamespaced';
  const chosenTask = taskContractOf(chosen);
  const namespaceFields = ['route', 'endpoint', 'requestShape', 'cacheKey', 'generation'];
  const scoped = !legacyReplay && namespaceFields.some((key) => key in chosen);
  refuse(!scoped || namespaceFields.every((key) => typeof chosen[key] === 'string' && chosen[key].length > 0),
    'FIXTURE_GEN/capture-unproven', '请求命名空间记录不完整。');
  // The cache keeps an #808 capture only for a 200 it could keep whole; anything else under a namespaced key is not one.
  refuse(!scoped || (captured.outcome === 'transmitted' && captured.status === 200 &&
    chosen.cacheKey === namespacedCacheKey(chosen, chosen.requestDigest) &&
    typeof chosenTask === 'string' && DIGEST_PATTERN.test(chosenTask) &&
    chosen.generation === evidenceGeneration(chosen, chosen.promptContractDigest, chosenTask) &&
    namespaceFields.every((key) => chosen[key] === captured[key]) &&
    chosenTask === taskContractOf(captured)),
  'FIXTURE_GEN/capture-unproven', '请求命名空间或证据代次不一致。');
  return {
    itemId: chosen.itemId,
    captureItemId,
    model: chosen.model,
    requestDigest: chosen.requestDigest,
    promptContractDigest: chosen.promptContractDigest,
    quotaExhausted: captured.classification === 'quota-exhausted',
    cacheKey: scoped ? chosen.cacheKey : null,
    generation: scoped ? chosen.generation : null,
    taskPromptContractDigest: scoped ? chosenTask : null,
    captured,
    // A replay says when the response it answered with was captured; the entry must say the same.
    replayCapturedAt: chosen.outcome === 'replayed' && typeof chosen.capturedAt === 'string' ? chosen.capturedAt : null,
  };
}

/**
 * The enclosing task's contract a line or entry names. A dialogue item (the `S17c` slice) is its own task, and the first live
 * dialogue captures (Issue #52) named no task contract: such a one reads as its stage contract, which is the evidence
 * generation it was keyed under. Any other item that names none stays unproven.
 */
export function taskContractOf(record) {
  const dialogue = typeof record.itemId === 'string' && record.itemId.startsWith('S17c/');
  return record.taskPromptContractDigest === undefined && dialogue ? record.promptContractDigest : record.taskPromptContractDigest;
}

/** The entry file of one (model, request digest) pair under the legacy key: the formula every entry before #808 was written by. */
export function cacheEntryPath(cacheRoot, model, requestDigest) {
  const key = sha256Hex(JSON.stringify([model, requestDigest]));
  return join(cacheRoot, PROVIDER_CACHE_DIRECTORY, `${key}.json`);
}

/** The namespaced key of one exact request: the same formula `ProviderResultCache` keys every #808 entry by. */
export function namespacedCacheKey(namespace, requestDigest) {
  return sha256Hex(JSON.stringify([PROVIDER_CACHE_NAMESPACE, namespace.route, namespace.endpoint, namespace.requestShape, namespace.model, requestDigest]));
}

/**
 * The configuration a capture answers for, by the formula `providerEvidenceGeneration` writes: route, endpoint, request shape,
 * model and the stage's own prompt contract, joined by the enclosing task's contract only when that differs.
 */
export function evidenceGeneration(namespace, promptContractDigest, taskPromptContractDigest) {
  const task = taskPromptContractDigest === undefined || taskPromptContractDigest === null || taskPromptContractDigest === promptContractDigest
    ? []
    : [taskPromptContractDigest];
  return sha256Hex(JSON.stringify([namespace.route, namespace.endpoint, namespace.requestShape, namespace.model, promptContractDigest, ...task]));
}

/** The two usage counts an OpenAI-compatible response states, or `null`: what `usageOfResponse` reads. */
function usageOfResponse(response) {
  const usage = response !== null && typeof response === 'object' ? response.usage : undefined;
  if (usage === null || typeof usage !== 'object') return null;
  const { prompt_tokens: inputTokens, completion_tokens: outputTokens } = usage;
  return Number.isSafeInteger(inputTokens) && inputTokens >= 0 && Number.isSafeInteger(outputTokens) && outputTokens >= 0
    ? { inputTokens, outputTokens }
    : null;
}

function sameUsage(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) return (left ?? null) === (right ?? null);
  return left.inputTokens === right.inputTokens && left.outputTokens === right.outputTokens;
}

async function readEntryFile(path) {
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new FixtureGenerationError('FIXTURE_GEN/entry-missing', 'Provider Result Cache 中没有该模型与请求摘要的条目。');
  }
  refuse(raw.length <= MAX_ENTRY_BYTES, 'FIXTURE_GEN/entry-invalid', '缓存条目超出安全大小。');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FixtureGenerationError('FIXTURE_GEN/entry-invalid', '缓存条目不是有效 JSON。');
  }
  refuse(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) &&
    typeof parsed.requestBody === 'string' && Number.isSafeInteger(parsed.status) && parsed.status >= 100,
  'FIXTURE_GEN/entry-invalid', '缓存条目缺少请求体或状态。');
  return parsed;
}

/** The legacy entry of one (model, request digest) pair. */
export async function readCacheEntry(cacheRoot, model, requestDigest) {
  return readEntryFile(cacheEntryPath(cacheRoot, model, requestDigest));
}

/**
 * The namespaced entry an item captured. A later capture of the same exact request — another generation, or a resend after an
 * invalidation — moves the earlier entry aside under `<key>.superseded-…` rather than overwriting it, so a capture that is no
 * longer the current file is looked for there; an unreadable archive is skipped, never guessed at.
 */
async function readCapturedEntry(cacheRoot, cacheKey, itemId) {
  const directory = join(cacheRoot, PROVIDER_CACHE_DIRECTORY);
  const current = await readEntryFile(join(directory, `${cacheKey}.json`));
  if (current.itemId === itemId) return current;
  let names = [];
  try {
    names = await readdir(directory);
  } catch {
    return current;
  }
  for (const name of names.filter((file) => file.startsWith(`${cacheKey}.superseded-`) && file.endsWith('.json')).sort()) {
    try {
      const archived = await readEntryFile(join(directory, name));
      if (archived.itemId === itemId) return archived;
    } catch (error) {
      if (!(error instanceof FixtureGenerationError)) throw error;
    }
  }
  return current;
}

/**
 * The entry a selection names: under its namespaced key when its line carries one — the entry must then say it is that exact
 * request, captured by that item under that generation, with the usage the ledger recorded — and under the legacy key otherwise.
 */
export async function readSelectedEntry(cacheRoot, selection) {
  const entry = selection.cacheKey === null
    ? await readCacheEntry(cacheRoot, selection.model, selection.requestDigest)
    : await readCapturedEntry(cacheRoot, selection.cacheKey, selection.captureItemId);
  refuse(entry.model === selection.model && entry.requestDigest === selection.requestDigest && sha256Hex(entry.requestBody) === selection.requestDigest &&
    entry.status === selection.captured.status && typeof entry.transmittedAt === 'string' && !Number.isNaN(Date.parse(entry.transmittedAt)) &&
    (selection.replayCapturedAt === null || selection.replayCapturedAt === entry.transmittedAt) &&
    (!('usage' in entry) || sameUsage(entry.usage, usageOfResponse(entry.response))),
  'FIXTURE_GEN/entry-invalid', '缓存条目与账本记录的请求不一致。');
  const responseDigest = sha256Hex(JSON.stringify(entry.response) ?? 'null');
  refuse(!('responseDigest' in entry) || entry.responseDigest === responseDigest, 'FIXTURE_GEN/entry-invalid', '缓存响应摘要不一致。');
  if (selection.cacheKey !== null) {
    refuse(entry.cacheKey === selection.cacheKey && namespacedCacheKey(entry, selection.requestDigest) === selection.cacheKey &&
      entry.generation === selection.generation && entry.promptContractDigest === selection.promptContractDigest &&
      taskContractOf(entry) === selection.taskPromptContractDigest &&
      entry.itemId === selection.captureItemId && entry.responseDigest === responseDigest &&
      entry.evidencePosition === selection.captured.evidencePosition &&
      sameUsage(entry.usage, selection.captured.usage) &&
      ['route', 'endpoint', 'requestShape'].every((key) => entry[key] === selection.captured[key]) &&
      entry.validation !== undefined && ['family', 'case', 'step'].every((key) =>
        typeof entry.validation[key] === 'string' && entry.validation[key] === selection.captured.validation?.[key]),
    'FIXTURE_GEN/entry-invalid', '缓存捕获身份、契约或证据代次不一致。');
  } else {
    refuse(!['cacheKey', 'route', 'endpoint', 'requestShape', 'generation'].some((key) => key in entry),
      'FIXTURE_GEN/entry-invalid', '旧式缓存条目含有未经证明的命名空间。');
  }
  return entry;
}

// --- The request ------------------------------------------------------------------------------

/** The text of one chat-completions message: a plain string, or text blocks concatenated. */
function chatMessageText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const texts = [];
  for (const block of content) {
    if (block === null || typeof block !== 'object' || block.type !== 'text' || typeof block.text !== 'string') return null;
    texts.push(block.text);
  }
  return texts.join('');
}

/**
 * What the cached request asked about: the last `user` message of an `openai-chat-completions` body, read as an Analysis Unit,
 * the reduction, a sampling turn or the reflection by the header only that subject writes. Its fixture key is that subject's
 * own: a unit's ordinal with its request and content digests, or ordinal `0` with the digest of the subject's own contract,
 * which a reduction, a sampling turn or the reflection names as its `stageContractDigest` for the caller to prove against the
 * capture. Any other request shape refuses rather than being guessed at.
 */
export function parseCachedRequest(requestBody, promptContractDigest) {
  let body;
  try {
    body = JSON.parse(requestBody);
  } catch {
    throw new FixtureGenerationError('FIXTURE_GEN/request-shape-unsupported', '缓存条目的请求体不是 JSON。');
  }
  refuse(body !== null && typeof body === 'object' && !Array.isArray(body) && Array.isArray(body.messages) && body.messages.length > 0,
    'FIXTURE_GEN/request-shape-unsupported', '缓存条目不是 openai-chat-completions 请求体。');
  let unitMessage = null;
  let unitMessageIndex = -1;
  const carriedMessages = [];
  const systemMessages = [];
  for (const message of body.messages) {
    refuse(message !== null && typeof message === 'object' && !Array.isArray(message) && typeof message.role === 'string',
      'FIXTURE_GEN/request-shape-unsupported', '请求体中的消息缺少角色。');
    const text = chatMessageText(message.content);
    refuse(text !== null, 'FIXTURE_GEN/request-shape-unsupported', '请求体中的消息内容既不是字符串也不是文本块序列。');
    if (message.role === 'user') {
      unitMessage = text;
      unitMessageIndex = carriedMessages.length;
    }
    if (message.role !== 'system') carriedMessages.push(text);
    else systemMessages.push(text);
  }
  refuse(unitMessage !== null, 'FIXTURE_GEN/request-shape-unsupported', '请求体不含任何 user 消息。');
  const carriedBlockTexts = carriedBlockTextsOf(unitMessage);
  const unitMessageScanIndex = carriedBlockTexts.length + unitMessageIndex;
  // Everything the request carried but its frozen system prompt — user input, earlier model results, tool results and selected
  // dialogue text — participates in sanitization. The exact request remains only in the external cache.
  carriedBlockTexts.push(...carriedMessages);
  const task = parseTaskHeader(unitMessage, promptContractDigest);
  const header = parseUnitMessageHeader(unitMessage) ?? task?.header ?? null;
  if (header !== null) {
    const ownBlockTexts = ownBlockTextsOf(unitMessage);
    refuse(ownBlockTexts.length > 0, 'FIXTURE_GEN/unit-message-unrecognized', '分析单元消息不含任何本单元内容块。');
    return {
      subject: task?.subject ?? 'unit', unitMessage, header, ownBlockTexts, carriedBlockTexts, carriedMessageCount: carriedMessages.length, systemMessages,
      unitOrdinal: header.ordinal,
      requestDigest: task?.requestDigest ?? (promptContractDigest === undefined ? null : unitRequestDigest(promptContractDigest, header.ordinal, header.unitDigest)),
      contentDigest: unitContentDigest(ownBlockTexts),
      identities: ownBlockIdsOf(unitMessage).map((identity, index) => ({ placeholder: `{{block:${index + 1}}}`, identity })),
    };
  }
  if (task !== null) return { ...task, unitMessage, ownBlockTexts: [], carriedBlockTexts, carriedMessageCount: carriedMessages.length, systemMessages, contentDigest: null, identities: [] };
  const reduction = parseCrossUnitMessageHeader(unitMessage);
  if (reduction !== null) {
    const identities = [...parseCrossUnitCitedBlocks(unitMessage)].flatMap(([unit, blockIds]) =>
      blockIds.map((identity, index) => ({ placeholder: `{{unit:${unit}:block:${index + 1}}}`, identity })));
    return {
      subject: 'reduction', stageContractDigest: BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, unitMessage, header: null, ownBlockTexts: [],
      carriedBlockTexts, carriedMessageCount: carriedMessages.length, systemMessages, unitOrdinal: 0, contentDigest: null, identities,
      requestDigest: crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, reduction.unitSetDigest),
    };
  }
  const sampling = parseAssuranceSamplingMessageHeader(unitMessage);
  if (sampling !== null) {
    const stageContractDigest = samplingStageContractOf(unitMessage);
    // The exact public instruction has just been proved, like the frozen system prompt above. Keep every block, finding
    // and other carried turn in the echo scan, but do not mistake its required result-schema literal for manuscript text.
    const messageLines = unitMessage.split('\n');
    const messageWithoutInstruction = [messageLines[0], ...messageLines.slice(1 + ASSURANCE_SAMPLING_INSTRUCTION_LINES)].join('\n');
    return {
      subject: 'sampling', stageContractDigest, unitMessage, header: null, ownBlockTexts: [],
      carriedBlockTexts: carriedBlockTexts.map((text, index) => index === unitMessageScanIndex ? messageWithoutInstruction : text),
      carriedMessageCount: carriedMessages.length, systemMessages, unitOrdinal: 0, contentDigest: null,
      identities: [
        ...parseAssuranceSamplingListedRefs(unitMessage).map((identity, index) => ({ placeholder: `{{ref:${index + 1}}}`, identity })),
        ...unitMessage.split('\n').flatMap((line) => { const match = BLOCK_LINE.exec(line); return match === null ? [] : [match[1]]; })
          .map((identity, index) => ({ placeholder: `{{sample-block:${index + 1}}}`, identity })),
      ],
      requestDigest: assuranceSamplingRequestDigest(stageContractDigest, sampling.unitOrdinal, sampling.unitDigest, sampling.sampleDigest),
    };
  }
  const reflection = parseRunReportReflectionMessageHeader(unitMessage);
  if (reflection !== null) {
    return {
      subject: 'reflection', stageContractDigest: RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, unitMessage, header: null, ownBlockTexts: [],
      carriedBlockTexts, carriedMessageCount: carriedMessages.length, systemMessages, unitOrdinal: 0, contentDigest: null, identities: [],
      requestDigest: runReportReflectionRequestDigest(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, reflection.accountingDigest),
    };
  }
  throw new FixtureGenerationError('FIXTURE_GEN/unit-message-unrecognized', '最后一条 user 消息不是可识别的分析单元、跨单元归纳、保证抽样或运行反思消息。');
}

/** Only an exact /1 or /2 instruction establishes a sampling contract; unknown text is never historical evidence. */
function samplingStageContractOf(unitMessage) {
  const lines = unitMessage.split('\n');
  const instructionDigest = sha256Hex(lines.slice(1, 1 + ASSURANCE_SAMPLING_INSTRUCTION_LINES).join('\n'));
  const following = lines[1 + ASSURANCE_SAMPLING_INSTRUCTION_LINES];
  refuse(following === SAMPLING_OVERLAP_HEADER || following === SAMPLING_OWN_HEADER,
    'FIXTURE_GEN/contract-mismatch', '保证抽样指令不是完整的已知契约。');
  if (instructionDigest === ASSURANCE_SAMPLING_V1_INSTRUCTION_SHA256) return ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST;
  if (instructionDigest === ASSURANCE_SAMPLING_V2_INSTRUCTION_SHA256) return ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST;
  throw new FixtureGenerationError('FIXTURE_GEN/contract-mismatch', '保证抽样指令不匹配任何已知契约。');
}

/** Closed header families already consumed by the deterministic adapter; no new Task support. */
export function parseTaskHeader(text, promptContractDigest) {
  const first = text.split('\n', 1)[0] ?? '';
  const unit = /^(事实核查|审阅|评估|审稿意见|评语重写|写作)单元 (\d+)\/(\d+) · (?:类别 ([a-z][a-z0-9]*(?:-[a-z0-9]+)*) · )?单元摘要 ([0-9a-f]{64})$/u.exec(first);
  if (unit !== null) {
    const ordinal = Number(unit[2]);
    const total = Number(unit[3]);
    if (!Number.isSafeInteger(ordinal) || ordinal < 1 || !Number.isSafeInteger(total) || total < ordinal ||
      ((unit[1] === '审阅') !== (unit[4] !== undefined)) || (unit[4]?.length ?? 0) > 48) return null;
    const subject = { 事实核查: 'factual-unit', 审阅: 'review-unit', 评估: 'evaluation-unit', 审稿意见: 'readers-unit', 评语重写: 'rewrite-unit', 写作: 'writing-unit' }[unit[1]];
    const body = { promptContractDigest, ...(unit[4] === undefined ? {} : { categoryId: unit[4] }),
      ...(['评估', '审稿意见', '评语重写', '写作'].includes(unit[1]) ? { step: 'unit' } : {}), unitOrdinal: ordinal, unitDigest: unit[5] };
    return { subject, header: { ordinal, total, unitDigest: unit[5] }, unitOrdinal: ordinal, requestDigest: sha256Hex(canonicalJson(body)) };
  }
  const synthesis = /^(评估|审稿意见|评语重写|写作)综合 (\d+)\/(\d+) · (依据|段落)摘要 ([0-9a-f]{64})$/u.exec(first);
  if (synthesis !== null) {
    const closed = Number(synthesis[2]);
    const total = Number(synthesis[3]);
    const passage = ['审稿意见', '写作'].includes(synthesis[1]);
    if (!Number.isSafeInteger(closed) || closed < 1 || !Number.isSafeInteger(total) || total < closed ||
      synthesis[4] !== (passage ? '段落' : '依据')) return null;
    return { subject: 'task-synthesis', header: null, unitOrdinal: 0,
      requestDigest: sha256Hex(canonicalJson({ promptContractDigest, step: 'synthesis', [passage ? 'passageSetDigest' : 'observationSetDigest']: synthesis[5] })) };
  }
  const dialogue = /^AI7 编辑对话 · (提问|接着回答) · 问题摘要 ([0-9a-f]{64})$/u.exec(first);
  if (dialogue !== null) return { subject: 'dialogue', header: null, unitOrdinal: 0,
    requestDigest: sha256Hex(`ai7.editorial-dialogue/1\u0000${promptContractDigest}\u0000${dialogue[1] === '提问' ? 'ask' : 'continue'}\u0000${dialogue[2]}`) };
  // 润色这段 and 基于当前稿件重新生成建议 (Issue #842), keyed as the deterministic adapter keys them under ordinal 0.
  const polish = /^AI7 润色这段 · 选段摘要 ([0-9a-f]{64}) · 上下文摘要 ([0-9a-f]{64})$/u.exec(first);
  if (polish !== null) return { subject: 'editorial-polish', header: null, unitOrdinal: 0,
    requestDigest: sha256Hex(`ai7.editorial-polish/1\u0000${promptContractDigest}\u0000${polish[1]}\u0000${polish[2]}`) };
  const regeneration = /^AI7 冲突重新生成 · 冲突单元摘要 ([0-9a-f]{64})$/u.exec(first);
  if (regeneration !== null) return { subject: 'conflict-regenerate', header: null, unitOrdinal: 0,
    requestDigest: sha256Hex(`ai7.conflict-regenerate/1\u0000${promptContractDigest}\u0000${regeneration[1]}`) };
  return null;
}

// --- Manuscript echo --------------------------------------------------------------------------

function collapseWhitespace(text) {
  return text.replace(/\s+/gu, ' ');
}

/**
 * Replace every whole own block text with its `{{block:N}}` placeholder. Longest first, so a block
 * whose text is a prefix of another's cannot claim the longer block's span.
 */
export function replaceOwnBlockTexts(text, ownBlockTexts) {
  const ordered = ownBlockTexts
    .map((value, index) => ({ value, placeholder: `{{block:${index + 1}}}` }))
    .filter((block) => block.value.length > 0)
    .sort((left, right) => right.value.length - left.value.length);
  let replaced = text;
  for (const block of ordered) replaced = replaced.split(block.value).join(block.placeholder);
  return replaced;
}

/**
 * Replace every captured identity with the placeholder the deterministic adapter fills from the request it answers, longest
 * identity first and only as a whole token, so a short finding reference never rewrites a longer word that contains it. A
 * block identity left over afterwards is one the request never named — another import's, or invented — and no request could
 * ever fill it, so it refuses rather than being kept.
 */
export function remapIdentities(text, identities) {
  let remapped = text;
  for (const { placeholder, identity } of [...identities].sort((left, right) => right.identity.length - left.identity.length)) {
    remapped = remapped.replace(identityToken(identity), placeholder);
  }
  const stray = remapped.match(ANY_BLOCK_IDENTITY);
  refuse(stray === null, 'FIXTURE_GEN/identity-unmapped', `响应含有 ${stray?.length ?? 0} 个请求中没有的内容块标识。`);
  return remapped;
}

/**
 * A sampling turn's finding references, remapped only where its result uses them as references — the `ref` of a disposition.
 * The baseline kind's references are bare indices, and the result's schema name and its free text carry digits too; remapped
 * there, a replay listing other references would rewrite them. A response that is not JSON is remapped as any other text.
 */
export function remapSamplingRefs(text, identities) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return remapIdentities(text, identities);
  }
  const placeholders = new Map(identities.filter(({ placeholder }) => placeholder.startsWith('{{ref:')).map(({ placeholder, identity }) => [identity, placeholder]));
  const visit = (node, key) => {
    if (typeof node === 'string') return key === 'ref' ? placeholders.get(node) ?? node : node;
    if (Array.isArray(node)) return node.map((item) => visit(item, undefined));
    if (node !== null && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([name, item]) => [name, visit(item, name)]));
    return node;
  };
  return remapIdentities(JSON.stringify(visit(parsed, undefined)), identities.filter(({ placeholder }) => placeholder.startsWith('{{sample-block:')));
}

/**
 * The length of the first run of MANUSCRIPT_ECHO_THRESHOLD characters or more that this field shares
 * with any own block, or `null`. Whitespace is collapsed on both sides and the comparison walks code
 * points, not code units, so a surrogate pair is never cut in half. The run itself is measured and
 * then discarded: the caller may report how long it was and never what it said.
 */
export function longestEchoRun(field, collapsedBlocks) {
  const points = Array.from(collapseWhitespace(field));
  for (let start = 0; start + MANUSCRIPT_ECHO_THRESHOLD <= points.length; start += 1) {
    let end = start + MANUSCRIPT_ECHO_THRESHOLD;
    const window = points.slice(start, end).join('');
    if (IGNORABLE_RUN.test(window)) continue;
    if (!collapsedBlocks.some((block) => block.includes(window))) continue;
    while (end < points.length && collapsedBlocks.some((block) => block.includes(points.slice(start, end + 1).join('')))) end += 1;
    return end - start;
  }
  return null;
}

/**
 * The first free-text field of a parsed response that still echoes an own block, as its JSON path
 * and the run length — never the characters. A plain string is one field at path `$`.
 */
export function findManuscriptEcho(value, ownBlockTexts) {
  const collapsedBlocks = ownBlockTexts.map(collapseWhitespace);
  const visit = (node, path) => {
    if (typeof node === 'string') {
      const runLength = longestEchoRun(node, collapsedBlocks);
      return runLength === null ? null : { path, runLength };
    }
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index += 1) {
        const found = visit(node[index], `${path}[${index}]`);
        if (found !== null) return found;
      }
      return null;
    }
    if (node !== null && typeof node === 'object') {
      for (const [index, [key, item]] of Object.entries(node).entries()) {
        const keyRun = longestEchoRun(key, collapsedBlocks);
        if (keyRun !== null) return { path: `${path}.[key:${index + 1}]`, runLength: keyRun };
        const label = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/u.test(key) ? key : `[field:${index + 1}]`;
        const found = visit(item, `${path}.${label}`);
        if (found !== null) return found;
      }
      return null;
    }
    return null;
  };
  return visit(value, '$');
}

/**
 * One identity as a whole token: not preceded or followed by another identity character. Identities are `[A-Za-z0-9_-]` only
 * (block identities and finding references alike), none of which is special in a pattern outside a class.
 */
function identityToken(identity) {
  return new RegExp(`(?<![A-Za-z0-9_-])${identity}(?![A-Za-z0-9_-])`, 'gu');
}

function mapStrings(node, map) {
  if (typeof node === 'string') return map(node);
  if (Array.isArray(node)) return node.map((item) => mapStrings(item, map));
  if (node !== null && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, mapStrings(item, map)]));
  }
  return node;
}

/**
 * The unit-result text as a fixture may carry it: every string value with whole own blocks replaced
 * by their placeholders, refused outright if anything manuscript-shaped survives. A text that is not
 * JSON is treated as one field, which is the honest reading of a response that did not parse. The
 * echo is measured against every block text the request carried, under whichever header.
 */
export function redactUnitResultText(text, ownBlockTexts, carriedBlockTexts = ownBlockTexts, sample1Verified = false) {
  // Exact sample1 is exempt entirely: replacing a quoted full block with a block identity would change
  // the recorded meaning and the later reduction's content key. Citation identities are still remapped.
  if (sample1Verified) return text;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  const replaced = parsed === undefined
    ? replaceOwnBlockTexts(text, ownBlockTexts)
    : mapStrings(parsed, (field) => replaceOwnBlockTexts(field, ownBlockTexts));
  const echo = findManuscriptEcho(replaced, carriedBlockTexts);
  if (echo !== null) {
    throw new FixtureGenerationError('FIXTURE_GEN/manuscript-echo',
      `字段 ${echo.path} 与本单元内容块仍有 ${echo.runLength} 个字符重合。`);
  }
  return typeof replaced === 'string' ? replaced : JSON.stringify(replaced);
}

// --- The response -----------------------------------------------------------------------------

/**
 * One cached result as a fixture response. A limit is a limit whichever way the ledger and the
 * status say so; any other non-200 becomes an adapter failure named after its status; and a 200 must
 * actually carry a result, with the usage the ceiling is measured against. Absent usage refuses
 * rather than being written as zeros, which would silently make the fixture free to replay. The
 * captured identities are remapped before the echo check, so the check reads what the file will say.
 */
export function mapCachedResponse(entry, selection, ownBlockTexts, request = { identities: [], carriedBlockTexts: ownBlockTexts }) {
  if (selection.quotaExhausted || entry.status === 429) {
    return { kind: 'quota-exceeded', message: QUOTA_MESSAGE, status: entry.status };
  }
  if (entry.status !== 200) {
    return { kind: 'adapter-failure', code: `PROVIDER_HTTP_${entry.status}`, message: HTTP_FAILURE_MESSAGE, status: entry.status };
  }
  const response = entry.response;
  refuse(response !== null && typeof response === 'object' && !Array.isArray(response) && Array.isArray(response.choices),
    'FIXTURE_GEN/response-shape-unsupported', '缓存条目的响应不是 openai-chat-completions 结果。');
  const message = response.choices[0] === undefined ? undefined : response.choices[0].message;
  const text = message === null || typeof message !== 'object' ? undefined : message.content;
  refuse(typeof text === 'string' && text.length > 0,
    'FIXTURE_GEN/response-shape-unsupported', '缓存条目的响应不含 choices[0].message.content 文本。');
  const usage = response.usage;
  const inputTokens = usage === null || typeof usage !== 'object' ? undefined : usage.prompt_tokens;
  const outputTokens = usage === null || typeof usage !== 'object' ? undefined : usage.completion_tokens;
  refuse(Number.isSafeInteger(inputTokens) && inputTokens >= 0 && Number.isSafeInteger(outputTokens) && outputTokens >= 0,
    'FIXTURE_GEN/usage-absent', '缓存条目的响应不含可用的 usage 计数。');
  // A placeholder the model itself wrote would be filled on replay like one the converter wrote, and the replay would no
  // longer say what the capture said; so every placeholder in a fixture must be one this conversion put there.
  refuse(text.match(PLACEHOLDER_SHAPE) === null, 'FIXTURE_GEN/identity-unmapped', '原始响应已含有占位符形式的文字，回放无法与捕获区分。');
  const remapped = request.subject === 'sampling' ? remapSamplingRefs(text, request.identities) : remapIdentities(text, request.identities);
  const sanitized = redactUnitResultText(remapped, ownBlockTexts, request.carriedBlockTexts, request.sample1Verified === true);
  refuse(sanitized.isWellFormed() && sanitized.length > 0 && sanitized.length <= 64 * 1024, 'FIXTURE_GEN/response-shape-unsupported', '归一化响应超出夹具文本边界。');
  const points = Array.from(sanitized);
  const chunks = [];
  for (let index = 0; index < points.length; index += 2_048) chunks.push(points.slice(index, index + 2_048).join(''));
  return request.subject === 'dialogue'
    ? { kind: 'answer-chunks', chunks, usage: { inputTokens, outputTokens } }
    : { kind: 'unit-result', text: sanitized, usage: { inputTokens, outputTokens } };
}

// --- Assembly ---------------------------------------------------------------------------------

/** The fixture document. Its description carries the provenance a reviewer needs to trace it back; its entry, all of it. */
export function assembleFixture(parts) {
  return {
    schema: MODEL_FIXTURE_SCHEMA,
    identity: parts.identity,
    description: `${parts.description} · 来源测试项 ${parts.itemId} · 模型 ${parts.model} · 生成于 ${parts.generatedOn}`,
    basedOn: null,
    provider: 'ai7-local-deterministic',
    model: 'ai7-deterministic-fixture',
    entries: [{
      unitOrdinal: parts.unitOrdinal,
      requestDigest: parts.requestDigest,
      ...(parts.contentDigest === null || parts.contentDigest === undefined ? {} : { contentDigest: parts.contentDigest }),
      response: parts.response,
      ...(parts.capture === undefined ? {} : { capture: parts.capture }),
    }],
  };
}

/**
 * Where the converted entry came from, as `ai7.model-fixture/1` keeps it: the capture's identity and conditions, the digests of
 * its exact request and response, its development validation, and, for every placeholder the fixture response carries, the
 * identity in the captured request it stands for.
 */
export function captureProvenance(entry, selection, request, response) {
  const namespaced = selection.cacheKey !== null;
  const serialized = JSON.stringify(response);
  return {
    subject: request.subject,
    itemId: selection.captureItemId,
    selectedItemId: selection.itemId,
    evidenceScope: namespaced ? 'namespaced' : 'legacy-unnamespaced',
    route: namespaced ? entry.route : null,
    endpoint: namespaced ? entry.endpoint : null,
    requestShape: namespaced ? entry.requestShape : null,
    model: selection.model,
    promptContractDigest: selection.promptContractDigest,
    taskPromptContractDigest: namespaced ? selection.taskPromptContractDigest : null,
    capturedAt: entry.transmittedAt,
    providerRequestDigest: sha256Hex(entry.requestBody),
    providerResponseDigest: namespaced ? entry.responseDigest : sha256Hex(JSON.stringify(entry.response) ?? 'null'),
    responseDigestOrigin: namespaced ? 'recorded' : 'computed-legacy',
    cacheKey: namespaced ? selection.cacheKey : null,
    generation: namespaced ? selection.generation : null,
    validation: namespaced ? { family: entry.validation.family, case: entry.validation.case, step: entry.validation.step } : null,
    identityMap: request.identities.filter(({ placeholder }) => serialized.includes(placeholder)),
    fixtureResponseDigest: sha256Hex(canonicalJson(response)),
  };
}

/**
 * The prompt contract a capture was answered under, proved against what its request is. A unit, a synthesis or a dialogue turn
 * is its own task, so its stage and task contracts are one. A reduction, a sampling turn or the reflection runs under its own
 * frozen contract inside an enclosing task: an #808 line records both, and the stage's must be the one its header implies. A
 * line written before #808 recorded only the enclosing task's contract for every call, so it cannot prove which contract such
 * a stage ran under and is refused rather than relabeled.
 */
function requireStageContract(selection, parsed) {
  if (parsed.stageContractDigest === undefined) {
    refuse(selection.cacheKey === null || selection.taskPromptContractDigest === selection.promptContractDigest,
      'FIXTURE_GEN/contract-mismatch', '任务捕获契约与阶段契约不一致。');
    return;
  }
  refuse(selection.cacheKey !== null, 'FIXTURE_GEN/capture-unproven', '旧式捕获只记录了所属任务的契约，不能证明归纳、抽样或反思阶段所用的契约。');
  refuse(selection.promptContractDigest === parsed.stageContractDigest, 'FIXTURE_GEN/contract-mismatch', '捕获的阶段契约与请求消息不一致。');
}

/** Everything but the write: a caller that refuses here has left nothing on disk. */
export async function generateModelFixture(request, now = new Date()) {
  const selection = resolveLedgerSelection(await readLedgerLines(request.cacheRoot), request.selector);
  const entry = await readSelectedEntry(request.cacheRoot, selection);
  const parsed = parseCachedRequest(entry.requestBody, selection.promptContractDigest);
  requireStageContract(selection, parsed);
  parsed.sample1Verified = await verifySample1Capture(request, selection, parsed);
  refuse(JSON.parse(entry.requestBody).model === selection.model, 'FIXTURE_GEN/entry-invalid', '请求体模型与捕获模型不一致。');
  refuse(/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/u.test(selection.model), 'FIXTURE_GEN/entry-invalid', '模型标识无效。');
  if (selection.cacheKey !== null) {
    let endpoint;
    try { endpoint = new URL(entry.endpoint); } catch { /* Refuse below without echoing the URL. */ }
    refuse(endpoint !== undefined && endpoint.protocol === 'https:' && endpoint.username === '' && endpoint.password === '' &&
      endpoint.search === '' && endpoint.hash === '' && /^[a-z][a-z0-9-]{0,63}$/u.test(entry.route) &&
      entry.requestShape === 'openai-chat-completions', 'FIXTURE_GEN/entry-invalid', '捕获路由或请求形态无效。');
  }
  refuse(findManuscriptEcho(request.description, parsed.carriedBlockTexts) === null, 'FIXTURE_GEN/manuscript-echo', '夹具描述仍包含请求内容。');
  const response = mapCachedResponse(entry, selection, parsed.ownBlockTexts, parsed);
  const capture = captureProvenance(entry, selection, parsed, response);
  const placeholders = JSON.stringify(response).match(PLACEHOLDER_SHAPE) ?? [];
  refuse(placeholders.every((placeholder) => capture.identityMap.some((mapping) => mapping.placeholder === placeholder)) &&
    new Set(capture.identityMap.map((mapping) => mapping.identity)).size === capture.identityMap.length && capture.identityMap.length <= 4_096,
  'FIXTURE_GEN/identity-unmapped', '响应含有未经映射或不唯一的占位符。');
  return assembleFixture({
    identity: request.identity,
    description: request.description,
    itemId: selection.itemId,
    model: selection.model,
    generatedOn: now.toISOString().slice(0, 10),
    unitOrdinal: parsed.unitOrdinal,
    requestDigest: parsed.requestDigest,
    contentDigest: parsed.contentDigest,
    response,
    capture,
  });
}

async function main() {
  const request = parseGenerationArguments(process.argv.slice(2));
  const fixture = await generateModelFixture(request);
  await writeFile(request.out, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  // The path and nothing else: no field of the fixture is ever printed.
  process.stdout.write(`${request.out}\n`);
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof FixtureGenerationError ? error.message : 'FIXTURE_GEN/failed'}\n`);
    process.exitCode = 1;
  });
}
