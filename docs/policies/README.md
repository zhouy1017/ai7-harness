# AI7 policy documents

Versioned JSON policies, their schemas and their human projections are immutable runtime artifacts. An active-policy-set selects exact paths and SHA-256 digests; a document's internal `lifecycleStatus: active` does not activate it for a repository target. Trusted build/launch authority binds one operational scope. Missing, unmatched or unknown pins deny processing.

[ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) owns the newly approved product target and development/business boundary; [Orca dispatch](../agents/orca-dispatch.md) owns repository agents. Those operating rules do not mutate a runtime policy or make a target model callable.

## Current runtime selection

At the integrated `dev@afaf7465` baseline, [active-policy-set v5](active-policy-set.v5.json) is selected:

| Scope | Canonical JSON | Schema | Human projection |
| --- | --- | --- | --- |
| `development-ci` | [Provider Processing v1](provider-processing-policy.v1.json) | [schema](provider-processing-policy.v1.schema.json) | [projection](provider-processing-policy.md) |
| `fixture-recording` | [Provider Processing v2](provider-processing-policy.v2.json) | [schema](provider-processing-policy.v2.schema.json) | [projection](provider-processing-policy.v2.md) |
| `ordinary-production` | [Provider Processing v6](provider-processing-policy.v6.json) | [schema](provider-processing-policy.v6.schema.json) | [projection](provider-processing-policy.v6.md) |
| `developer-live` | [Provider Processing v5](provider-processing-policy.v5.json) | [schema](provider-processing-policy.v5.schema.json) | [projection](provider-processing-policy.v5.md) |
| External Export, all scopes | [External Export v2](external-export-policy.v2.json) | [schema](external-export-policy.v2.schema.json) | [projection](external-export-policy.v2.md) |

The source checkout selects `development-ci` by default or `developer-live` through its trusted launch argument. It does not select fixture-recording or ordinary-production. The developer-live executable pin remains analysis-only Go `deepseek-v4-flash`, required explicit Run ceiling, admitted sample lineage and protected capture. Provider Processing v7 is written but selected by no active set. Policy files describe the exact capabilities of their versions; any old attendance/model wording in a pinned human projection is retained for byte fidelity, not a new repository-agent operating instruction.

The Owner-approved target is configurable OpenCode Go `deepseek-v4.1-flash`, with the official DeepSeek route retained and first production delivery as a local controlled trial using the user's credential. [#807](https://github.com/zhouy1017/ai7-harness/issues/807) owns the coherent model/configuration/generated-projection/policy/launch migration, [#808](https://github.com/zhouy1017/ai7-harness/issues/808) extends the existing development reuse owners, and [#806](https://github.com/zhouy1017/ai7-harness/issues/806) adapts CI/Orca routing. None is implemented by this documentation change. [Provider support](../development/provider-support.md) remains an unchanged generated view of the current provider declarations; its legacy-model evidence does not prove the target model's capability or quality.

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
