# Phase 0 Exit Review

Status: **historical 2026-08-21 result: not passed; product scope and consistency contract were later resolved by ADR 0028**

Review date: 2026-08-21

Decision source: owner instruction recorded in [issue #1](https://github.com/zhouy1017/ai7-harness/issues/1)

Authority: `AGENTS.md` and accepted ADRs outrank this audit.

Freeze status: this audit is part of the v1 candidate/reference branch based on
`c8cbe26`; it is not canonical `main` and does not decide the separate v2
architecture line.

> Supersession note (2026-08-25): the owner has since unified product scope as one Windows-and-macOS product in [ADR 0028](../docs/adr/0028-support-windows-and-macos-as-one-product.md). The proof and multi-gate programme below is also superseded by [ADR 0027](../docs/adr/0027-concentrate-ci-on-e2e-functionality.md). This document remains a dated audit record, not a current blocker list.

## Result

The 36-question design interview is complete. All 36 decision-map rows have an accepted or explicitly deferred answer, and Question 16's former “mostly okay” ambiguity is now closed by the owner's explicit acceptance of all five content/evidence rules.

At the review date, Phase 0 could not pass. The owner had changed the supported product target from Windows-only to Windows and macOS, while the exact consistency contract and several macOS/platform-pair mechanics were still open. ADR 0028 later accepted the consistency contract and explicitly deferred the concrete macOS mechanics without reopening product scope.

No product implementation, scaffold, dependency install, CI workflow, PRD, or issue decomposition is authorized by this review.

## Question 16 — passed

The accepted rules are now explicit in `AGENTS.md`, ADR 0005, the Factual Verification Policy, the Editorial context, and the source–generation–grounding design:

1. Exact quotations require Quotation Verification against authoritative original text.
2. Source-derived factual claims require cited Evidence Links.
3. Current or external factual claims require timestamped research evidence.
4. Editorial interpretations are identified as judgment rather than fact.
5. Creative or promotional synthesis remains generated text, while each quoted, factual, or canonical subclaim follows its own evidence class.

This preserves the governing distinction: a Textual Source of Record proves what text says, not whether the assertion is true.

## Preserved accepted decisions

The platform expansion does not reopen:

- Chinese-first mainland literary-publishing role and the AI7 product name;
- Standalone-only V1 and Word exclusion;
- the Book, Series, Cross-project, House Editorial Memory, workflow, manuscript, proposal, Effect, learning, and authority models;
- Foundation Models with no AI7 model training;
- TypeScript/Node and no embedded Python;
- Electron main + isolated renderer + separate Node/Harness service;
- ProseMirror, bounded windows, paging store, and 500K/1M/10M manuscript tiers;
- no TCP listener, exact Harness pins, narrow installed package/tool surface, and one agent-loop implementation;
- Windows zip portable and NSIS channels;
- the two concise workflow names `pr` and `release`, provider-free required verification, request-fingerprint guard, and regenerated public-synthetic evidence; or
- the legacy production-data migration exclusion.

## Decisions that were open at the review date

| Blocker | Why it cannot be inferred | Current recommendation, not accepted |
| --- | --- | --- |
| Cross-platform consistency contract | “Consistent product outlook” does not by itself settle feature parity, native-control policy, or visual equality. | Same identity, renderer/design system, information architecture, core workflows/features, authority semantics, document fidelity, data compatibility, and release version; allow explicit/tested native differences and do not demand pixel identity. |
| macOS support floor and CPU policy | Electron support, native dependency closure, and distribution size differ for Apple Silicon and Intel. | macOS 13+ and a universal build if the installed native closure permits it; verify at scaffold time. |
| macOS distribution, update, and data root | Windows zip/NSIS and sibling portable data cannot be copied onto a signed `.app`; bundle mutation breaks trust and translocation makes relative portable assumptions fragile. | Direct-distribution DMG, no Mac portable or Mac App Store V1, mutable data in the OS application-support/container location, automatic update deferred. |
| Apple signing/notarization | Windows signing was explicitly deferred, but unsigned/unnotarized macOS distribution has a different Gatekeeper boundary and credential cost. | Signed and notarized macOS release; signing secrets only in the protected `release` environment. |
| Concise native verification | A Windows-only job cannot produce macOS product evidence, while the owner still requires fast and concise workflows. | Keep only `pr` and `release`; use explicit `windows-2025` and `macos-15` native jobs/matrix, no Ubuntu lane, and measure before splitting core versus platform smoke. |
| Protected secrets and credential transfer | Harness has no adequate OS-keychain provider, and a Windows Credential Manager decision does not implement Keychain. | One AI7 Credential Broker with Windows and Keychain adapters; user-initiated transfer never writes plaintext. |
| Agent Data Root enforcement | Harness Windows ACL is partial. Harness macOS Seatbelt governs writes only, shares broad temp roots, does not restrict reads/network/process visibility, and depends on deprecated `sandbox-exec`. | Keep AI7 capability/service facades authoritative; spike stronger per-platform process isolation before retaining or revising the OS-boundary promise. |
| Native editorial acceptance | Chinese IME, clipboard, shortcuts, fonts, window lifecycle, accessibility, file dialogs, package launch, and performance differ by OS. | Same behavioral contract and generated corpora on both; per-platform visual/input baselines rather than pixel equality. |
| Harness rc.6 baseline audit | The accepted installable rc.6 artifact was not the broadly audited rc.5 source. Upstream now also has rc.7/rc.8 pre-releases, but neither is adopted. | Complete the exact rc.5-to-rc.6 selected-seam and two-platform installed-closure audit; consider any later release only through ADR 0020. |

## Mandatory Phase 0 Harness audit

The accepted consumed baseline is `0.1.0-rc.6`, while the broad source audit was at `0.1.0-rc.5`. Phase 0 cannot pass until this evidence-only audit is complete or the owner explicitly defers a named part. This review does not authorize adding dependencies to the AI7 repository. Installed-closure or ABI proof must run only in a separately authorized disposable audit environment on each target platform; without that authorization, the proof remains an open blocker rather than being simulated in the design repository.

1. identify the candidate package subset with one reason for every inclusion, then audit the exact `rc.5` to `rc.6` package and seam delta;
2. in the separately authorized audit environment, resolve and inspect the installed dependency closure on both platforms, including native `koffi`, `sharp`, sandbox, and credential paths;
3. verify Session persistence/export-import, model-visible request reconstruction, subagent continuation, narrow tool guards, and Electron/Node ABI, using that environment where runtime proof is required;
4. prove the candidate composed AI7 profile rather than a Harness default bundle, and record the resulting exact subset and effective composition as review outputs; and
5. consider later Harness releases only through ADR 0020's one-pin-at-a-time process. GitHub now has rc.7/rc.8 pre-releases and sampled npm `next` values point to rc.8; the replay-state alignment fix in the later line is relevant evidence, not permission to upgrade silently.

Completing the audit does not require choosing rc.7 or rc.8; the accepted pin remains rc.6 unless a separate pin-bump decision changes it.

## Trigger-deferred items that do not block Phase 0

- lexical versus vector versus hybrid manuscript retrieval, decided by the store/index spike;
- calibrated latency budgets and final ProseMirror confidence;
- detailed UI/UX layouts, reserved for the owner's separate session;
- Word integration, unless a later Standalone sufficiency failure justifies a separate ADR;
- Ubuntu, nightly, Test Catalog, quarantine, and wire-level fault-server machinery until their recorded triggers fire;
- Windows code signing until the owner requests it; and
- issue decomposition and implementation until separately authorized.

## Documentation reconciliation

The exit-review branch corrects stale provider-processing, licensing, release-channel, signing, current-question, topology, risk, handoff, and automatic-decomposition statements. Dated raw/reconstruction transcripts remain historical evidence and are excluded from the active-link gate; they are not rewritten into current authority.

Phase 0 may be rerun only after separately authorized architecture exploration resolves or explicitly defers the open platform rows above, the rc.5-to-rc.6 audit is complete or explicitly deferred by the owner, and the resulting records pass link, bilingual-term, decision-map, wrapper, and independent T3 review checks. This frozen candidate does not authorize automatic implementation, issue decomposition, or integration; see the [freeze handoff](./37-v1-platform-freeze-handoff.md).
