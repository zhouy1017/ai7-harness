# AI7 policy documents

Versioned JSON policies, their schemas and their human projections are immutable runtime artifacts. An active-policy-set selects exact paths and SHA-256 digests; a document's internal `lifecycleStatus: active` does not activate it for a repository target. Trusted build/launch authority binds one operational scope. Missing, unmatched or unknown pins deny processing.

[ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) owns the newly approved product target and development/business boundary; [Orca dispatch](../agents/orca-dispatch.md) owns repository agents. Those operating rules do not mutate a runtime policy or make a target model callable.

## Current runtime selection

The #841 successor selects [active-policy-set v9](active-policy-set.v9.json), the direct successor of the #831 set v8; its selection becomes integrated only at the exact dev commit carrying this coherent successor:

| Scope | Canonical JSON | Schema | Human projection |
| --- | --- | --- | --- |
| `development-ci` | [Provider Processing v1](provider-processing-policy.v1.json) | [schema](provider-processing-policy.v1.schema.json) | [projection](provider-processing-policy.md) |
| `fixture-recording` | [Provider Processing v2](provider-processing-policy.v2.json) | [schema](provider-processing-policy.v2.schema.json) | [projection](provider-processing-policy.v2.md) |
| `ordinary-production` | [Provider Processing v6](provider-processing-policy.v6.json) | [schema](provider-processing-policy.v6.schema.json) | [projection](provider-processing-policy.v6.md) |
| `developer-live` | [Provider Processing v11](provider-processing-policy.v11.json) | [schema](provider-processing-policy.v11.schema.json) | [projection](provider-processing-policy.v11.md) |
| External Export, all scopes | [External Export v2](external-export-policy.v2.json) | [schema](external-export-policy.v2.schema.json) | [projection](external-export-policy.v2.md) |

The source checkout selects `development-ci` by default or `developer-live` through its trusted launch argument. It does not select fixture-recording or ordinary-production. One active set serves every launch, so a `development-ci` launch also reports active-set v9 while its Provider Processing pin stays v1. The developer-live executable pin stays Go `deepseek-v4.1-flash` with admitted sample lineage and protected capture, and admits six kinds of work:

- **Baseline manuscript analysis**, exactly as v9 admitted it, under the required Run ceiling.
- **Editorial dialogue**: ask, 继续回答 and 重新生成 on a passage the editor selected. Each is one foreground attempt with one bounded payload of category `editor-selected-manuscript-excerpt`, on the Fast Interaction Role; it has no Run, so no Run ceiling.
- **Reference-free review** of 错别字与规范用语, 体例与格式 and 文学性与表达改进, run like baseline analysis under the same Run ceiling, without Material References, Series Knowledge or editorial deliverables.
- **Writing** (`writing`, 写作任务): a Production Document drafted from the Book's units, its frozen metadata and synopsis, the house's 范例 and the editor's own brief, with one book-level synthesis turn, on the Main Editorial Role under the same Run ceiling. Material References are admitted only through the consumption re-check of [#759](https://github.com/zhouy1017/ai7-harness/issues/759) item 1.
- **Evaluation**: the three implemented contracts — AI7 初评 scores (`evaluation`), 审稿意见 (`readers-report`) and 按我的评分重写评语 (`evaluation-rewrite`) — on the Main Editorial Role, planned like writing, with no web verification and the same reference-bearing condition.
- **润色这段 and 稿件冲突 › 基于当前稿件重新生成建议** (`editorial-polish`, `conflict-regenerate`): one foreground editor action each on the editor's own manuscript words (a selected passage, or a conflict region and its competing draft), on the Fast Interaction Role, with category `editor-selected-manuscript-excerpt`. Their output is a Suggestion only and applies nothing.

v11 binds the Main Editorial and Fast Interaction Roles to that one route and declares the Difficult Escalation and Frontier Model Roles user-configurable and unbound by default. The launch projection lists each admitted rule as `providerProcessing.admittedRules`, with whether the rule names the kind's book-level synthesis turn (`crossUnitSynthesisAllowed`: true for writing and evaluation). Provider Processing v7 is written but selected by no active set. Policy files describe the exact capabilities of their versions; any old attendance/model wording in a pinned human projection is retained for byte fidelity, not a new repository-agent operating instruction.

OpenCode Go `deepseek-v4.1-flash` is the exact developer-live product binding. [#807](https://github.com/zhouy1017/ai7-harness/issues/807) migrates its configuration, declared/observed evidence and exact activation together; [#808](https://github.com/zhouy1017/ai7-harness/issues/808) supplies existing development-only reuse. The official DeepSeek route stays independent and optional. User-credential local production launch remains #811, unavailable here. Old V4 live items remain historical evidence for their actual model. [Provider support](../development/provider-support.md) distinguishes the declared wire contract from named live observations.

Provider Processing v11 directly succeeds v10, which directly succeeded selected developer-live v9; active-set v9 directly succeeds v8, which directly succeeded selected v7; v9 in turn succeeded v5. The unselected v7 policy is not a predecessor activation. The Provider Processing v8 / active-set v6 numbering PR #742 reserved for its web work is superseded: active-set v8 and v9 are non-web successors, and the web successor comes in wave 6 under new numbers. It grants no current web authority. The unchanged development-ci v1, fixture-recording v2, ordinary-production v6 and External Export v2 pins retain their exact bytes. Every web tool, the web-bearing review categories (事实核查, 学术道德与引用, 出版政策与风险), 书系一致性, 跨交付物一致性, default-rule/background/scheduled/import/cross-Run origins and unpublished categories remain refused.

## Operational boundaries

- Development agents may autonomously execute necessary new validation within the approved rules, existing product Run budget semantics and subscription limits. [ADR 0067](../adr/0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md) owns protected credential handling, exact response replay, similar validation-family evidence reuse, unknown outcomes and original capture provenance. No per-item attendance, new batch approval, daily quota or fixed call-count cap is introduced.
- Development captures remain outside every repository. Only reviewed, sanitized fixtures enter Git. The development key and cache are never inherited by ordinary production.
- Each new actual user Task performs its own model-dependent work, including deliberate repeated questions. Development live-once rules and similar-test fixtures never answer or refuse those business Tasks. Product Resume, incremental analysis and explicitly reusable completed steps retain their own semantics.
- CI, the hosted Gate and ordinary automated regressions call no LLM and receive no product Provider credential.
- Provider Processing never grants Apply, external export, publication or public release. Export still requires the exact user-selected local destination, payload and Effect Approval, with a receipt or classified outcome. Notes remain default-off; retained external sources and Evidence Links do not export. Cloud, email and network destinations remain outside the local export policy.

## Immutable history and activation

Preserve every predecessor policy JSON, schema, Markdown projection and active-set manifest byte for byte. Rollback chooses a reviewed predecessor selection rather than editing its bytes or restoring revoked authority. New activation must integrate a coherent successor with matching path/digest/scope pins and the implementation that can enforce it; green tests alone do not activate policy.

[Learning eligibility](learning-eligibility-policy.md) and [factual verification](factual-verification-policy.md) retain their design-baseline status. They are not claimed as selected through the runtime schemas and active set above.

## Local artifact validation

`node tools/validate-policies.mjs` validates every policy/schema pair with the existing installed closure. `pnpm test` exercises that validator; compare active-set SHA-256 pins with their exact referenced file bytes separately. These are local consistency checks, not a new hosted gate. No live request or credential is needed.
