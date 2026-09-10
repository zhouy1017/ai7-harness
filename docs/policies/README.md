# AI7 policy documents

This directory is the stable owner for Policy Document artifacts. For Provider Processing and External Export, each versioned JSON file is the authority-bearing canonical serialization of that immutable policy version. Its policy-specific JSON Schema constrains that exact decision, its version-specific Markdown file is a human-readable projection that must not drift, and an active-policy-set manifest selects exact immutable bytes by version, repository-relative path, and SHA-256 digest.

## Target qualification

The JSON value `lifecycleStatus: "active"` describes lifecycle inside that policy version. It does not by itself make a visible file current or canonical for a repository target.

A policy version is repository-current and repository-canonical only at an exact integrated `dev` commit that contains its canonical JSON and whose same-tree active-policy-set entry matches the policy identity, version, repository-relative path, and SHA-256 of those exact bytes. For a scope-mapped policy, that same tree must also bind exactly one trusted operational scope to the applicable pin. On any task branch not yet integrated into `dev`, the same record is `accepted-but-unintegrated`, even when its internal lifecycle status is `active` and all pins validate locally.

## Accepted target selection

| Policy selection | Canonical serialized policy | Schema | Human projection |
| --- | --- | --- | --- |
| Provider Processing v1 — `development-ci` | [`provider-processing-policy.v1.json`](provider-processing-policy.v1.json) | [`provider-processing-policy.v1.schema.json`](provider-processing-policy.v1.schema.json) | [`provider-processing-policy.md`](provider-processing-policy.md) |
| Provider Processing v2 — `fixture-recording` | [`provider-processing-policy.v2.json`](provider-processing-policy.v2.json) | [`provider-processing-policy.v2.schema.json`](provider-processing-policy.v2.schema.json) | [`provider-processing-policy.v2.md`](provider-processing-policy.v2.md) |
| Provider Processing v6 — `ordinary-production` | [`provider-processing-policy.v6.json`](provider-processing-policy.v6.json) | [`provider-processing-policy.v6.schema.json`](provider-processing-policy.v6.schema.json) | [`provider-processing-policy.v6.md`](provider-processing-policy.v6.md) |
| Provider Processing v5 — `developer-live` | [`provider-processing-policy.v5.json`](provider-processing-policy.v5.json) | [`provider-processing-policy.v5.schema.json`](provider-processing-policy.v5.schema.json) | [`provider-processing-policy.v5.md`](provider-processing-policy.v5.md) |
| External Export v1 — all scopes | [`external-export-policy.v1.json`](external-export-policy.v1.json) | [`external-export-policy.v1.schema.json`](external-export-policy.v1.schema.json) | [`external-export-policy.md`](external-export-policy.md) |

At a qualifying integrated `dev` target, [`active-policy-set.v5.json`](active-policy-set.v5.json), validated by [`active-policy-set.v5.schema.json`](active-policy-set.v5.schema.json), is the sole active selection owner for all four Provider Processing scopes. Trusted build/launch authority must bind exactly one of them for each launch: the source-checkout carrier binds `development-ci` by default, and the built entry's launch argument `--trusted-operational-scope developer-live` binds `developer-live` on a developer host only; `fixture-recording` and `ordinary-production` are not selectable from the source checkout. An ordinary product setting, environment variable, Provider, artifact or Plugin cannot select the scope, and there is no cross-scope fallback. A selection is valid only when scope, policy identity, version, canonical path and SHA-256 digest all match at that exact target; missing or unknown scope denies Provider Processing. Selecting a predecessor for rollback means creating and reviewing the applicable active-set selection; it never means mutating an immutable policy version or restoring revoked authority.

Active-set v5 is the successor of active-set v4: it pins Provider Processing v5 for `developer-live` and the production successor of v3, Provider Processing v6, for `ordinary-production`, both reviewed byte by byte under [ADR 0079](../adr/0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §2; the `development-ci` v1, `fixture-recording` v2 and External Export v1 pins are unchanged. Provider Processing v4 remains the immutable predecessor of v5 and Provider Processing v3 the immutable predecessor of v6. Active-set v4 remains byte-preserved predecessor history and still records the pre-v5 `ordinary-production` correction.

This active set is a closed selection contract, not a runtime mode inside a Policy Document. It creates no trusted launch selector by itself; the launch argument and its verification are implementation owned by `src/service/launch-policy.ts`.

When target-qualified as above, Provider Processing v2 denies by default and has exactly one eligible-only rule, `sample1-manual-model-fixture-recording`. Under [ADR 0044](../adr/0044-use-sample1-as-compatibility-and-recording-baseline.md), that rule is exact-source, local-only, human-attended, CI-denied, one-call, non-`unset`-budget, exact-binding and no-fallback. Policy eligibility does not implement or dispatch the future call; follow the [manual recording runbook](../development/manual-model-fixture-recording.md) only after separate action authorization and immediate human intervention.

Provider Processing v1 remains the provider-free `development-ci` selection and denies every live transmission. Provider Processing v6 is default-deny and contains exactly two ordinary-production eligible-only rules: a newly user-initiated Task may create an exact Run through direct authorization or a matching active Default Execution Rule, while a new autonomous background manuscript-analysis dispatch additionally requires a matching active Background Analysis Enrollment. Setup, import, credential configuration, artifact installation or enablement never creates either authority. Moving the same already-authorized Run into the background changes presentation only; a new idle, scheduled, post-checkpoint, import-triggered or cross-Run dispatch needs the Enrollment. The v3 binding is unchanged; v6 adds the three declared suboperations, the per-frozen-unit Run Budget Ceiling default and the house-people redaction rule of ADR 0079 §2.

Provider Processing v5 is the human-attended `developer-live` scope of [ADR 0065](../adr/0065-admit-a-developer-live-provider-processing-scope.md) and [ADR 0067](../adr/0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md): default-deny with one eligible-only rule for a newly user-initiated Task on a developer host over an admitted Public SampleBook (S40: exact `sample1`, the one file ADR 0079 §5 keeps admitted), bound to route `opencode-go` and model `deepseek-v4-flash`, one technical Session per Analysis Unit, transmissions bounded by the Coverage Manifest unit count plus declared `safe-retry` adaptations plus the reduction's topic sections plus the assurance sample's anchor units plus one report turn, the three declared suboperations named `true`, no web-search allowance, a required non-`unset` Run Budget Ceiling whose default is 30,000 tokens per frozen Coverage Manifest unit ([ADR 0070](../adr/0070-run-developer-live-unattended-and-size-the-ceiling-per-unit.md)), identical requests replayed from the Provider Result Cache, repeated test items refused, and a limit response classified `quota-exhausted` that ends the Run as a Provider Account Limit. Before every transmission the house-people identity is stripped — 责编 and 相关人 names and roles, 备注 and internal notes — while the author's information and the house name may leave. It emits no fixture and never runs in CI or hosted.

External Export v1 denies by default and contains only one policy-eligibility rule for a platform-native user-selected local-filesystem file Effect over an exact Delivery Package version or Editorial Deliverable Revision; every file still requires its own frozen preparation, exact Effect Intent and Effect Approval, atomic commit/verification, and Effect Receipt or classified outcome. The active set creates no provider, endpoint, model, credential, file-operation implementation, current recording, network/cloud/email destination, learning, publication, Public Release Permission, or outcome proof.

## Immutable predecessor records

Provider Processing v1, v2, v3 and v4, their schemas and human projections, plus [`active-policy-set.v1.json`](active-policy-set.v1.json), [`active-policy-set.v2.json`](active-policy-set.v2.json), [`active-policy-set.v3.json`](active-policy-set.v3.json), [`active-policy-set.v4.json`](active-policy-set.v4.json) and their schemas, remain byte-preserved immutable predecessor history. Active-set v5 references those exact v1/v2 Provider bytes for their retained scopes rather than rewriting them; the v3 and v4 records remain readable history. External Export v1 is selected unchanged by all active-set generations.

## Existing design-phase policy references

[`learning-eligibility-policy.md`](learning-eligibility-policy.md) and [`factual-verification-policy.md`](factual-verification-policy.md) retain their existing design-baseline status and formats. They are not claimed to be migrated to, validated by, or selected through the new v1 schemas and active set.

## Local validation

The schemas deliberately declare JSON Schema Draft 7 and are self-contained. Validate every discovered `docs/policies/*.json` and `*.schema.json` pair from the repository root with the installed closure only, no dependency:

```
node tools/validate-policies.mjs
```

It prints one line per pair naming the policy file and `ok` or the first failure's schema path and reason, and exits non-zero if any pair fails to validate or a schema uses a keyword the validator does not implement. `pnpm test` also runs this validation as `tests/unit/policy-schemas.test.ts`, so a policy document that stops matching its schema fails the Local Verification Ladder.

JSON Schema validates the manifest shape but cannot read repository files to prove a digest. Verify every pin separately against the exact file bytes:

```powershell
$set = Get-Content -Raw -LiteralPath 'docs/policies/active-policy-set.v5.json' | ConvertFrom-Json -ErrorAction Stop
$providerPins = $set.activePolicies.'provider-processing-policy'.scopePins.PSObject.Properties.Value
$pins = @($providerPins) + @($set.activePolicies.'external-export-policy')
foreach ($pin in $pins) {
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $pin.canonicalPath).Hash.ToLowerInvariant()
  if ($actual -cne $pin.sha256) { throw "Digest mismatch: $($pin.canonicalPath)" }
}
```

These are local validation instructions for the policy artifacts, not a new standing workflow or test gate.
