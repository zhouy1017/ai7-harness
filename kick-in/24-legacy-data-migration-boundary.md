# Legacy Data Migration Boundary

Status: **accepted after Question 22**

## Decision

The new AI7 starts with an empty production business store. It does **not** import real production data from AI7 Reborn.

Only three explicitly reviewed categories may cross the legacy boundary:

1. user-selected API credentials transferred directly into the new Protected Secret Store;
2. reviewed mock-LLM-provider generators, fixtures, sanitized cassettes, and expected cases; and
3. explicitly selected testing sample Books.

This is an allowlist, not a starting point for a general migration framework. Anything not listed is excluded unless a later explicit decision revises this boundary.

## Production-data migration exclusion

Do not import:

- production Books, manuscripts, Source Versions, Manuscript Revisions, branches, journals, checkpoints, recovery snapshots, or Word associations;
- generated deliverables, Q&A conversations/turns, annotations, proposals, findings, reviews, comments, or delivery packages;
- indexes, chunks, embeddings, vector stores, search caches, or Library mirrors;
- Task Intents, Run Records, legacy Operations/`operationRuns`, events, diagnostics, plans, approvals, decisions, Effects, receipts, or workflow state;
- House Editorial Memory, Series Knowledge, learning candidates, Learning Lineage, audit history, eligibility decisions, feedback, or policy activation history;
- old UI state, window/layout preferences, activity feeds, release state, local-service state, or generic application configuration; or
- raw/private live-provider request/response logs or recordings, telemetry exports, crash dumps, or temporary working directories. A reviewed, normalized, public-synthetic, sanitized replay cassette may qualify only under the mock-provider evidence exception below.

The old repository and old product data remain untouched. This decision does not authorize deletion, cleanup, conversion in place, or public release.

## Exception 1 — protected API credential transfer

The purpose is to avoid making the user reconfigure every model service while preserving the accepted credential boundary.

At the audited pin, non-secret provider configuration lives under `%LOCALAPPDATA%\AI7\data\projects.json` while actual secrets normally use Windows Credential Manager targets named `AI7/secret-ref:*`. Historical reference material also documents plaintext key files and portable `Data/ai7.config.json` test keys. Never copy the containing configuration/store/ZIP: protected entries may follow the transfer below, while any key found only in plaintext, an environment variable, or a portable/export artifact must be re-enrolled and should be rotated.

Preferred flow:

1. The user selects an old provider credential identity to transfer.
2. A local migration utility resolves it only through the old Windows-protected credential mechanism under the current user identity.
3. The utility immediately writes the value into a distinct versioned new-AI7 Protected Secret Store namespace through the new Credential Broker; it does not reuse the old `AI7/` reference identity.
4. The new system persists only a new Credential Reference and non-secret provider metadata.
5. The utility reports success/failure without displaying, logging, exporting, copying to clipboard, or writing the secret to a repository/configuration file.
6. If protected resolution cannot be proven, the user performs **Credential Re-enrollment / 凭据重新登记** by entering the credential again; insecure fallback is prohibited.

The transfer is user-initiated, local, provider-by-provider, and independently revocable. It does not import the old Credential Reference, provider plans, custom endpoint URLs, fallback chains, outbound-data permissions, budgets, adapter versions, preferences, scopes, or prior authorization. Every new Provider Binding and Provider Resolution Plan is rebuilt under trusted new adapters and policies; a custom endpoint requires separate review.

API keys are the only secret-value category permitted by this exception. GitHub tokens, signing keys, certificates, installer secrets, external-service sessions, and unrelated application credentials remain excluded unless separately accepted.

## Exception 2 — mock-provider evidence

Eligible **Mock-provider Evidence Migration / 模拟模型服务证据迁移** assets are:

- deterministic mock-provider generator definitions;
- request/response fixture schemas;
- generated synthetic cases and expected results;
- sanitized cassette fixtures that contain no credential, production manuscript text, personal information, or raw provider payload; and
- the tests and provenance metadata needed to regenerate or verify those cases.

Every migrated asset must record the old path, exact source SHA, content digest, sanitization review, license/reuse authority, new destination, and whether it is copied, adapted, or regenerated. Prefer regeneration against the new contract when old fixtures encode obsolete request shapes.

AI7 Reborn has no declared repository license at the pin. Question 27 resolved the authority question: the owner is the sole rights-holder and has authorized reuse of its assets for AI7, so fixture copying is permitted under the provenance rules. Sanitized live-provider-derived output still requires a provider-terms redistribution check; existing schema/sanitization validators do not prove authorship, licensing, exhaustive personal-data removal, or redistribution rights, and rights-holder authorization does not substitute for a provider's own terms.

The initial closed candidate inventory is limited to the three `tests/fixtures/model-generation/public-synthetic-*-v*.json` corpus/cassette assets, the five named `tests/fixtures/provider-responses/{annotation,review,source-grounded-qa,summary,writing-generation}.json` response-shape fixtures when still useful, and the directly supporting provider generation/recording/validation scripts listed in [Retained Development Workflows](./09-retained-development-workflows.md). The bootstrap cassette is migration-only/non-promotable. Never migrate `tests/fixtures/**` wholesale: legacy workflow and manuscript-merge `projects.json` fixtures are excluded stores, not mock-provider evidence.

Mock evidence remains provider-free test input. It never proves live-provider compatibility, production editorial quality, current model behavior, or permission to send any Book content externally.

The legacy `public-synthetic-corpus-v1.json` must not be byte-copied merely because its text is synthetic: its generated byte length was deliberately tied to a private sample document. Regenerate that corpus under a new public ID and independently chosen fixed public size, then refresh cassette fingerprints, unless the exact source sample Book is separately selected and the metadata linkage is explicitly accepted.

## Exception 3 — selected testing sample Books

### Authorization and the local-only constraint

Accepted at Question 27: the existing sample Books are **real manuscripts**, and the owner holds authorization to use them for the AI7 project. The constraint governs **persistence and publication, not processing**.

**Processing is permitted.** Sending manuscript content to a configured model provider is a normal, intended AI7 function — it is the basic feature of the product, not an exception requiring separate justification. It is controlled processing under the Provider Processing Policy and the Plan Envelope's declared Outbound Data Category. A configured model call is not public release and never becomes one.

**Storage in a repository is prohibited, and private visibility does not cure it.** A sample manuscript:

- never enters any repository, public or private, in history or working tree. They are git-ignored in all three legacy repositories today with zero tracked files; keep it that way. This design room excludes manuscript formats by pattern in `.gitignore`;
- never enters hosted CI, a hosted runner, a build artifact, a distributable fixture, or the shipped product;
- never becomes mock-provider evidence, and never contributes a corpus, cassette, or fingerprint. Provider Rehearsal accepts public-synthetic inputs only;
- is never a substitute for the regenerated public-synthetic corpus; and
- carries no redistribution right, and reaches no public channel without Public Release Permission.

Authorization to use and to process is not authorization to store, publish, or redistribute. The accepted Question 21 rule still holds structurally — a Run Source Scope does not by itself confer transmission authority — but for manuscripts that authority is granted by the Provider Processing Policy as a matter of ordinary product function.

### Eligibility

**Selected Test Sample Book Migration / 选定测试样例书稿迁移** is explicit per asset. A sample is eligible only when the owner selects it and its provenance is one of:

- synthetic content created for testing;
- public material whose testing and redistribution rights are documented; or
- non-production material the owner is authorized to use as a private test fixture.

For each selected sample, record a non-secret source identity, digest, provenance/authorization, intended test scenarios, expected privacy treatment, and whether redistribution is permitted. Keep private absolute source paths local. Review or strip DOCX metadata, comments, tracked changes, embedded objects, custom XML, external links, and personal/path data, then import through the new Book/source contract with a new Book identity rather than copying an old database record or Book ID.

Testing sample Books are marked test-only. By default they:

- do not enter the production Working Corpus, House Editorial Memory, Series Corpus, or Learning Eligibility pipeline;
- do not inherit legacy decisions, annotations, indexes, embeddings, histories, or outcomes;
- do not grant Public Release Permission; and
- cannot silently become a production Book without an explicit reclassification/import action and fresh source provenance.

## Source code and design evidence are different

This data boundary does not prevent the planning process from learning semantics, tests, or architectural evidence from the pinned source repository. Future implementation may selectively rewrite or adapt authorized source assets under the provenance rules, but that is source migration—not production-data migration.

Likewise, accepted design terms and ADRs are new-project decisions. They are not imported legacy runtime records.

## Implementation consequences

- Do not build a general `projects.json`, database, Run/Operation, vector-index, memory, or Book-history importer.
- Build three narrow transfer paths at most: protected credential transfer/re-enrollment, mock-evidence intake, and selected test-Book intake.
- Start all new Harness Sessions, Task Ledger records, workflows, manuscript histories, and learning records fresh.
- Make the default migration scan report excluded categories without copying them.
- Required CI uses only redistributable reviewed mock evidence and synthetic/public/explicitly redistribution-authorized test Books; private selected Books remain local-only and no secret is needed.
- A user-authorized live-provider preflight may verify a transferred Credential Reference separately from CI without logging model content.

## Acceptance evidence for future implementation

The migration boundary is proven when tests demonstrate:

- a migrated secret never appears in files, logs, prompts, Session events, tool results, diagnostics, process arguments, or repository history;
- failed protected transfer requires re-enrollment and has no plaintext fallback;
- only selected mock assets and sample Books cross an allowlist gate;
- production Books and every excluded record family remain absent;
- mock fixtures pass secret/private-text scanning and retain source provenance;
- sample Books remain test-only and Learning-ineligible by default; and
- the old installation and old data are unchanged.
