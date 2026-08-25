# Compare reimports without inventing source lineage

AI7 compares a staged external document with the exact current Manuscript Revision and uses a prior Book-owned Source Version as a third state only when exact lineage proves that common source. When lineage is not proven, the comparison is explicitly `来源关系未确认` and remains two-way; it may preserve only exact unambiguous structural mappings and cannot infer ancestry from filename, location, timestamp, or similarity. A changed result creates a descendant revision and a provenance-bearing Manuscript Reimport Record, while a completed no-change comparison records that outcome without manufacturing an empty revision. This closes the general reimport semantic gap left by ADR 0006 while preserving honest manuscript history.

## Considered options

Always using two-way comparison would discard useful verified source lineage; blocking every unverified reimport would reject ordinary external-editing workflows; and assuming the latest imported file as a common ancestor would silently invent provenance and structural identity.
