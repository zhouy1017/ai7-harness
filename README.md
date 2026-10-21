# AI7 Harness

AI7 is a Chinese-first desktop workbench for professional literary editors. It brings long manuscripts, editorial review, reference materials and publishing deliverables into one local workspace, with a revision history and explicit decisions for consequential changes.

AI7 is under active development for **Windows and macOS**. The Initial v1.0.0 Development Milestone is recorded; it is not a public-release or platform-certification claim. [Current implementation and evidence](PROGRESS.md) describe the integrated product and its limits.

## What you can do

- **Read and edit long manuscripts.** Import a Book, work in bounded manuscript views, compare revisions and recover interrupted work. Marks, suggestions and conflict handling keep proposed changes separate from the manuscript until you decide to apply them.
- **Analyze and review.** Prepare baseline analysis, editorial review, AI7 初评 and 审稿意见; inspect results, cited passages, coverage and missing work. 就这段提问 provides a streamed discussion of a selected passage, and 润色这段 prepares suggestions for review.
- **Use your sources.** Keep a local 资料库, extract supported document text, retrieve passages and use pinned references in supported tasks. Text PDFs retain page anchors; scanned PDFs are identified as 需要识别 and are not OCR-processed.
- **Research and check claims.** Supported review, writing and market-evaluation tasks can search and fetch public sources through a configured backend. Factual review keeps evidence, unresolved claims and the editor's verification decisions distinct.
- **Prepare publishing work.** Draft Production Documents, retain their versions and delivery records, export DOCX and 图书交付包, and record 发稿 separately from file export.
- **Keep editorial practice reusable.** Work with 书系 knowledge, house review preferences, captured procedures and editor-defined analysis dimensions. Imported Skills remain inert; the bounded Agent 工作区 proposes changes through the existing review and Apply chain.

The warm-paper/night-ink workbench includes searchable Book switching, focus mode, reading and density settings, keyboard remapping and on-demand journal details. Product labels are primarily Simplified Chinese.

## Getting started from source

Use Windows 11 24H2+ on x64 or macOS 15+ on Apple Silicon. Install Git, Node **24.18.1** and Corepack; the repository selects pnpm **11.24.0**. Microsoft Office, Python and a model credential are not required to build and open the local workbench.

From the repository root:

```text
pnpm run doctor
pnpm run bootstrap
pnpm run inspect
```

This builds and opens the provider-free development workbench with a dedicated external inspection data folder. Use `pnpm run inspect:build` for build-only verification without opening a window. See [quick local inspection](docs/development/local-inspection.md) for data location and prerequisites; agents follow the background-guest verification rules.

For your own editorial work after building, use:

```text
pnpm run start:production
```

Choose the product data location when prompted. In 设置 › 模型服务, configure your own OpenCode Go or DeepSeek 官方 connection for model-assisted tasks; the key is stored through the operating system's protected credential store. Supported web tasks also need a configured search backend and its key. Production uses your own data and credentials, separately from development evidence and caches. See the [source-checkout guide](docs/development/source-checkout.md) for launch scopes, data locations and troubleshooting.

## Current limits

AI output needs editorial judgement. Deterministic tests prove application behavior; a recorded model run establishes only that run's result. The [measured editorial evidence](docs/development/editorial-evidence-2026-10.md) includes missed findings, grounding failures and incomplete responses. Standard/strict factual-review live evidence remains incomplete, and a Book currently supports one factual-review Run; [#908](https://github.com/zhouy1017/ai7-harness/issues/908) and [#905](https://github.com/zhouy1017/ai7-harness/issues/905) track those gaps.

Edited DOCX export discloses remaining formatting, hyperlink, field and revision limitations ([#874](https://github.com/zhouy1017/ai7-harness/issues/874)). Word integration, OCR, detached manuscript windows, structure-adjustment mode, executable foreign Skills and automatic updates are deferred. The [feature and fix roadmap](docs/development/development-plan.md) distinguishes implemented foundations from these remaining outcomes.

Unsigned packaging exists. Windows installer/portable builds and a portable self-check have recorded evidence; that is not installer execution or macOS DMG validation. The [automatic-delivery contract](docs/adr/0093-automate-nightly-packages-and-version-tag-inspection-releases.md) requires packaging after the paired nightly Gate and publication of matching version tags as explicitly labeled unsigned inspection prereleases; [PROGRESS](PROGRESS.md) records implementation status. Signing, notarization and promotion to `main` remain separate steps. Packaged builds currently include no sample Book.

## Documentation and contributions

- [Documentation index](docs/README.md) — current guides, design owners and evidence.
- [Nightly builds and version-tag releases](docs/development/releasing.md) — automatic delivery of unsigned inspection packages.
- [Version identity](docs/development/versioning.md) — matching software version, Data Version, build number and source commit across the app and its packages.
- [PROGRESS](PROGRESS.md) — exact integrated checkpoint and remaining risks.
- [Development plan](docs/development/development-plan.md) — next fixes, features and decision blockers.
- [AGENTS.md](AGENTS.md) — mandatory entry for repository work; [Orca dispatch](docs/agents/orca-dispatch.md) owns assignment, review and integration.

Development inputs must follow the [protected-material boundary](AGENTS.md#protected-material). Only explicitly admitted Public SampleBooks and permitted synthetic inputs belong in tests; keep private manuscripts, their derivatives and credentials outside the repository and hosted CI.
