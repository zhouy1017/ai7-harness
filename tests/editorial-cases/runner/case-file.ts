/**
 * The `ai7.editorial-case/1` shape (tests/editorial-cases/README.md) and its validation. A case that does not hold this shape
 * refuses with a bounded code naming the case and the field, before anything runs.
 */

export const EDITORIAL_CASE_SCHEMA = 'ai7.editorial-case/1';
export const EDITORIAL_CASE_KINDS = ['review', 'polish', 'initial-evaluation', 'readers-report', 'writing-draft', 'clarification', 'cross-deliverable', 'material-review'] as const;
export type EditorialCaseKind = (typeof EDITORIAL_CASE_KINDS)[number];
export const MEASURED_PASS_KINDS = ['review', 'polish', 'initial-evaluation', 'readers-report', 'writing-draft'] as const;

export interface TextConcern {
  readonly id: string;
  readonly category?: string;
  readonly paragraph?: number;
  readonly words?: string;
  readonly corrections?: ReadonlyArray<string>;
  readonly defect?: string;
  readonly concern?: string;
}

export interface TextCheck {
  readonly id: string;
  readonly paragraph?: number;
  readonly words?: string;
  readonly trap?: string;
  readonly reason?: string;
}

export interface StructuralConcern {
  readonly id: string;
  readonly item?: string;
  readonly passageKind?: string;
  readonly paragraphs?: ReadonlyArray<number>;
  readonly keywords?: ReadonlyArray<string>;
  readonly section?: string;
  readonly maxGraphemes?: number;
  readonly run?: 'normal' | 'ambiguous';
  readonly units?: ReadonlyArray<number>;
  readonly concern?: string;
  readonly reason?: string;
}

export interface EditorialCase {
  readonly schema: typeof EDITORIAL_CASE_SCHEMA;
  readonly id: string;
  readonly kind: EditorialCaseKind;
  readonly title: string;
  readonly manuscript: { readonly source: 'sample1' } | { readonly source: 'synthetic'; readonly id: string };
  readonly bookTitle: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly fixture: string;
  readonly measuredPass: (typeof MEASURED_PASS_KINDS)[number] | null;
  /** How the fixture replays: the deterministic route, or the developer-live owner with or without the v14 model-question wrapper. */
  readonly replay: { readonly route: 'deterministic' } | { readonly route: 'developer-live'; readonly modelQuestions: boolean };
  readonly expectedConcerns: ReadonlyArray<TextConcern & StructuralConcern>;
  readonly falsePositiveChecks: ReadonlyArray<TextCheck & StructuralConcern>;
  readonly observations: { readonly acceptance: string; readonly rework: string };
}

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;

function require(condition: unknown, id: string, field: string): asserts condition {
  if (!condition) throw new Error(`EDITORIAL_CASE/invalid: ${id}/${field}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Validate one parsed case file against its schema and the file name it was read from. */
export function validateCase(value: unknown, fileId: string): EditorialCase {
  require(isRecord(value), fileId, 'root');
  const id = value.id;
  require(value.schema === EDITORIAL_CASE_SCHEMA, fileId, 'schema');
  require(typeof id === 'string' && ID.test(id) && id === fileId, fileId, 'id');
  require((EDITORIAL_CASE_KINDS as ReadonlyArray<unknown>).includes(value.kind), id, 'kind');
  require(typeof value.title === 'string' && value.title.length > 0, id, 'title');
  require(typeof value.bookTitle === 'string' && value.bookTitle.length > 0 && value.bookTitle.length <= 120, id, 'bookTitle');
  const manuscript = value.manuscript;
  require(isRecord(manuscript) && (manuscript.source === 'sample1' ||
    (manuscript.source === 'synthetic' && typeof manuscript.id === 'string')), id, 'manuscript');
  require(isRecord(value.input), id, 'input');
  require(typeof value.fixture === 'string' && ID.test(value.fixture), id, 'fixture');
  require(value.measuredPass === null || (MEASURED_PASS_KINDS as ReadonlyArray<unknown>).includes(value.measuredPass), id, 'measuredPass');
  const replay = value.replay;
  require(isRecord(replay) && (replay.route === 'deterministic' || (replay.route === 'developer-live' && typeof replay.modelQuestions === 'boolean')), id, 'replay');
  require(manuscript.source === 'sample1' || replay.route === 'deterministic', id, 'replay');
  for (const field of ['expectedConcerns', 'falsePositiveChecks'] as const) {
    const list = value[field];
    require(Array.isArray(list) && (field === 'falsePositiveChecks' || list.length > 0), id, field);
    const seen = new Set<string>();
    for (const entry of list) {
      require(isRecord(entry) && typeof entry.id === 'string' && ID.test(entry.id) && !seen.has(entry.id), id, `${field}/id`);
      seen.add(entry.id);
      require(entry.paragraph === undefined || (Number.isSafeInteger(entry.paragraph) && (entry.paragraph as number) > 0), id, `${field}/${entry.id}/paragraph`);
      require(entry.words === undefined || (typeof entry.words === 'string' && entry.words.length > 0 && entry.words.length <= 40), id, `${field}/${entry.id}/words`);
      require(entry.paragraphs === undefined || (Array.isArray(entry.paragraphs) && entry.paragraphs.every((n) => Number.isSafeInteger(n) && n > 0)), id, `${field}/${entry.id}/paragraphs`);
      require(entry.keywords === undefined || (Array.isArray(entry.keywords) && entry.keywords.every((k) => typeof k === 'string' && k.length > 0)), id, `${field}/${entry.id}/keywords`);
    }
  }
  const observations = value.observations;
  require(isRecord(observations) && typeof observations.acceptance === 'string' && typeof observations.rework === 'string', id, 'observations');
  return value as unknown as EditorialCase;
}
