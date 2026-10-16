/**
 * Schema revision 75's relations (Issue #425, plan slice S70): the DDL, triggers and foreign keys of the research evidence
 * ledger, kept apart from it and free of imports so that every schema owner that validates the whole store can read them at
 * load. `research-evidence.ts` owns the rows.
 */
export const RESEARCH_EVIDENCE_BACKEND_IDS = "('search-tinyfish', 'search-deepseek', 'search-brave', 'search-parallel', 'search-bochaai')";

export const RESEARCH_EVIDENCE_SCHEMA_SQL = {
  research_evidence_contents: `CREATE TABLE research_evidence_contents (
  content_sha256 TEXT PRIMARY KEY CHECK(length(content_sha256) = 64),
  content_text TEXT NOT NULL CHECK(length(content_text) > 0),
  recorded_at TEXT NOT NULL
) STRICT`,
  research_evidence: `CREATE TABLE research_evidence (
  evidence_id TEXT PRIMARY KEY CHECK(length(evidence_id) = 36),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  run_record_id TEXT NOT NULL CHECK(length(run_record_id) = 36),
  unit_ordinal INTEGER NOT NULL CHECK(unit_ordinal >= 1),
  finding_id TEXT CHECK(finding_id IS NULL OR (length(finding_id) = 28 AND substr(finding_id, 1, 4) = 'fnd_')),
  backend_id TEXT CHECK(backend_id IS NULL OR backend_id IN ${RESEARCH_EVIDENCE_BACKEND_IDS}),
  query_class TEXT NOT NULL CHECK(query_class IN ('时间', '地点', '人物', '机构', '器物', '数字', '引文', '史实', '技术', '其他', 'uncited')),
  url TEXT NOT NULL CHECK(substr(url, 1, 8) = 'https://' AND length(url) <= 2048),
  captured_at TEXT NOT NULL,
  capture_state TEXT NOT NULL CHECK(capture_state IN ('full-text', 'snippet-only', 'failed')),
  content_sha256 TEXT REFERENCES research_evidence_contents(content_sha256),
  page_sha256 TEXT CHECK(page_sha256 IS NULL OR length(page_sha256) = 64),
  snapshot_digest TEXT CHECK(snapshot_digest IS NULL OR length(snapshot_digest) = 64),
  alignment TEXT NOT NULL CHECK(alignment IN ('aligned', 'partial', 'unaligned')),
  anchors_json TEXT NOT NULL CHECK(json_valid(anchors_json) AND json_type(anchors_json) = 'array'),
  translation_json TEXT CHECK(translation_json IS NULL OR (json_valid(translation_json) AND json_extract(translation_json, '$.state') IN ('translated', 'refused'))),
  staleness_state TEXT NOT NULL CHECK(staleness_state IN ('current', 'hash-changed')),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((capture_state = 'full-text') = (page_sha256 IS NOT NULL)),
  CHECK((capture_state = 'failed') = (content_sha256 IS NULL)),
  CHECK(capture_state <> 'failed' OR (alignment = 'unaligned' AND anchors_json = '[]' AND translation_json IS NULL)),
  CHECK((finding_id IS NULL) = (query_class = 'uncited'))
) STRICT`,
  research_evidence_units: `CREATE TABLE research_evidence_units (
  run_record_id TEXT NOT NULL CHECK(length(run_record_id) = 36),
  unit_ordinal INTEGER NOT NULL CHECK(unit_ordinal >= 1),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  backend_id TEXT CHECK(backend_id IS NULL OR backend_id IN ${RESEARCH_EVIDENCE_BACKEND_IDS}),
  search_state TEXT NOT NULL CHECK(search_state IN ('completed', 'incomplete', 'not-searched')),
  search_calls INTEGER NOT NULL CHECK(search_calls >= 0),
  retention_fetches INTEGER NOT NULL CHECK(retention_fetches >= 0),
  failed_retrievals INTEGER NOT NULL CHECK(failed_retrievals >= 0),
  unsupported_findings INTEGER NOT NULL CHECK(unsupported_findings >= 0),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  PRIMARY KEY(run_record_id, unit_ordinal)
) STRICT`,
  research_evidence_materials: `CREATE TABLE research_evidence_materials (
  evidence_id TEXT PRIMARY KEY REFERENCES research_evidence(evidence_id),
  material_id TEXT NOT NULL UNIQUE REFERENCES library_materials(material_id),
  recorded_at TEXT NOT NULL
) STRICT`,
} as const;

export const RESEARCH_EVIDENCE_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(RESEARCH_EVIDENCE_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'RESEARCH_EVIDENCE_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'RESEARCH_EVIDENCE_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const RESEARCH_EVIDENCE_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  research_evidence_contents: [],
  research_evidence: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'content_sha256>research_evidence_contents.content_sha256:NO ACTION/NO ACTION/NONE',
  ],
  research_evidence_units: ['book_id>books.book_id:NO ACTION/NO ACTION/NONE'],
  research_evidence_materials: [
    'evidence_id>research_evidence.evidence_id:NO ACTION/NO ACTION/NONE',
    'material_id>library_materials.material_id:NO ACTION/NO ACTION/NONE',
  ],
};
