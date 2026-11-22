/**
 * The manuscript core's final shape (#1634, ADR 0105 §4): the Books, manuscripts, working state, imports, reimports, recovery
 * and search relations, with their explicit indexes, the import abandonment-cleanup fence (12 blockers and 2 validators) and the
 * five import-result exclusivity guards. Every text is the one a store at revision 116 holds, copied from
 * `tests/fixtures/database/revision-116-schema.json` (`tools/schema-dump.mjs`), so the baseline built from it is that shape.
 * The predecessor shapes this module held for the migration chain are gone with the chain.
 */
export const CORE_SCHEMA_SQL = {
  book_dimension_sets: `CREATE TABLE book_dimension_sets (
      dimension_set_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
      version INTEGER NOT NULL CHECK(version = 1),
      profile_id TEXT NOT NULL,
      profile_version TEXT NOT NULL,
      definition_digest TEXT NOT NULL CHECK(length(definition_digest) = 64),
      weight_semantics TEXT NOT NULL CHECK(weight_semantics = '中性起始权重；非穷尽评分量表'),
      created_at TEXT NOT NULL
    ) STRICT`,
  book_dimensions: `CREATE TABLE book_dimensions (
      dimension_set_id TEXT NOT NULL REFERENCES book_dimension_sets(dimension_set_id),
      dimension_id TEXT NOT NULL,
      display_label TEXT NOT NULL,
      weight REAL NOT NULL CHECK(weight > 0),
      position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8),
      PRIMARY KEY(dimension_set_id, dimension_id),
      UNIQUE(dimension_set_id, position)
    ) STRICT`,
  books: `CREATE TABLE books (
      book_id TEXT PRIMARY KEY,
      stable_identity TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL
    , internal_number TEXT) STRICT`,
  branch_working_state: `CREATE TABLE branch_working_state (
      branch_id TEXT PRIMARY KEY REFERENCES manuscript_branches(branch_id),
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      base_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
      journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
      working_digest TEXT NOT NULL CHECK(length(working_digest) = 64)
    , total_graphemes INTEGER NOT NULL DEFAULT 0 CHECK(total_graphemes >= 0), history_sequence INTEGER NOT NULL DEFAULT 0 CHECK(history_sequence >= 0), last_checkpoint_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_checkpoint_sequence >= 0), history_boundary_sequence INTEGER NOT NULL DEFAULT 0 CHECK(history_boundary_sequence >= 0)) STRICT`,
  content_objects: `CREATE TABLE content_objects (
      object_digest TEXT PRIMARY KEY CHECK(length(object_digest) = 64),
      relative_key TEXT NOT NULL UNIQUE,
      byte_length INTEGER NOT NULL CHECK(byte_length > 0),
      verified_at TEXT NOT NULL
    ) STRICT`,
  edit_journal_entries: `CREATE TABLE edit_journal_entries (
      journal_entry_id TEXT PRIMARY KEY,
      client_edit_id TEXT NOT NULL UNIQUE,
      request_fingerprint TEXT NOT NULL,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
      base_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
      sequence INTEGER NOT NULL CHECK(sequence > 0),
      block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
      from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
      to_grapheme INTEGER NOT NULL CHECK(to_grapheme >= from_grapheme),
      insert_text TEXT NOT NULL,
      resulting_block_digest TEXT NOT NULL CHECK(length(resulting_block_digest) = 64),
      resulting_working_digest TEXT NOT NULL CHECK(length(resulting_working_digest) = 64),
      durable_at TEXT NOT NULL, command_group_id TEXT, command_kind TEXT NOT NULL DEFAULT 'edit', service_lifetime_id TEXT,
      UNIQUE(branch_id, sequence)
    ) STRICT`,
  import_abandonment_cleanup_intents: `CREATE TABLE import_abandonment_cleanup_intents (
    draft_id TEXT PRIMARY KEY REFERENCES import_drafts(draft_id),
    object_digest TEXT NOT NULL UNIQUE REFERENCES content_objects(object_digest),
    expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
    relative_key TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('prepared', 'bytes-removed')),
    requested_at TEXT NOT NULL,
    bytes_removed_at TEXT, working_object_digest TEXT,
    CHECK(
      (state = 'prepared' AND bytes_removed_at IS NULL)
      OR (state = 'bytes-removed' AND bytes_removed_at IS NOT NULL)
    )
  ) STRICT`,
  import_commit_attempts: `CREATE TABLE import_commit_attempts (
  attempt_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
  request_fingerprint TEXT NOT NULL,
  expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
  review_digest TEXT NOT NULL CHECK(length(review_digest) = 64),
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import', 'manuscript-reimport')),
  state TEXT NOT NULL CHECK(state IN ('prepared', 'uncertain', 'committed')),
  prepared_at TEXT NOT NULL,
  committed_at TEXT,
  uncertain_at TEXT,
  uncertainty_code TEXT,
  completion_acknowledged_at TEXT,
  CHECK(
    (state = 'prepared' AND committed_at IS NULL AND uncertain_at IS NULL
      AND uncertainty_code IS NULL AND completion_acknowledged_at IS NULL)
    OR (state = 'uncertain' AND committed_at IS NULL AND uncertain_at IS NOT NULL
      AND uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE' AND completion_acknowledged_at IS NULL)
    OR (state = 'committed' AND committed_at IS NOT NULL AND uncertain_at IS NULL
      AND uncertainty_code IS NULL)
  )
) STRICT`,
  import_commits: `CREATE TABLE import_commits (
  commit_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id),
  request_fingerprint TEXT NOT NULL,
  expected_draft_version INTEGER NOT NULL,
  review_digest TEXT NOT NULL,
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import', 'manuscript-reimport')),
  result_json TEXT NOT NULL,
  committed_at TEXT NOT NULL
) STRICT`,
  import_degradation_decisions: `CREATE TABLE "import_degradation_decisions" (
        degradation_decision_id TEXT PRIMARY KEY,
        fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
        decision TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT`,
  import_drafts: `CREATE TABLE import_drafts (
  draft_id TEXT PRIMARY KEY,
  selection_token TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('staged', 'reviewed', 'committed')),
  draft_version INTEGER NOT NULL CHECK(draft_version >= 1),
  display_name TEXT NOT NULL,
  object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
  selected_path TEXT,
  reviewed_title TEXT,
  reviewed_target_choice_id TEXT
    CHECK(reviewed_target_choice_id IS NULL OR reviewed_target_choice_id IN ('new-book', 'new-book-distinct-intended-work')),
  review_digest TEXT UNIQUE,
  committed_commit_id TEXT UNIQUE,
  staged_at TEXT NOT NULL,
  reviewed_at TEXT,
  committed_at TEXT,
  reviewed_target_kind TEXT CHECK(reviewed_target_kind IS NULL OR reviewed_target_kind IN ('new-book', 'existing-book')),
  reviewed_existing_book_id TEXT REFERENCES books(book_id),
  reviewed_relationship TEXT
    CHECK(reviewed_relationship IS NULL OR reviewed_relationship IN ('new-book-first-manuscript', 'first-manuscript', 'source-only', 'reimport')),
  reviewed_book_state_digest TEXT
    CHECK(reviewed_book_state_digest IS NULL OR length(reviewed_book_state_digest) = 64),
  reviewed_reuse_source_version_id TEXT REFERENCES source_versions(source_version_id),
  reviewed_lineage_status TEXT CHECK(reviewed_lineage_status IS NULL OR reviewed_lineage_status IN ('verified', 'unconfirmed')),
  reviewed_lineage_source_version_id TEXT REFERENCES source_versions(source_version_id),
  reviewed_checkpoint_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
  reviewed_manuscript_id TEXT REFERENCES manuscripts(manuscript_id),
  reviewed_branch_id TEXT REFERENCES manuscript_branches(branch_id)
, source_format TEXT NOT NULL DEFAULT 'DOCX' CHECK(source_format IN ('DOCX', 'DOC', 'PDF', 'ODT', 'RTF', 'TXT', 'MD', 'UNKNOWN')), working_object_digest TEXT, converter_identity TEXT) STRICT`,
  import_fidelity_reviews: `CREATE TABLE "import_fidelity_reviews" (
        fidelity_review_id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(book_id),
        source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
        review_digest TEXT NOT NULL UNIQUE,
        outcome TEXT NOT NULL CHECK(outcome IN ('clean-import-no-round-trip', 'degraded-import-no-round-trip')),
        round_trip_guaranteed INTEGER NOT NULL CHECK(round_trip_guaranteed = 0),
        created_at TEXT NOT NULL
      ) STRICT`,
  import_ingest_blocks: `CREATE TABLE import_ingest_blocks (
    ingest_id TEXT NOT NULL,
    draft_id TEXT NOT NULL,
    staged_block_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph', 'note')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    start_offset INTEGER NOT NULL CHECK(start_offset >= 0),
    grapheme_length INTEGER NOT NULL CHECK(grapheme_length >= 0),
    PRIMARY KEY(ingest_id, position),
    UNIQUE(ingest_id, staged_block_id)
  ) STRICT`,
  manuscript_block_versions: `CREATE TABLE manuscript_block_versions (
      revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
      block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
      position INTEGER NOT NULL CHECK(position > 0),
      kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph', 'note')),
      level INTEGER,
      text TEXT NOT NULL,
      digest TEXT NOT NULL CHECK(length(digest) = 64), start_offset INTEGER NOT NULL DEFAULT 0 CHECK(start_offset >= 0), grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0),
      PRIMARY KEY(revision_id, block_id),
      UNIQUE(revision_id, position)
    ) STRICT`,
  manuscript_blocks: `CREATE TABLE manuscript_blocks (
      block_id TEXT PRIMARY KEY,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      created_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id)
    ) STRICT`,
  manuscript_branches: `CREATE TABLE manuscript_branches (
      branch_id TEXT PRIMARY KEY,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      name TEXT NOT NULL,
      base_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
      created_at TEXT NOT NULL,
      UNIQUE(manuscript_id, name)
    ) STRICT`,
  manuscript_entry_positions: `CREATE TABLE manuscript_entry_positions (
  book_id TEXT NOT NULL REFERENCES books(book_id),
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
  branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
  revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
  grapheme INTEGER NOT NULL CHECK(grapheme >= 0),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(book_id, revision_id)
) STRICT`,
  manuscript_import_records: `CREATE TABLE "manuscript_import_records" (
        import_record_id TEXT PRIMARY KEY,
        commit_id TEXT NOT NULL UNIQUE,
        book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
        manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
        source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
        fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
        degradation_decision_id TEXT REFERENCES import_degradation_decisions(degradation_decision_id),
        resulting_revision_id TEXT NOT NULL UNIQUE REFERENCES manuscript_revisions(revision_id),
        provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
        imported_at TEXT NOT NULL
      ) STRICT`,
  manuscript_outline: `CREATE TABLE manuscript_outline (
        branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
        block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
        order_key INTEGER NOT NULL CHECK(order_key > 0),
        kind TEXT NOT NULL CHECK(kind IN ('title', 'heading')),
        level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 6),
        text TEXT NOT NULL,
        digest TEXT NOT NULL CHECK(length(digest) = 64),
        PRIMARY KEY(branch_id, block_id),
        UNIQUE(branch_id, order_key)
      ) STRICT`,
  manuscript_recovery_review_status: `CREATE TABLE manuscript_recovery_review_status (
    branch_id TEXT PRIMARY KEY REFERENCES manuscript_branches(branch_id),
    restoration_id TEXT NOT NULL UNIQUE REFERENCES recovery_restorations(restoration_id),
    recovered_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    state TEXT NOT NULL CHECK(state IN ('awaiting-milestone-review', 'cleared-by-milestone')),
    created_at TEXT NOT NULL,
    cleared_at TEXT,
    cleared_by_milestone_id TEXT REFERENCES milestone_versions(milestone_id),
    CHECK(
      (state = 'awaiting-milestone-review' AND cleared_at IS NULL AND cleared_by_milestone_id IS NULL)
      OR (state = 'cleared-by-milestone' AND cleared_at IS NOT NULL AND cleared_by_milestone_id IS NOT NULL)
    )
  ) STRICT`,
  manuscript_reimport_comparisons: `CREATE TABLE manuscript_reimport_comparisons (
    comparison_id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    checkpoint_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    checkpoint_revision_label TEXT NOT NULL,
    checkpoint_revision_digest TEXT NOT NULL CHECK(length(checkpoint_revision_digest) = 64),
    checkpoint_journal_sequence INTEGER NOT NULL CHECK(checkpoint_journal_sequence >= 0),
    checkpoint_created_for_dirty_journal INTEGER NOT NULL CHECK(checkpoint_created_for_dirty_journal IN (0, 1)),
    lineage_status TEXT NOT NULL CHECK(lineage_status IN ('verified', 'unconfirmed')),
    lineage_source_version_id TEXT REFERENCES source_versions(source_version_id),
    lineage_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    lineage_revision_digest TEXT CHECK(lineage_revision_digest IS NULL OR length(lineage_revision_digest) = 64),
    comparison_kind TEXT NOT NULL CHECK(comparison_kind IN ('three-way', 'two-way')),
    staged_source_digest TEXT NOT NULL CHECK(length(staged_source_digest) = 64),
    staged_content_digest TEXT NOT NULL CHECK(length(staged_content_digest) = 64),
    staged_structure_digest TEXT NOT NULL CHECK(length(staged_structure_digest) = 64),
    staged_parser_identity TEXT NOT NULL,
    staged_block_count INTEGER NOT NULL CHECK(staged_block_count > 0),
    checkpoint_block_count INTEGER NOT NULL CHECK(checkpoint_block_count > 0),
    total_mappings INTEGER NOT NULL CHECK(total_mappings > 0),
    unresolved_mappings INTEGER NOT NULL CHECK(unresolved_mappings >= 0 AND unresolved_mappings <= total_mappings),
    changed_mappings INTEGER NOT NULL CHECK(changed_mappings >= 0 AND changed_mappings <= total_mappings),
    comparison_digest TEXT NOT NULL UNIQUE CHECK(length(comparison_digest) = 64),
    resolution_digest TEXT NOT NULL CHECK(length(resolution_digest) = 64),
    degradation_accepted INTEGER NOT NULL CHECK(degradation_accepted IN (0, 1)),
    created_at TEXT NOT NULL,
    CHECK(
      (lineage_status = 'verified' AND lineage_source_version_id IS NOT NULL
        AND lineage_revision_id IS NOT NULL AND comparison_kind = 'three-way')
      OR (lineage_status = 'unconfirmed' AND lineage_source_version_id IS NULL
        AND lineage_revision_id IS NULL AND comparison_kind = 'two-way')
    )
  ) STRICT`,
  manuscript_reimport_mapping_resolutions: `CREATE TABLE manuscript_reimport_mapping_resolutions (
    mapping_id TEXT PRIMARY KEY REFERENCES manuscript_reimport_mappings(mapping_id) ON DELETE CASCADE,
    comparison_id TEXT NOT NULL REFERENCES manuscript_reimport_comparisons(comparison_id) ON DELETE CASCADE,
    resolution TEXT NOT NULL CHECK(resolution IN
      ('preserve-current-identity', 'create-new-identity', 'retire-current-identity')),
    resolved_current_block_id TEXT REFERENCES manuscript_blocks(block_id),
    resolved_at TEXT NOT NULL,
    UNIQUE(comparison_id, resolved_current_block_id),
    CHECK((resolution = 'preserve-current-identity') = (resolved_current_block_id IS NOT NULL))
  ) STRICT`,
  manuscript_reimport_mappings: `CREATE TABLE manuscript_reimport_mappings (
    mapping_id TEXT PRIMARY KEY,
    comparison_id TEXT NOT NULL REFERENCES manuscript_reimport_comparisons(comparison_id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position > 0),
    change_kind TEXT NOT NULL CHECK(change_kind IN ('unchanged', 'move', 'edit', 'insert', 'delete')),
    current_block_id TEXT REFERENCES manuscript_blocks(block_id),
    current_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    current_position INTEGER CHECK(current_position IS NULL OR current_position > 0),
    lineage_block_id TEXT REFERENCES manuscript_blocks(block_id),
    lineage_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    lineage_position INTEGER CHECK(lineage_position IS NULL OR lineage_position > 0),
    staged_block_id TEXT,
    staged_draft_id TEXT,
    staged_position INTEGER CHECK(staged_position IS NULL OR staged_position > 0),
    identity_consequence TEXT CHECK(identity_consequence IS NULL OR identity_consequence IN
      ('preserve-current-identity', 'create-new-identity', 'retire-current-identity')),
    current_kind TEXT CHECK(current_kind IS NULL OR current_kind IN ('title', 'heading', 'paragraph', 'note')),
    current_level INTEGER,
    current_text TEXT,
    current_digest TEXT CHECK(current_digest IS NULL OR length(current_digest) = 64),
    lineage_kind TEXT CHECK(lineage_kind IS NULL OR lineage_kind IN ('title', 'heading', 'paragraph', 'note')),
    lineage_level INTEGER,
    lineage_text TEXT,
    lineage_digest TEXT CHECK(lineage_digest IS NULL OR length(lineage_digest) = 64),
    staged_kind TEXT CHECK(staged_kind IS NULL OR staged_kind IN ('title', 'heading', 'paragraph', 'note')),
    staged_level INTEGER,
    staged_text TEXT,
    staged_digest TEXT CHECK(staged_digest IS NULL OR length(staged_digest) = 64),
    resolved_changed INTEGER CHECK(resolved_changed IS NULL OR resolved_changed IN (0, 1)),
    UNIQUE(comparison_id, position),
    CHECK(current_block_id IS NOT NULL OR staged_block_id IS NOT NULL),
    CHECK((current_block_id IS NULL) = (current_kind IS NULL)),
    CHECK((current_block_id IS NULL) = (current_text IS NULL)),
    CHECK((current_block_id IS NULL) = (current_digest IS NULL)),
    CHECK((lineage_block_id IS NULL) = (lineage_kind IS NULL)),
    CHECK((lineage_block_id IS NULL) = (lineage_text IS NULL)),
    CHECK((lineage_block_id IS NULL) = (lineage_digest IS NULL)),
    CHECK((staged_block_id IS NULL) = (staged_kind IS NULL)),
    CHECK((staged_block_id IS NULL) = (staged_text IS NULL)),
    CHECK((staged_block_id IS NULL) = (staged_digest IS NULL)),
    CHECK(
      (change_kind = 'unchanged' AND current_block_id IS NOT NULL AND staged_block_id IS NOT NULL
        AND current_position = staged_position AND identity_consequence = 'preserve-current-identity')
      OR (change_kind = 'move' AND current_block_id IS NOT NULL AND staged_block_id IS NOT NULL
        AND current_position != staged_position AND identity_consequence = 'preserve-current-identity')
      OR (change_kind = 'edit' AND current_block_id IS NOT NULL AND staged_block_id IS NOT NULL
        AND identity_consequence IS NULL)
      OR (change_kind = 'insert' AND current_block_id IS NULL AND staged_block_id IS NOT NULL
        AND identity_consequence IS NULL)
      OR (change_kind = 'delete' AND current_block_id IS NOT NULL AND staged_block_id IS NULL
        AND identity_consequence IS NULL)
    )
  ) STRICT`,
  manuscript_reimport_records: `CREATE TABLE manuscript_reimport_records (
    reimport_record_id TEXT PRIMARY KEY,
    comparison_id TEXT NOT NULL UNIQUE REFERENCES manuscript_reimport_comparisons(comparison_id),
    commit_id TEXT NOT NULL UNIQUE,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
    provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
    previous_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    resulting_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    result_kind TEXT NOT NULL CHECK(result_kind IN ('changed', 'no-change')),
    result_label TEXT NOT NULL CHECK(result_label IN ('稿件已重新导入', '未发现稿件变化')),
    lineage_status TEXT NOT NULL CHECK(lineage_status IN ('verified', 'unconfirmed')),
    lineage_source_version_id TEXT REFERENCES source_versions(source_version_id),
    comparison_kind TEXT NOT NULL CHECK(comparison_kind IN ('three-way', 'two-way')),
    comparison_digest TEXT NOT NULL CHECK(length(comparison_digest) = 64),
    resolution_digest TEXT NOT NULL CHECK(length(resolution_digest) = 64),
    fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
    degradation_decision_id TEXT REFERENCES import_degradation_decisions(degradation_decision_id),
    record_digest TEXT NOT NULL UNIQUE CHECK(length(record_digest) = 64),
    imported_at TEXT NOT NULL,
    CHECK(
      (result_kind = 'changed' AND result_label = '稿件已重新导入' AND resulting_revision_id IS NOT NULL)
      OR (result_kind = 'no-change' AND result_label = '未发现稿件变化' AND resulting_revision_id IS NULL)
    ),
    CHECK(
      (lineage_status = 'verified' AND lineage_source_version_id IS NOT NULL AND comparison_kind = 'three-way')
      OR (lineage_status = 'unconfirmed' AND lineage_source_version_id IS NULL AND comparison_kind = 'two-way')
    )
  ) STRICT`,
  manuscript_replacement_matches: `CREATE TABLE manuscript_replacement_matches (
        preview_id TEXT NOT NULL REFERENCES manuscript_replacement_previews(preview_id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL CHECK(ordinal > 0),
        match_id TEXT NOT NULL,
        block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
        from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
        to_grapheme INTEGER NOT NULL CHECK(to_grapheme > from_grapheme),
        range_digest TEXT NOT NULL CHECK(length(range_digest) = 64),
        included INTEGER NOT NULL CHECK(included IN (0, 1)),
        PRIMARY KEY(preview_id, ordinal),
        UNIQUE(preview_id, match_id)
      ) STRICT`,
  manuscript_replacement_previews: `CREATE TABLE manuscript_replacement_previews (
        preview_id TEXT PRIMARY KEY,
        search_id TEXT NOT NULL REFERENCES manuscript_search_sessions(search_id),
        manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
        branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
        revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
        journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
        working_digest TEXT NOT NULL CHECK(length(working_digest) = 64),
        query TEXT NOT NULL,
        replacement TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('reviewing', 'frozen', 'committed', 'cancelled', 'failed')),
        total_matches INTEGER NOT NULL CHECK(total_matches > 0),
        included_matches INTEGER NOT NULL CHECK(included_matches >= 0),
        validated_ordinal INTEGER NOT NULL DEFAULT 0 CHECK(validated_ordinal >= 0),
        created_at TEXT NOT NULL,
        committed_at TEXT
      ) STRICT`,
  manuscript_revisions: `CREATE TABLE "manuscript_revisions" (
      revision_id TEXT PRIMARY KEY,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
      ordinal INTEGER NOT NULL CHECK(ordinal > 0),
      revision_label TEXT NOT NULL,
      parent_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
      source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
      revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
      created_at TEXT NOT NULL,
      UNIQUE(manuscript_id, ordinal),
      UNIQUE(manuscript_id, revision_label)
    ) STRICT`,
  manuscript_search_results: `CREATE TABLE manuscript_search_results (
        search_id TEXT NOT NULL REFERENCES manuscript_search_sessions(search_id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL CHECK(ordinal > 0),
        match_id TEXT NOT NULL,
        block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
        from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
        to_grapheme INTEGER NOT NULL CHECK(to_grapheme > from_grapheme),
        global_character INTEGER NOT NULL CHECK(global_character >= 0),
        heading_label TEXT NOT NULL,
        context TEXT NOT NULL,
        range_digest TEXT NOT NULL CHECK(length(range_digest) = 64),
        PRIMARY KEY(search_id, ordinal),
        UNIQUE(search_id, match_id)
      ) STRICT`,
  manuscript_search_sessions: `CREATE TABLE manuscript_search_sessions (
        search_id TEXT PRIMARY KEY,
        manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
        branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
        revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
        journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
        working_digest TEXT NOT NULL CHECK(length(working_digest) = 64),
        query TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('running', 'completed', 'cancelled', 'failed')),
        scanned_position INTEGER NOT NULL DEFAULT 0 CHECK(scanned_position >= 0),
        total_blocks INTEGER NOT NULL CHECK(total_blocks > 0),
        total_matches INTEGER NOT NULL DEFAULT 0 CHECK(total_matches >= 0),
        created_at TEXT NOT NULL,
        completed_at TEXT
      ) STRICT`,
  milestone_signoff_records: `CREATE TABLE milestone_signoff_records (
      signoff_record_id TEXT PRIMARY KEY,
      milestone_id TEXT NOT NULL UNIQUE REFERENCES milestone_versions(milestone_id),
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
      revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
      workflow_instance_id TEXT NOT NULL REFERENCES workflow_instances(workflow_instance_id),
      workflow_evidence_digest TEXT NOT NULL CHECK(length(workflow_evidence_digest) = 64),
      actor TEXT NOT NULL CHECK(actor = '本机编辑'),
      signed_at TEXT NOT NULL,
      label TEXT NOT NULL,
      stated_next_use TEXT NOT NULL
    ) STRICT`,
  milestone_versions: `CREATE TABLE milestone_versions (
        milestone_id TEXT PRIMARY KEY,
        manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
        branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
        revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
        label TEXT NOT NULL,
        purpose TEXT NOT NULL,
        note TEXT,
        actor TEXT NOT NULL CHECK(actor = '本机编辑'),
        created_at TEXT NOT NULL,
        UNIQUE(branch_id, label)
      ) STRICT`,
  recovery_attention: `CREATE TABLE recovery_attention (
    attention_id TEXT PRIMARY KEY,
    interrupted_lifetime_id TEXT NOT NULL REFERENCES service_lifetimes(lifetime_id),
    book_id TEXT NOT NULL REFERENCES books(book_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    checkpoint_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    checkpoint_sequence INTEGER NOT NULL CHECK(checkpoint_sequence >= 0),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence > checkpoint_sequence),
    journal_working_digest TEXT NOT NULL CHECK(length(journal_working_digest) = 64),
    last_durable_at TEXT NOT NULL,
    journal_entry_count INTEGER NOT NULL CHECK(journal_entry_count > 0),
    journal_reconstruction_verified_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'deferred', 'resolved')),
    attention_version INTEGER NOT NULL CHECK(attention_version >= 1),
    created_at TEXT NOT NULL,
    deferred_at TEXT,
    resolved_at TEXT,
    CHECK(
      (status = 'pending' AND deferred_at IS NULL AND resolved_at IS NULL)
      OR (status = 'deferred' AND deferred_at IS NOT NULL AND resolved_at IS NULL)
      OR (status = 'resolved' AND resolved_at IS NOT NULL)
    )
  ) STRICT`,
  recovery_decisions: `CREATE TABLE recovery_decisions (
    decision_id TEXT PRIMARY KEY,
    attention_id TEXT NOT NULL REFERENCES recovery_attention(attention_id),
    attention_version INTEGER NOT NULL CHECK(attention_version >= 1),
    kind TEXT NOT NULL CHECK(kind IN ('view', 'defer', 'restore')),
    selected_kind TEXT CHECK(selected_kind IS NULL OR selected_kind IN ('journal', 'checkpoint', 'snapshot')),
    selected_snapshot_id TEXT REFERENCES recovery_snapshots(snapshot_id),
    request_fingerprint TEXT NOT NULL CHECK(length(request_fingerprint) = 64),
    decided_at TEXT NOT NULL,
    CHECK(
      (kind = 'defer' AND selected_kind IS NULL AND selected_snapshot_id IS NULL)
      OR (kind IN ('view', 'restore') AND selected_kind IS NOT NULL)
    ),
    CHECK(
      (selected_kind = 'snapshot' AND selected_snapshot_id IS NOT NULL)
      OR (selected_kind IS NULL OR selected_kind != 'snapshot') AND selected_snapshot_id IS NULL
    )
  ) STRICT`,
  recovery_restorations: `CREATE TABLE recovery_restorations (
    restoration_id TEXT PRIMARY KEY,
    decision_id TEXT NOT NULL UNIQUE REFERENCES recovery_decisions(decision_id),
    attention_id TEXT NOT NULL UNIQUE REFERENCES recovery_attention(attention_id),
    selected_kind TEXT NOT NULL CHECK(selected_kind IN ('journal', 'checkpoint', 'snapshot')),
    selected_snapshot_id TEXT REFERENCES recovery_snapshots(snapshot_id),
    source_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    source_working_digest TEXT NOT NULL CHECK(length(source_working_digest) = 64),
    pre_restore_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    pre_restore_journal_sequence INTEGER NOT NULL CHECK(pre_restore_journal_sequence >= 0),
    pre_restore_working_digest TEXT NOT NULL CHECK(length(pre_restore_working_digest) = 64),
    journal_candidate_digest TEXT NOT NULL CHECK(length(journal_candidate_digest) = 64),
    checkpoint_candidate_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    snapshot_candidate_id TEXT REFERENCES recovery_snapshots(snapshot_id),
    descendant_revision_id TEXT NOT NULL UNIQUE REFERENCES manuscript_revisions(revision_id),
    created_at TEXT NOT NULL,
    CHECK(
      (selected_kind = 'snapshot' AND selected_snapshot_id IS NOT NULL)
      OR (selected_kind != 'snapshot' AND selected_snapshot_id IS NULL)
    )
  ) STRICT`,
  recovery_restore_stage_blocks: `CREATE TABLE recovery_restore_stage_blocks (
    attention_id TEXT NOT NULL REFERENCES recovery_restore_stages(attention_id) ON DELETE CASCADE,
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph', 'note')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    grapheme_length INTEGER NOT NULL CHECK(grapheme_length >= 0),
    PRIMARY KEY(attention_id, position),
    UNIQUE(attention_id, block_id)
  ) STRICT`,
  recovery_restore_stages: `CREATE TABLE recovery_restore_stages (
    attention_id TEXT PRIMARY KEY REFERENCES recovery_attention(attention_id) ON DELETE CASCADE,
    selected_snapshot_id TEXT NOT NULL REFERENCES recovery_snapshots(snapshot_id),
    expected_attention_version INTEGER NOT NULL CHECK(expected_attention_version >= 1),
    expected_block_count INTEGER NOT NULL CHECK(expected_block_count > 0),
    expected_total_graphemes INTEGER NOT NULL CHECK(expected_total_graphemes >= 0),
    started_at TEXT NOT NULL
  ) STRICT`,
  recovery_snapshots: `CREATE TABLE recovery_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    milestone_id TEXT NOT NULL UNIQUE REFERENCES milestone_versions(milestone_id),
    book_id TEXT NOT NULL REFERENCES books(book_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    revision_label TEXT NOT NULL,
    revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
    object_digest TEXT NOT NULL CHECK(length(object_digest) = 64),
    manifest_digest TEXT NOT NULL CHECK(length(manifest_digest) = 64),
    object_relative_key TEXT NOT NULL UNIQUE,
    byte_length INTEGER NOT NULL CHECK(byte_length > 0),
    block_count INTEGER NOT NULL CHECK(block_count > 0),
    total_graphemes INTEGER NOT NULL CHECK(total_graphemes >= 0),
    created_at TEXT NOT NULL,
    verified_at TEXT NOT NULL
  ) STRICT`,
  service_lifetime_branch_writes: `CREATE TABLE service_lifetime_branch_writes (
    lifetime_id TEXT NOT NULL REFERENCES service_lifetimes(lifetime_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    checkpoint_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    checkpoint_sequence INTEGER NOT NULL CHECK(checkpoint_sequence >= 0),
    reconstruction_base_sequence INTEGER NOT NULL CHECK(reconstruction_base_sequence >= checkpoint_sequence),
    reconstruction_base_digest TEXT NOT NULL CHECK(length(reconstruction_base_digest) = 64),
    high_water_sequence INTEGER NOT NULL CHECK(high_water_sequence > reconstruction_base_sequence),
    high_water_digest TEXT NOT NULL CHECK(length(high_water_digest) = 64),
    last_durable_at TEXT NOT NULL,
    entry_count INTEGER NOT NULL CHECK(entry_count > 0),
    CHECK(entry_count = high_water_sequence - reconstruction_base_sequence),
    PRIMARY KEY(lifetime_id, branch_id)
  ) STRICT`,
  service_lifetimes: `CREATE TABLE service_lifetimes (
    lifetime_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    outcome TEXT NOT NULL CHECK(outcome IN ('running', 'clean', 'interrupted')),
    CHECK(
      (outcome = 'running' AND ended_at IS NULL)
      OR (outcome IN ('clean', 'interrupted') AND ended_at IS NOT NULL)
    )
  ) STRICT`,
  source_import_records: `CREATE TABLE source_import_records (
  source_import_record_id TEXT PRIMARY KEY,
  commit_id TEXT NOT NULL UNIQUE,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
  provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
  target_kind TEXT NOT NULL CHECK(target_kind IN ('new-book', 'existing-book')),
  source_version_disposition TEXT NOT NULL CHECK(source_version_disposition IN ('created', 'reused-same-book')),
  retained_boundary_json TEXT NOT NULL,
  named_non_effects_json TEXT NOT NULL,
  record_digest TEXT NOT NULL UNIQUE CHECK(length(record_digest) = 64),
  imported_at TEXT NOT NULL
) STRICT`,
  source_provenance: `CREATE TABLE source_provenance (
  provenance_id TEXT PRIMARY KEY,
  source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
  acquisition_path TEXT NOT NULL CHECK(acquisition_path = 'native-file-picker'),
  locality TEXT NOT NULL CHECK(locality = 'local-provider-free'),
  sanitized_identity TEXT NOT NULL,
  parser_identity TEXT,
  recorded_at TEXT NOT NULL
) STRICT`,
  source_versions: `CREATE TABLE source_versions (
  source_version_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
  source_digest TEXT NOT NULL CHECK(length(source_digest) = 64),
  content_digest TEXT CHECK(content_digest IS NULL OR length(content_digest) = 64),
  structure_digest TEXT CHECK(structure_digest IS NULL OR length(structure_digest) = 64),
  parser_identity TEXT,
  format TEXT NOT NULL CHECK(format IN ('DOCX', 'DOC', 'PDF', 'ODT', 'RTF', 'TXT', 'MD', 'UNKNOWN')),
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL, working_object_digest TEXT REFERENCES content_objects(object_digest), converter_identity TEXT,
  CHECK((content_digest IS NULL) = (structure_digest IS NULL) AND (structure_digest IS NULL) = (parser_identity IS NULL)),
  UNIQUE(book_id, source_digest)
) STRICT`,
  staged_import_blocks: `CREATE TABLE staged_import_blocks (
      draft_id TEXT NOT NULL REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
      staged_block_id TEXT NOT NULL,
      position INTEGER NOT NULL CHECK(position > 0),
      kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph', 'note')),
      level INTEGER,
      text TEXT NOT NULL,
      digest TEXT NOT NULL CHECK(length(digest) = 64), start_offset INTEGER NOT NULL DEFAULT 0 CHECK(start_offset >= 0), grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0),
      PRIMARY KEY(draft_id, position),
      UNIQUE(draft_id, staged_block_id)
    ) STRICT`,
  staged_import_snapshots: `CREATE TABLE staged_import_snapshots (
      draft_id TEXT PRIMARY KEY REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
      parser_identity TEXT NOT NULL,
      source_digest TEXT NOT NULL CHECK(length(source_digest) = 64),
      content_digest TEXT NOT NULL CHECK(length(content_digest) = 64),
      structure_digest TEXT NOT NULL CHECK(length(structure_digest) = 64),
      block_count INTEGER NOT NULL CHECK(block_count > 0),
      fidelity_json TEXT NOT NULL,
      title_suggestion TEXT NOT NULL,
      title_source TEXT NOT NULL,
      snapshot_created_at TEXT NOT NULL
    , character_count INTEGER NOT NULL DEFAULT 0 CHECK(character_count >= 0)) STRICT`,
  workflow_instances: `CREATE TABLE "workflow_instances" (
        workflow_instance_id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(book_id),
        manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
        profile_id TEXT NOT NULL,
        profile_version TEXT NOT NULL,
        profile_digest TEXT NOT NULL CHECK(length(profile_digest) = 64),
        native_profile_id TEXT NOT NULL,
        native_profile_version TEXT NOT NULL,
        native_profile_digest TEXT NOT NULL CHECK(length(native_profile_digest) = 64),
        current_phase TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state = 'active'),
        created_at TEXT NOT NULL,
        FOREIGN KEY(profile_id, profile_version) REFERENCES "workflow_profiles"(profile_id, profile_version)
      ) STRICT`,
  workflow_profiles: `CREATE TABLE "workflow_profiles" (
        profile_id TEXT NOT NULL,
        profile_version TEXT NOT NULL,
        profile_name TEXT NOT NULL,
        profile_digest TEXT NOT NULL CHECK(length(profile_digest) = 64),
        projection_schema TEXT NOT NULL CHECK(projection_schema = 'ai7.workflow-profile-projection/1'),
        projection_json TEXT NOT NULL,
        native_profile_id TEXT NOT NULL,
        native_profile_version TEXT NOT NULL,
        native_profile_digest TEXT NOT NULL CHECK(length(native_profile_digest) = 64),
        PRIMARY KEY(profile_id, profile_version)
      ) STRICT`,
  working_blocks: `CREATE TABLE working_blocks (
      branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
      block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
      order_key INTEGER NOT NULL CHECK(order_key > 0),
      kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph', 'note')),
      level INTEGER,
      text TEXT NOT NULL,
      digest TEXT NOT NULL CHECK(length(digest) = 64), grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0),
      PRIMARY KEY(branch_id, block_id),
      UNIQUE(branch_id, order_key)
    ) STRICT`,
  // The page summary of the working state's order (Issue #1654, ADR 0105 §6): `manuscript/working-positions.ts` owns it.
  working_pages: `CREATE TABLE working_pages (
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    first_order_key INTEGER NOT NULL CHECK(first_order_key >= 0),
    block_count INTEGER NOT NULL CHECK(block_count BETWEEN 1 AND 512),
    grapheme_total INTEGER NOT NULL CHECK(grapheme_total >= 0),
    PRIMARY KEY(branch_id, first_order_key)
  ) STRICT`,
} as const;

/** The trigram index of working-block text; SQLite creates its five shadow tables with it. */
export const TARGET_VIRTUAL_TABLE_SQL = `CREATE VIRTUAL TABLE working_block_search USING fts5(
        branch_id UNINDEXED,
        block_id UNINDEXED,
        text,
        tokenize='trigram'
      )`;

/** The five shadow tables SQLite creates with the trigram index: checked, never created by hand. */
export const SEARCH_SHADOW_SCHEMA_SQL = {
  working_block_search_config: "CREATE TABLE 'working_block_search_config'(k PRIMARY KEY, v) WITHOUT ROWID",
  working_block_search_content: "CREATE TABLE 'working_block_search_content'(id INTEGER PRIMARY KEY, c0, c1, c2)",
  working_block_search_data: "CREATE TABLE 'working_block_search_data'(id INTEGER PRIMARY KEY, block BLOB)",
  working_block_search_docsize: "CREATE TABLE 'working_block_search_docsize'(id INTEGER PRIMARY KEY, sz BLOB)",
  working_block_search_idx: "CREATE TABLE 'working_block_search_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID",
} as const;

export const CORE_INDEX_SQL = {
  book_internal_number_unique: `CREATE UNIQUE INDEX book_internal_number_unique ON books(internal_number) WHERE internal_number IS NOT NULL`,
  command_history_state: `CREATE INDEX command_history_state ON manuscript_command_groups(branch_id, status, ordinal)`,
  import_attempts_recovery_order: `CREATE INDEX import_attempts_recovery_order
        ON import_commit_attempts(state, completion_acknowledged_at, prepared_at)`,
  journal_branch_order: `CREATE INDEX journal_branch_order ON edit_journal_entries(branch_id, sequence)`,
  lifetime_outcome_order: `CREATE INDEX lifetime_outcome_order ON service_lifetimes(outcome, started_at)`,
  recovery_attention_startup: `CREATE INDEX recovery_attention_startup ON recovery_attention(status, created_at, attention_id)`,
  recovery_snapshot_branch: `CREATE INDEX recovery_snapshot_branch ON recovery_snapshots(branch_id, revision_id, created_at DESC, snapshot_id DESC)`,
  reimport_mappings_page: `CREATE INDEX reimport_mappings_page
        ON manuscript_reimport_mappings(comparison_id, position)`,
  replacement_matches_block: `CREATE INDEX replacement_matches_block ON manuscript_replacement_matches(preview_id, included, block_id, from_grapheme)`,
  revision_reimport_identity: `CREATE INDEX revision_reimport_identity
        ON manuscript_block_versions(revision_id, digest, kind, level)`,
  staged_reimport_identity: `CREATE INDEX staged_reimport_identity
        ON staged_import_blocks(draft_id, digest, kind, level)`,
  working_blocks_order_cover: `CREATE INDEX working_blocks_order_cover ON working_blocks(branch_id, order_key, grapheme_length)`,
} as const;

/** The import abandonment-cleanup fence and the import-result exclusivity guards: each keeps its own text and message. */
export const CORE_TRIGGER_SQL = {
  abandonment_cleanup_block_attempt_insert: `CREATE TRIGGER abandonment_cleanup_block_attempt_insert
  BEFORE INSERT ON import_commit_attempts
  WHEN EXISTS (SELECT 1 FROM import_abandonment_cleanup_intents i WHERE i.draft_id = NEW.draft_id)
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END`,
  abandonment_cleanup_block_attempt_update_v5: `CREATE TRIGGER abandonment_cleanup_block_attempt_update_v5
  BEFORE UPDATE ON import_commit_attempts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END`,
  abandonment_cleanup_block_commit_insert: `CREATE TRIGGER abandonment_cleanup_block_commit_insert
  BEFORE INSERT ON import_commits
  WHEN EXISTS (SELECT 1 FROM import_abandonment_cleanup_intents i WHERE i.draft_id = NEW.draft_id)
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END`,
  abandonment_cleanup_block_commit_update_v5: `CREATE TRIGGER abandonment_cleanup_block_commit_update_v5
  BEFORE UPDATE ON import_commits
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END`,
  abandonment_cleanup_block_content_object_update: `CREATE TRIGGER abandonment_cleanup_block_content_object_update
  BEFORE UPDATE ON content_objects
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = OLD.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END`,
  abandonment_cleanup_block_content_object_update_v5: `CREATE TRIGGER abandonment_cleanup_block_content_object_update_v5
  BEFORE UPDATE ON content_objects
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END`,
  abandonment_cleanup_block_draft_insert: `CREATE TRIGGER abandonment_cleanup_block_draft_insert
  BEFORE INSERT ON import_drafts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END`,
  abandonment_cleanup_block_draft_update: `CREATE TRIGGER abandonment_cleanup_block_draft_update
  BEFORE UPDATE ON import_drafts
  WHEN EXISTS (SELECT 1 FROM import_abandonment_cleanup_intents i WHERE i.draft_id = OLD.draft_id)
    OR EXISTS (SELECT 1 FROM import_abandonment_cleanup_intents i WHERE i.object_digest = NEW.object_digest)
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END`,
  abandonment_cleanup_block_draft_update_v5: `CREATE TRIGGER abandonment_cleanup_block_draft_update_v5
  BEFORE UPDATE ON import_drafts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
      OR i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END`,
  abandonment_cleanup_block_source_insert: `CREATE TRIGGER abandonment_cleanup_block_source_insert
  BEFORE INSERT ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END`,
  abandonment_cleanup_block_source_update: `CREATE TRIGGER abandonment_cleanup_block_source_update
  BEFORE UPDATE OF object_digest ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END`,
  abandonment_cleanup_block_source_update_v5: `CREATE TRIGGER abandonment_cleanup_block_source_update_v5
  BEFORE UPDATE ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END`,
  abandonment_cleanup_validate_insert: `CREATE TRIGGER abandonment_cleanup_validate_insert
  BEFORE INSERT ON import_abandonment_cleanup_intents
  WHEN NOT EXISTS (
      SELECT 1
      FROM import_drafts d
      JOIN content_objects co ON co.object_digest = d.object_digest
      WHERE d.draft_id = NEW.draft_id
        AND d.state IN ('staged', 'reviewed')
        AND d.draft_version = NEW.expected_draft_version
        AND d.object_digest = NEW.object_digest
        AND co.relative_key = NEW.relative_key
    )
    OR EXISTS (SELECT 1 FROM source_versions sv WHERE sv.object_digest = NEW.object_digest)
    OR (SELECT count(*) FROM import_drafts d WHERE d.object_digest = NEW.object_digest) != 1
    OR EXISTS (SELECT 1 FROM import_commits c WHERE c.draft_id = NEW.draft_id)
    OR EXISTS (
      SELECT 1 FROM import_commit_attempts a
      WHERE a.draft_id = NEW.draft_id AND a.state != 'prepared'
    )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_INVALID');
  END`,
  abandonment_cleanup_validate_intent_update_v5: `CREATE TRIGGER abandonment_cleanup_validate_intent_update_v5
  BEFORE UPDATE ON import_abandonment_cleanup_intents
  WHEN NEW.draft_id != OLD.draft_id
    OR NEW.object_digest != OLD.object_digest
    OR NEW.expected_draft_version != OLD.expected_draft_version
    OR NEW.relative_key != OLD.relative_key
    OR NEW.requested_at != OLD.requested_at
    OR NOT (
      (
        OLD.state = 'prepared' AND OLD.bytes_removed_at IS NULL
        AND NEW.state = 'bytes-removed' AND NEW.bytes_removed_at IS NOT NULL
      )
      OR (
        OLD.state = 'bytes-removed' AND NEW.state = 'bytes-removed'
        AND NEW.bytes_removed_at = OLD.bytes_removed_at
      )
    )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_INTENT_IMMUTABLE');
  END`,
  manuscript_import_record_excludes_reimport_result: `CREATE TRIGGER manuscript_import_record_excludes_reimport_result
      BEFORE INSERT ON manuscript_import_records
      WHEN EXISTS (SELECT 1 FROM manuscript_reimport_records WHERE commit_id = NEW.commit_id)
      BEGIN
        SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
      END`,
  manuscript_import_record_excludes_source_result: `CREATE TRIGGER manuscript_import_record_excludes_source_result
  BEFORE INSERT ON manuscript_import_records
  WHEN EXISTS (SELECT 1 FROM source_import_records WHERE commit_id = NEW.commit_id)
  BEGIN
    SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
  END`,
  reimport_record_excludes_other_results: `CREATE TRIGGER reimport_record_excludes_other_results
      BEFORE INSERT ON manuscript_reimport_records
      WHEN EXISTS (SELECT 1 FROM manuscript_import_records WHERE commit_id = NEW.commit_id)
        OR EXISTS (SELECT 1 FROM source_import_records WHERE commit_id = NEW.commit_id)
      BEGIN
        SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
      END`,
  source_import_record_excludes_manuscript_result: `CREATE TRIGGER source_import_record_excludes_manuscript_result
  BEFORE INSERT ON source_import_records
  WHEN EXISTS (SELECT 1 FROM manuscript_import_records WHERE commit_id = NEW.commit_id)
  BEGIN
    SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
  END`,
  source_import_record_excludes_reimport_result: `CREATE TRIGGER source_import_record_excludes_reimport_result
      BEFORE INSERT ON source_import_records
      WHEN EXISTS (SELECT 1 FROM manuscript_reimport_records WHERE commit_id = NEW.commit_id)
      BEGIN
        SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
      END`,
} as const;
