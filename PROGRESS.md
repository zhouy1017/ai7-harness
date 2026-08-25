# Progress

## What's done

- Issue #20 / PR #21 is integrated into the development line at exact `dev@2e0018ce8ce586e4d15949b19c72569cba762bed`; frozen `design-doc@6895f02d2983865516d267809d8cdda77026f62c` remains provenance only, and `main` remains outside this task.
- Issue #22 is dispatched to the sole writable Worker on `docs/22-egress-policy-baselines` from that exact `dev` commit. The branch and worktree were clean and matched the required base before work began.
- The complete Issue #22 Change Brief and every routed authority named by the dispatch have been read: root entry/checkpoint/router records, the four applicable agent runbooks, the Execution context, ADRs 0007/0016/0018/0038/0039, the Harness integration contract, kick-in 16/22, and both existing policy-format references.
- The existing [`docs/policies/`](docs/policies/README.md) owner now contains separate Provider Processing v1 and External Export v1 canonical JSON instances, policy-specific self-contained Draft 7 schemas, synchronized human projections, and one v1 active-policy-set schema/manifest. All three instances pass `Test-Json -SchemaFile ... -ErrorAction Stop` on PowerShell 7.6.5.
- The active set pins exact repository-relative paths, version `v1`, and the real-file SHA-256 values `d9dfe8c13a58649d8d9f607364030468ae71832b94c9436291d29000795d725a` (Provider Processing) and `b66fa0f2ad7d721f879c91e3cbb8e84f6a7bb08b107424d87871ab07937242de` (External Export); both pins match current canonical file bytes.
- [`CONTEXT-MAP.md`](CONTEXT-MAP.md), the canonical Execution context, [`kick-in/16-policy-documents-and-feedback-ux-handoff.md`](kick-in/16-policy-documents-and-feedback-ux-handoff.md), and [`HANDOFF.md`](HANDOFF.md) now route to the active concrete artifacts instead of claiming the two baselines are missing. Their semantic separations and implementation blocks remain explicit.
- Commander formally amended the Issue #22 Change Brief in `#issuecomment-5414004747` to include four exact stale-status repairs in [`kick-in/03-keep-adapt-drop.md`](kick-in/03-keep-adapt-drop.md) and [`kick-in/05-decision-map.md`](kick-in/05-decision-map.md). Those statements now record that active v1 has exactly zero provider allow rules and that live-provider implementation still requires a separately authorized provider-specific rule/terms decision and runtime task.
- Commander Change Brief revision 2 in `#issuecomment-5414040614` added three exact current-router repairs: [`kick-in/04-migration-workflow.md`](kick-in/04-migration-workflow.md), [`docs/architecture-v2/MIGRATION.md`](docs/architecture-v2/MIGRATION.md), and [`docs/ui-ux-v2/HANDOFF.md`](docs/ui-ux-v2/HANDOFF.md). They now mark restrictive v1 policies present, runtime/live-provider/network-export behavior unimplemented and separately authorized, and implementation planning followed by bounded J-01 as the next sequence.
- Final local validation passes: three JSON instances parse and conform to their self-contained Draft 7 schemas under PowerShell 7.6.5 with schema-parser errors made fatal; 16 restrictive negative mutations are rejected; both active pins match policy identity/version/path and exact file bytes; both projections contain every completion-boundary statement and provenance route; 137 relative links across 13 changed Markdown files resolve; the one current explicit `Local Export Preparation` anchor remains unique; all six JSON/schema files are LF-only UTF-8 without BOM; schema references are local; conflict markers and whitespace are clean; and the exact 19-path amended structural budget contains no extra path.
- Root [`CLAUDE.md`](CLAUDE.md) remains exactly `@AGENTS.md`; [`AGENTS.md`](AGENTS.md), [`GLOSSARY.md`](GLOSSARY.md), and the historical [`docs/development/design-baseline-allowlist.md`](docs/development/design-baseline-allowlist.md) are unchanged. The documentation archive sweep is `none`: Issue #22 creates current canonical artifacts and no repository scratch, research, or duplicate Change Brief was created.
- Read-only advisory compatibility and semantic review is complete. Its stale-current-router findings were repaired only through the two formal Commander scope amendments; the final policy/schema/projection pass found no additional semantic hole. Review remained advisory and created no standing gate.
- The complete Issue #22 documentation unit is recorded as one cohesive local branch commit and is ready for Commander review; the Worker took no push, pull-request, merge, release, or other external action.

## What's next

- Commander reviews the exact Issue #22 branch head, creates the authorized pull request targeting `dev`, and integrates it; the Worker performs no external action.
- After integration, create the separately scoped implementation-planning Issue and complete Change Brief before the bounded provider-free J-01 tracer; do not begin runtime, provider, or export implementation from this policy task.

## Unresolved matters or blockers

- Issue #22 has no unresolved matter or blocker inside the twice-amended structural budget.
- Provider/model/endpoint/credential selection, live provider transmission, network/cloud/email export, local-export implementation, Public Release Permission, dependencies, product code, workflows, and new gates remain explicitly blocked and out of scope.

## Key decisions made

- Exact authority is `dev@2e0018ce8ce586e4d15949b19c72569cba762bed` plus the Issue #22 Change Brief; candidate or predecessor material will not be imported.
- The existing `docs/policies/` owner is deepened rather than creating a parallel policy location. Canonical serialized JSON carries policy authority; Markdown is a human projection that must not drift.
- The two policies remain separate from each other and from Public Release Permission. Provider Processing v1 authorizes zero live transmissions; External Export v1 makes only one narrow local-filesystem policy match, which is never Effect Approval or outcome proof.
- JSON Schema Draft 7 is used explicitly because the current dependency-free PowerShell validator supports it reliably; schemas are self-contained and use only local fragment references. Digest equality remains a separate real-byte check because JSON Schema cannot read pinned files.
- The four extra status repairs were made only after the Commander expanded the exact Change Brief path budget; they name no provider, endpoint, credential, transmission permission, or runtime authority.
- The three current-router repairs likewise follow the exact second scope amendment; the Issue #20 historical [`docs/development/design-baseline-allowlist.md`](docs/development/design-baseline-allowlist.md) remains unchanged.

## Resume Prompt

Commander: review the exact Issue #22 branch commit, open and integrate its authorized pull request into `dev`, then create the separate implementation-planning Issue before any tracer, live-provider, or export-runtime work.
