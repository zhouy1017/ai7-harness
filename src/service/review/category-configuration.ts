import { canonicalJson, sha256Hex } from '../analysis/canonical.js';
import type { ReviewCategoryOutputKind } from '../../shared/protocol.js';
import type { ReviewCategoryContractInput } from './review-category-contract.js';

/**
 * The built-in Review Category configuration (Issue #417, plan slice S69; V2-UX-REV-002, REV-003,
 * REV-010, REV-012, REV-013). A Review Category is configuration a house may add to, so the nine
 * categories of the specification are data here and never literals in a schema: each states its output,
 * its basis — the guideline documents it applies, the 工序 it runs, and whether it uses a search engine —
 * and how it is executed. A Review Run snapshots the entries it selected together with this
 * configuration's digest, which is how a finished review keeps naming the versions it used after the
 * configuration moves on (REV-012).
 *
 * Every guideline document here is AI7's own short default text, issued as `AI7 内置默认`. A clause may
 * name a public standard as the basis it follows; it never quotes one. Managing guideline documents and
 * 工序 — importing a house's own, versioning them, choosing which a Book uses — is the knowledge base's
 * (S79, #427); until then these are the only ones, and their version is `1`.
 *
 * What a category contributes to the model is exactly {@link reviewCategoryContractInput}: its identity,
 * label, output kind, risk-point rule, its documents' clauses in order, and its 工序. The deterministic
 * fixture `sample1-review-authored` is keyed by the prompt contracts built from that projection of the
 * categories it answers, so changing a clause of one of them means regenerating the fixture.
 */
export const REVIEW_CATEGORY_CONFIGURATION_SCHEMA = 'ai7.review.category-configuration/1' as const;
export const BUILTIN_GUIDELINE_ISSUER = 'AI7 内置默认' as const;

/**
 * How a category's findings come to exist. `review-category-contract` runs the category's own Task
 * under the Editorial Review Contract; `baseline-leads` reads the leads the baseline analysis already
 * holds and calls no model (REV-011); `factual-review-kind` runs the factual-review kind and its
 * contract (S18a); `unavailable` names a category whose basis does not exist yet.
 */
export type ReviewCategoryExecutor = 'review-category-contract' | 'baseline-leads' | 'factual-review-kind' | 'unavailable';

export interface ReviewGuidelineClause {
  readonly clauseId: string;
  readonly text: string;
}

export interface ReviewGuidelineDocument {
  readonly documentId: string;
  readonly title: string;
  readonly issuer: string;
  readonly version: string;
  readonly clauses: ReadonlyArray<ReviewGuidelineClause>;
}

export interface ReviewCategoryConfigurationEntry {
  readonly categoryId: string;
  readonly label: string;
  /** One sentence under the label on the 新建审阅 sheet: what the category looks for and what it yields. */
  readonly description: string;
  readonly output: ReviewCategoryOutputKind;
  /** Findings are only `需人工复核的风险点`; AI7 never states a compliance, plagiarism or policy verdict (REV-003). */
  readonly riskPointsOnly: boolean;
  /** Its 修改建议 may be accepted together through one confirmation strip (REV-006); only category 1. */
  readonly batchApply: boolean;
  /** Stated once in the basis and never disclosed per Run (REV-010). */
  readonly searchEngine: boolean;
  readonly executor: ReviewCategoryExecutor;
  /** Why the category cannot be chosen, exactly when its executor is `unavailable`. */
  readonly unavailableReason: string | null;
  readonly guidelineDocuments: ReadonlyArray<ReviewGuidelineDocument>;
  readonly procedure: { readonly procedureId: string; readonly title: string; readonly version: string };
}

export interface ReviewCategoryConfiguration {
  readonly schema: typeof REVIEW_CATEGORY_CONFIGURATION_SCHEMA;
  readonly version: string;
  readonly categories: ReadonlyArray<ReviewCategoryConfigurationEntry>;
}

function builtinDocument(documentId: string, title: string, clauses: ReadonlyArray<ReviewGuidelineClause>): ReviewGuidelineDocument {
  return { documentId, title, issuer: BUILTIN_GUIDELINE_ISSUER, version: '1', clauses };
}

/** The nine categories in the specification's order, which is also their display order (editor-surfaces §4). */
export const BUILTIN_REVIEW_CATEGORY_CONFIGURATION: ReviewCategoryConfiguration = {
  schema: REVIEW_CATEGORY_CONFIGURATION_SCHEMA,
  version: '1',
  categories: [
    {
      categoryId: 'typos-and-usage',
      label: '错别字与规范用语',
      description: '找出错别字、语病与不规范的数字、标点和字形，逐条给出修改建议；可以一次确认、批量应用。',
      output: 'change-suggestion',
      riskPointsOnly: false,
      batchApply: true,
      searchEngine: false,
      executor: 'review-category-contract',
      unavailableReason: null,
      guidelineDocuments: [builtinDocument('ai7-builtin/typos-and-usage', '文字规范条款', [
        { clauseId: 'typos-and-usage/1', text: '指出错字、别字、多字、漏字与颠倒字，并给出改正后的文字。' },
        { clauseId: 'typos-and-usage/2', text: '指出成分残缺、搭配不当等明显的语法错误，并给出通顺的改法。' },
        { clauseId: 'typos-and-usage/3', text: '数字、标点与计量单位的写法以国家现行的出版物数字用法和标点符号用法规范为依据，指出不合规范之处并给出规范写法。' },
        { clauseId: 'typos-and-usage/4', text: '异形词、简繁混用与专名前后不一致之处，按通用规范汉字与推荐词形统一。' },
      ])],
      procedure: { procedureId: 'ai7-review-procedure/typos-and-usage', title: '错别字与规范用语审阅工序', version: '1' },
    },
    {
      categoryId: 'style-and-format',
      label: '体例与格式',
      description: '检查标题层级、序号、数字与时间写法、引文与专名的呈现是否全书一致，以批注指出。',
      output: 'annotation',
      riskPointsOnly: false,
      batchApply: false,
      searchEngine: false,
      executor: 'review-category-contract',
      unavailableReason: null,
      guidelineDocuments: [builtinDocument('ai7-builtin/style-and-format', '体例条款', [
        { clauseId: 'style-and-format/1', text: '标题层级、章节序号与编号方式前后一致，指出与全书体例不一致之处。' },
        { clauseId: 'style-and-format/2', text: '数字、年代、时间与计量的表述方式在全书范围内统一。' },
        { clauseId: 'style-and-format/3', text: '引文、释文、书名与专名的呈现方式（引号、书名号与字体约定）前后一致。' },
      ])],
      procedure: { procedureId: 'ai7-review-procedure/style-and-format', title: '体例与格式审阅工序', version: '1' },
    },
    {
      categoryId: 'plot-consistency',
      label: '情节逻辑与前后一致',
      description: '把基线分析里前后不一致的线索和未决事项变成稿件上的批注；不调用模型。',
      output: 'annotation',
      riskPointsOnly: false,
      batchApply: false,
      searchEngine: false,
      executor: 'baseline-leads',
      unavailableReason: null,
      guidelineDocuments: [builtinDocument('ai7-builtin/plot-consistency', '线索条款', [
        { clauseId: 'plot-consistency/1', text: '线索只指出两处说法不一致或一件事尚未交代，不判断哪一处正确。' },
      ])],
      procedure: { procedureId: 'ai7-review-procedure/plot-consistency-leads', title: '线索转批注', version: '1' },
    },
    {
      categoryId: 'factual-review',
      label: '事实核查',
      description: '逐段列出可以核查的事实断言并精确定位原文；外部核查接入前，每条都标为「未外部复核」。',
      output: 'annotation',
      riskPointsOnly: false,
      batchApply: false,
      searchEngine: true,
      executor: 'factual-review-kind',
      unavailableReason: null,
      guidelineDocuments: [builtinDocument('ai7-builtin/factual-review', '事实核查契约', [
        { clauseId: 'factual-review/1', text: '逐段列出可以核查的事实断言与引语，给出需要核对的问题，并精确定位其原文。' },
        { clauseId: 'factual-review/2', text: '模型知识不是证据；外部核查接入前，每条断言都标为「未外部复核」。' },
      ])],
      procedure: { procedureId: 'ai7-review-procedure/factual-review', title: '断言列举与引文定位', version: '1' },
    },
    {
      categoryId: 'academic-integrity',
      label: '学术道德与引用',
      description: '指出引用标注的缺漏与疑似未注明来源的表述；只标「需人工复核的风险点」，不作结论。',
      output: 'annotation',
      riskPointsOnly: true,
      batchApply: false,
      searchEngine: true,
      executor: 'review-category-contract',
      unavailableReason: null,
      guidelineDocuments: [builtinDocument('ai7-builtin/academic-integrity', '引用与学术规范条款', [
        { clauseId: 'academic-integrity/1', text: '直接引语与转述他人观点之处缺少引号或出处时，标出位置，并说明需要核对的出处。' },
        { clauseId: 'academic-integrity/2', text: '文风、术语密度或叙述视角与上下文明显不同的成段表述，标为需要人工核对来源的位置。' },
        { clauseId: 'academic-integrity/3', text: '正文引注与文后参考文献不能一一对应，或著录方式与国家现行的参考文献著录规则不一致之处，标出位置。' },
        { clauseId: 'academic-integrity/4', text: '只指出需要人工复核的位置与理由，不作抄袭、洗稿或是否合规的结论。' },
      ])],
      procedure: { procedureId: 'ai7-review-procedure/academic-integrity', title: '引用风险点标注', version: '1' },
    },
    {
      categoryId: 'publication-risk',
      label: '出版政策与风险',
      description: '指出需要按出版单位制度人工复核的内容；只标「需人工复核的风险点」，不作结论。',
      output: 'annotation',
      riskPointsOnly: true,
      batchApply: false,
      searchEngine: false,
      executor: 'review-category-contract',
      unavailableReason: null,
      guidelineDocuments: [builtinDocument('ai7-builtin/publication-risk', '出版风险提示条款', [
        { clauseId: 'publication-risk/1', text: '可能需要按出版单位现行制度履行选题备案等程序的内容，标出位置与理由。' },
        { clauseId: 'publication-risk/2', text: '对真实人物、机构的负面表述与个人隐私信息，标出位置。' },
        { clauseId: 'publication-risk/3', text: '涉及地图、国界与行政区划的表述，标出位置。' },
        { clauseId: 'publication-risk/4', text: '可能被读者当作医疗、法律、金融等专业建议的内容，标出位置。' },
        { clauseId: 'publication-risk/5', text: '只指出需要人工复核的位置与理由，不作合规、违规或能否出版的结论；判断由编辑按出版单位的制度作出。' },
      ])],
      procedure: { procedureId: 'ai7-review-procedure/publication-risk', title: '出版风险点标注', version: '1' },
    },
    {
      categoryId: 'literary-expression',
      label: '文学性与表达改进',
      description: '对重复、生硬与含混的表达给出改写建议；逐条预览、逐条决定，不批量应用。',
      output: 'change-suggestion',
      riskPointsOnly: false,
      batchApply: false,
      searchEngine: false,
      executor: 'review-category-contract',
      unavailableReason: null,
      guidelineDocuments: [builtinDocument('ai7-builtin/literary-expression', '表达改进条款', [
        { clauseId: 'literary-expression/1', text: '指出用词重复、搭配生硬或节奏不顺的句子，给出保留原意的改写。' },
        { clauseId: 'literary-expression/2', text: '指出陈词滥调与含混的表达，给出更准确、更有表现力的说法。' },
        { clauseId: 'literary-expression/3', text: '改写只针对表达，不改变事实、情节、人物关系与作者的语气。' },
      ])],
      procedure: { procedureId: 'ai7-review-procedure/literary-expression', title: '文学性与表达改进工序', version: '1' },
    },
    {
      categoryId: 'series-consistency',
      label: '书系一致性',
      description: '以书系知识为依据，检查跨书的人物、设定与时间线。',
      output: 'annotation',
      riskPointsOnly: false,
      batchApply: false,
      searchEngine: false,
      executor: 'unavailable',
      unavailableReason: '这本书不在任何书系中，也还没有书系知识；加入书系、且书系知识接入审阅后才能选。',
      guidelineDocuments: [],
      procedure: { procedureId: 'ai7-review-procedure/series-consistency', title: '书系一致性检查', version: '1' },
    },
    {
      categoryId: 'cross-deliverable-consistency',
      label: '跨交付物一致性',
      description: '检查稿件与它的编辑交付物之间说法是否一致。',
      output: 'annotation',
      riskPointsOnly: false,
      batchApply: false,
      searchEngine: false,
      executor: 'unavailable',
      unavailableReason: '这本书还没有编辑交付物；有了交付物后才能选。',
      guidelineDocuments: [],
      procedure: { procedureId: 'ai7-review-procedure/cross-deliverable-consistency', title: '跨交付物一致性检查', version: '1' },
    },
  ],
};

/** The digest a Review Run snapshots beside the entries it selected. */
export function reviewCategoryConfigurationDigest(configuration: ReviewCategoryConfiguration = BUILTIN_REVIEW_CATEGORY_CONFIGURATION): string {
  return sha256Hex(canonicalJson(configuration));
}

export function reviewCategoryEntry(
  categoryId: string,
  configuration: ReviewCategoryConfiguration = BUILTIN_REVIEW_CATEGORY_CONFIGURATION,
): ReviewCategoryConfigurationEntry | null {
  return configuration.categories.find((entry) => entry.categoryId === categoryId) ?? null;
}

/**
 * What one category gives the Editorial Review Contract: its documents' clauses in document order, and
 * nothing the model does not need — no description, no issuer, no executor. Only a category the contract
 * executes has one.
 */
export function reviewCategoryContractInput(entry: ReviewCategoryConfigurationEntry): ReviewCategoryContractInput {
  if (entry.executor !== 'review-category-contract') throw new Error('REVIEW_CATEGORY_NOT_CONTRACT_EXECUTED');
  return {
    categoryId: entry.categoryId,
    label: entry.label,
    output: entry.output,
    riskPointsOnly: entry.riskPointsOnly,
    clauses: entry.guidelineDocuments.flatMap((document) => document.clauses.map((clause) => ({ clauseId: clause.clauseId, text: clause.text }))),
    procedure: { procedureId: entry.procedure.procedureId, title: entry.procedure.title, version: entry.procedure.version },
  };
}

/**
 * The guideline documents of a category that the house issued rather than AI7 (Issue #427, S79a review): their clauses are
 * the house's own text, which the category's prompt would carry to the model.
 */
export function houseGuidelineDocuments(entry: ReviewCategoryConfigurationEntry): ReviewGuidelineDocument[] {
  return entry.guidelineDocuments.filter((document) => document.issuer !== BUILTIN_GUIDELINE_ISSUER);
}

/**
 * The category's basis in one line, stated once on the sheet and snapshotted into the Review Run
 * (REV-010, REV-012). Search-engine use is said here and nowhere else; before the research path exists
 * (S70, #425) a category that would search says what its findings carry instead.
 */
export function reviewCategoryBasisStatement(entry: ReviewCategoryConfigurationEntry): string {
  const procedure = `工序：${entry.procedure.title}（第 ${entry.procedure.version} 版）`;
  if (entry.executor === 'baseline-leads') return `依据：这本书最新的基线分析结果 · ${procedure} · 不调用模型，不使用搜索引擎`;
  if (entry.executor === 'unavailable') {
    const source = entry.categoryId === 'series-consistency' ? '依据：书系知识' : '依据：这本书的编辑交付物';
    return `${source} · ${procedure}`;
  }
  const documents = entry.guidelineDocuments.map((document) => `${document.issuer} · ${document.title}（第 ${document.version} 版）`).join('、');
  const search = entry.searchEngine ? '会使用搜索引擎（外部核查接入前为「未联网核查」）' : '不使用搜索引擎';
  return `依据：${documents} · ${procedure} · ${search}`;
}
