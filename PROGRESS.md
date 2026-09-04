# Current checkpoint

## What's done

- ADR 0062 accepts a required developer-run Local Verification Ladder (type check, unit, service-integration, build, admitted Journeys, full-fidelity local debug and repeat) beside the unchanged per-Ready-pull-request Hosted E2E Functional Gate. It amends ADR 0027's local rigor trade-off and ADR 0049/0053's Local diagnostic clauses; the Gate identity, provider-free boundary, platform parity, and CI exclusion list are unchanged.
- Repository-development dispatch is routed by the Commander's harness under ADR 0061 (Codex route from ADR 0059, Claude Code route from ADR 0060); work-ready Issue bodies carry one requested binding per harness; receipts use schema v3.
- Issue #209 / PR #214 is the last product integration; Issues #229, #231, and this decision are governance-only.

## What's next

- Implement the staged ladder layers through their own Issues in this order: the vitest dependency Issue (exact pin, provenance and notices, `check`/`test` commands, first smoke tests); the e2e debug Issue (`e2e:debug`, `e2e:repeat`, controller-only debug switch, full-fidelity artifacts under `test-results/`); the pure-module unit-test batch; the service-integration batch; then the J-02 CI-only failure reproduction campaign using those tools.
- Open Issues #215, #198, #217, #227, and #91 are revised to ADR 0061 form and remain launchable by either Commander; #215 is the reshaped archive-only lifecycle Issue. Product relaunches follow the ladder rules as their layers become available.
- Product integration remains serial; the Commander resolves order after each base is re-resolved.

## Key decisions

- Local Verification Ladder layers are required local surfaces, never hosted gates; a product pull request records its ladder attestation in the Change closure before Ready.
- A red Gate returns to Draft and local reproduction; CI-parity reproduction precedes any diagnostic-marker Issue.
- Model-dependent testing uses synthetic deterministic fixtures by default and the ADR 0044 recorded fixture only as a replayed realism anchor; recording authority is unchanged.
- Bindings per harness: Codex Commander `gpt-5.6-sol @ ultra`, T1 `gpt-5.6-luna @ medium`, T2 `gpt-5.6-terra @ high`, T3 `gpt-5.6-sol @ xhigh`; Claude Code Commander `claude-fable-5-1 @ xhigh`, T1 `claude-sonnet-5 @ medium`, T2 `claude-opus-5 @ high`, T3 `claude-fable-5-1 @ xhigh`.
- Product Provider, Model Role, DSH, Provider Processing/fallback, credential, Effect, export, publication, distribution, release, and `main` authority are unchanged.

## Unresolved matters or blockers

- Staged commands (`check`, `test`, `test:service`, `e2e:debug`, `e2e:repeat`) do not exist until their Issues integrate; until then the ladder consists of the available layers.
- The J-02 Windows-only restart failure behind #217/#227 has no root cause; its reproduction campaign waits for the debug/repeat commands.
- Whether the `.agents/skills` vendoring on `temp/freeze-20260904-112022` enters `dev`, archival of `handoff20260817/`, and removal of stale local worktree registrations are separate Owner decisions.

## Safe Resume Prompt

```text
Commander: identify your harness (Codex or Claude Code), then query the Dispatch Register and current Issue receipts with that harness's tools. Shape and launch the vitest dependency Issue first (exact pin, provenance ledger, notices, check/test commands, smoke tests), then the e2e debug/repeat Issue, then the unit and service test batches, then the J-02 reproduction campaign, each as a fresh Task Session on your harness with schema-v3 receipts. Keep product integration serial and require the Local Verification Ladder attestation before Ready. Under ADR 0058 do not query, estimate, report, or consider Actions usage. Do not touch Provider, credentials, sample1, recording, fixture admission, product Effect, export, publication, release, distribution, or main.
```
