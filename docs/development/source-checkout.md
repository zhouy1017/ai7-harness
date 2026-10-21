# Source-checkout build and launch

This guide owns operating the source checkout. [Source-checkout buildability](../agents/source-checkout-buildability.md) defines its contract; [PROGRESS](../../PROGRESS.md) records current capabilities and evidence, and [E2E journeys](e2e-journeys.md) describe tested product paths. Protocol-by-protocol implementation chronology is retained in Git and the implementing PRs, not used as current launch instructions.

## Declared host matrix

| Host | Architecture | Toolchain | Native archive adapter |
| --- | --- | --- | --- |
| Windows 11 24H2+, NT build 26100+ | x64 | Node 24.18.1, pnpm 11.24.0 | Canonical `%SystemRoot%\System32\tar.exe` |
| macOS 15+, Darwin 24+ | arm64 | Node 24.18.1, pnpm 11.24.0 | Canonical `/usr/bin/ditto` |
| GitHub Actions Windows Server 2025 | x64 | Same pins | CI-only carrier, admitted by the workflow marker |

Git and Corepack are prerequisites. The SRI-bearing `packageManager` in [package.json](../../package.json) selects pnpm. [Dependency artifacts](../../config/dependency-artifacts.json) and the [provenance ledger](dependency-provenance.md) own exact acquisition URLs, digests and licenses. At this checkpoint Electron is 43.4.1 and TypeScript is 6.0.3. Office, Python, another checkout, a prefilled package store and a Provider credential are not build inputs.

## Build and provider-free launch

Run from the repository root:

```text
pnpm run doctor
pnpm run bootstrap
pnpm run build
pnpm run start-built -- --data-root <absolute-path-outside-this-checkout>
```

- `doctor` checks the declared host and exact runtime, canonical archive tool and build-affecting ambient overrides. Resolve its named prerequisite rather than substituting a different runtime or silently using global packages.
- `bootstrap` restores the frozen npm closure, checks package completeness, verifies and extracts the host Electron archive, and verifies embedded Node/ABI/SQLite/FTS5 and license carriers. It also seeds declared packaging tools. Generated dependency roots must remain canonical checkout children; redirected roots are refused.
- An incomplete dependency closure requires removing only this checkout's generated `node_modules` after verifying its resolved path, then rerunning bootstrap. A cache hit is never verification evidence.
- `build` type-checks, validates and replaces ignored `dist/`, and emits main, preload, renderer, service, shared modules and notices without source maps. Its bounded diagnostics omit source excerpts and payloads; use `pnpm run check` for full developer diagnostics.
- `start-built` materializes the verified runtime in the selected external Agent Data Root. It prints `AI7_READY` only after database, service/Harness composition, renderer and first paint are ready, and stays attached until AI7 exits.

The default scope is `development-ci`: no product Provider calls, even if a machine has credentials. Local editing and the workbench can be inspected without a model. Deterministic model fixtures are selected only by admitted test controls. Data roots, captures and generated outputs are not repository source inputs.

For repeated source inspection, use [quick inspection](local-inspection.md): `pnpm run inspect` builds and opens the workbench for a person; `pnpm run inspect:build` builds without launching. These commands do not change the guest-only rule for agent-run Electron verification.

## Local production launch

After building:

```text
pnpm run start:production
pnpm run start:production -- --data-root <absolute-path-outside-this-checkout>
```

Without an explicit path, the launcher uses the stored location or presents the first-run location chooser. Defaults are `%LOCALAPPDATA%\ai7\production` on Windows and `~/Library/Application Support/ai7/production` on macOS. A chosen root must pass the product's placement checks, including separation from the checkout and development cache roots.

The production wrapper selects `ordinary-production` and refuses development-only arguments. In 设置 › 模型服务 the editor saves their own OpenCode Go or DeepSeek 官方 connection; keys go to the OS protected store under opaque references and are never redisplayed or exported. 改用 affects later tasks; existing plans retain their binding. There is no automatic route fallback. 移除 deletes the key and leaves the connection 需设置.

Production uses the editor's own data and credentials. It never reads the development credential, Provider Result Cache or Provider Test Ledger. New business Tasks execute real model steps even for repeated input; continuation and incremental reuse retain their own semantics. Supported background analysis, default-rule quick start and research are available only within their current plan, enrollment, credential and policy constraints; the old blanket claim that these are disabled is obsolete.

## Scope, policy and model boundaries

[The policy index](../policies/README.md) owns current selection. At the reviewed baseline, [source launch authority](../../config/source-checkout-launch-authority.json) selects active-policy-set v16: development/CI v1, fixture-recording v2, developer-live v24 and ordinary-production v23. A JSON record's internal lifecycle status does not select it; trusted launch authority does. Fixture-recording is not selectable from this source launcher.

The product Go binding is `deepseek-v4.1-flash`; DeepSeek 官方 is an independent production route. The generated [provider support](provider-support.md) distinguishes declared configuration, runtime implementation and recorded capability. Configuring a model or search backend grants no transmission authority. Old V4 captures remain V4 evidence, and the observed Go `zen/go` binding does not prove equivalence with a separately documented endpoint.

| Surface | Current boundary |
| --- | --- |
| Non-web model work | Baseline, streamed dialogue, admitted editorial reviews, writing, evaluation, polish and conflict regeneration use their admitted contracts. Plans retain coverage, result gaps and exact source pins. |
| Targeted local retrieval | Foreground dialogue/review/evaluation/writing may retrieve only authorized pinned sources, with Exact Fetch before quotation. Covered baseline, polish, conflict regeneration, background, 来源译文 and custom analysis register no local retrieval tools. Similarity indexing currently uses deterministic `ai7-embedding/stub-1`, not a real embedding model. Retrieval candidates never establish coverage or real-world truth. |
| Web research | Admitted factual review, 学术道德与引用, market evaluation and writing on the evidenced Go binding can search/fetch with a selected backend and its credential. Dialogue, baseline, polish, conflict regeneration and background stay without web; 出版政策与风险 remains refused. |
| Background/default rules | Enrolled background baseline work requires its tokens ceiling. Default rules cover baseline/writing/review; installation or enrollment does not authorize unrelated work. |
| Factual assurance | Standard/strict surfaces are implemented, but their recorded live proof is incomplete (#908). One factual Run per Book remains the current limit (#905). |
| 来源译文 | Policy admission and the implemented product path are distinct; the retained-source translation path has developer-live evidence, not a general production-availability claim. |

### Developer-live validation

This path is for a separately assigned development question under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md), [ADR 0067](../adr/0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md) and the current binding. It is not required for documentation or ordinary automated regression.

```text
pnpm run start-built -- --data-root <external-root> --trusted-operational-scope developer-live --validation-case <family>/<case>
```

Optional development arguments are `--validation-delta <kind>:<rationale>`, `--run-budget-ceiling <n>` and `--provider-cache-root <external-cache-root>`. A missing validation case, unknown scope, relative root or combination with Journey controls refuses before dispatch. No environment variable or ordinary product setting changes the trusted scope.

Only the admitted [Public SampleBooks](../../SampleBooks/README.md), including permitted editor changes, are development transmission inputs; pasted unrelated manuscripts remain protected. v24 and the lineage owner admit all five listed books. The four ADR 0091 works' admission does not grant sample1's special reviewed-fixture conversion exception.

The Run ceiling defaults to 30,000 tokens per frozen Coverage Manifest unit for developer-live analysis and is checked before dispatch; an explicit override is frozen in the plan. Dialogue is a separate bounded foreground interaction without a Run. Background enrollment retains its own mandatory ceiling. These are product limits, not restrictions on repository-agent conversation.

The external cache defaults to the checkout sibling `../ai7-harness-provider-cache/`; it must remain outside every checkout. Existing evidence is reused for the same development question, and durable claims preserve unknown-send outcomes. A new question or declared retry must retain its substantive delta and provenance. Raw responses, cache contents and secrets never enter repository logs, artifacts or hosted CI.

Only the enrollment helper reads the untracked credential file. Readiness can be checked without revealing it:

```text
node tools/enroll-dev-credential.mjs --slot opencode-go --check
```

For authorized capture conversion use [the fixture conversion guide](manual-model-fixture-recording.md). Review provenance and exact material admission before adding any fixture.

## Verification and diagnostics

```text
pnpm run check
pnpm test
pnpm run test:service
pnpm run build
```

These are type/syntax, unit, service-integration and build checks. Service tests use disposable external roots; ordinary regression and the Gate stay provider-free. Documentation-only work checks links, root wrappers, directives, scenario consistency and `git diff --check`; it needs no model call or unrelated product build.

The [repository guide](repository-structure.md) documents `pnpm run docs:check` and its inclusion in the existing L0. Stage new Markdown before checking. This is local static verification, not another hosted Gate.

Every agent-run Electron Journey and its attested ladder runs on a background test guest through the host runner, as [CI and test boundaries](../agents/ci-test-boundaries.md#where-the-ladder-runs) specifies. Commit the candidate first. A host authoring check or human inspection is not a guest attestation or Hosted Gate.

The Journey entry points are `e2e -- --journey <admitted-id>`, `e2e:all`, `e2e:gate`, `e2e:diagnose`, `e2e:debug` and `e2e:repeat`. [The Journey record](e2e-journeys.md) and runner declarations own current admission/order; no stale abbreviated list here limits the full set. J-14 accessibility obligations are exercised within supported Journeys, not a fabricated standalone success.

Debug/repeat mode keeps failure details and screenshots only in ignored local test-result locations and refuses hosted CI. Ordinary output remains bounded. Report exact failure stages and disclosed skips; never inspect protected local-only manuscript artifacts. An unavailable guest returns to the Commander, not to a host-desktop Journey fallback.

## Unsigned host-native distribution (Issue #966)

After bootstrap, `pnpm run package -- --list` lists outputs and `pnpm run package` builds host-native unsigned packages offline under ignored `release/`. Windows emits a per-user NSIS installer and portable zip; macOS emits an unsigned, unnotarized DMG only on a macOS host. Missing declared packager archives require bootstrap; package time does not fetch substitutes.

The portable zip has a pristine `AI7/` folder with `app/` and sibling `data/`: replace the application and preserve data. Credentials remain in the OS store. Channel-specific data resolution, first-run choice and fallback disclosures are product behavior; Chromium's disposable OS state is separate from the product records. Sources, tests, development tools, credentials and SampleBooks are excluded from packages.

The packaged `--self-check` verifies runtime, keyring carrier loading without reading a credential, data-root writability and store-version projection, then exits without opening a window or calling a Provider. Windows packaging records the portable self-check in `release/self-check.txt`. This does not prove installer execution, packaged Journeys or macOS packaging. [PROGRESS](../../PROGRESS.md) and the [milestone record](milestone-1.0.0-scope.md) retain those evidence limits.

Data Version 1 is frozen. Later data changes need their recorded additive/breaking classification, pre-upgrade backup where required and named rollback steps. The [version-identity contract](versioning.md) requires this compatibility value, the software version and the deterministic Git build number to agree in the running app and native package metadata. It requires full Git history, visible modified-source labeling for local inspection and a clean checkout for release packaging; [PROGRESS](../../PROGRESS.md) records integration status.

[ADR 0093](../adr/0093-automate-nightly-packages-and-version-tag-inspection-releases.md) defines automatic packaging after the paired nightly Gate and publication of matching version tags as unsigned inspection prereleases; the [release guide](releasing.md) owns the operator procedure. Implementing that workflow is not evidence that a release has run and does not implement #974's installed-product updater. Production signing/notarization and main promotion remain separately scoped.

## Operational owners

| Question | Owner |
| --- | --- |
| What is delivered; what should be done next? | [PROGRESS](../../PROGRESS.md), then [development plan](development-plan.md) and the selected Issue |
| What product path does a test prove? | [E2E journeys](e2e-journeys.md) |
| Which policy and model may this launch use? | [Policy index](../policies/README.md), launch authority and [provider support](provider-support.md) |
| How are packages, artifacts and licenses acquired? | [Dependency provenance](dependency-provenance.md) |
| How are model captures admitted as fixtures? | [Fixture conversion](manual-model-fixture-recording.md) |
| Where are older protocol/schema changes? | Git at the implementing commit, its Issue/PR and the current source owner; superseded refusal prose is not a current restriction |
