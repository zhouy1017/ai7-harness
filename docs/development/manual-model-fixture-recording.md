# Manual model-fixture recording

Status: **current local development runbook; record once, replay many; no recording is authorized or performed by this document**

This runbook applies only to the future `sample1-manual-model-fixture-recording` rule in [Provider Processing Policy v2](../policies/provider-processing-policy.v2.json). It is a development procedure, not Provider authority, an implementation, a command to call a Provider, or fixture admission.

No real call occurs now. The recording remains deferred until a model-dependent AI7 product path exists. When that path is ready, the Commander must request immediate human intervention before any Provider, model, endpoint, adapter/config revision, Task/Model Role, prompt contract, budget, Credential Reference or Provider terms are frozen and before any transmission happens.

## Fixed boundary

The recording source is exact [`SampleBooks/sample1.docx`](../../SampleBooks/sample1.docx): 29,550 bytes, SHA-256 `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483`.

The call is:

- local-only, human-attended and manually started;
- limited to one Provider call, with no fallback or automatic retry;
- outside CI, scheduled work and background work;
- bound to an explicit non-`unset` Run Budget Ceiling before transmission; and
- executed only through the actual AI7 product, Primary Agent Harness, Provider adapter, Credential Broker and final Provider Payload/Egress Gate.

Never use `curl`, a side script, a general network tool, a Provider console, or another shortcut. Such a result would not exercise the AI7 path and is outside the policy rule.

## 1. Open a separate recording action

Before touching a Provider, create a separately authorized recording Issue/Change Brief from the then-current exact `dev`. It must name the model-dependent supported journey, the exact implemented AI7 path, this runbook and active Provider Processing Policy v2.

The Commander then requests human intervention. The human must choose and confirm:

- exact Provider and model;
- exact endpoint and adapter/config revision;
- exact Task and Model Role;
- exact public recording instruction and prompt contract;
- an explicit monetary and/or token Run Budget Ceiling that is not `unset`;
- Credential Reference enrollment through AI7's Protected Secret Store and Credential Broker; and
- the Provider's then-current input/output retention, test-reuse and redistribution terms.

Record only non-secret identities, revisions, decisions and digests in the recording brief. Never copy a credential value or Provider payload into the Issue, repository, prompt, generic environment, logs, Session diagnostics or tool results.

Stop if any binding is unknown, mutable or unreviewed; if fallback is not empty; if the budget is `unset`; if the terms do not permit the intended reviewed test reuse; or if the path cannot remain local and human-attended.

## 2. Prepare exact imported lineage

Verify the file path, byte length and SHA-256 before import. Use the supported AI7 import path to create the exact Book, primary Manuscript, Manuscript Revision, source/provenance, fidelity and import records required by the journey. Downstream recording consumes this imported state; it does not read the DOCX through a side path.

The public recording instruction must be human-confirmed, exact, frozen and classified `public-or-synthetic`. It must contain no private material. Confirm the final payload contains only the admitted imported lineage, that instruction and the minimum product/Harness context required by the frozen prompt contract.

## 3. Freeze preflight and staging

Before the single transmission:

1. Freeze the exact Provider Binding, empty fallback chain, Provider Preflight, Plan Envelope, Run Source Scope, Run Authorization, `maxCalls: 1`, non-`unset` Run Budget Ceiling and prompt-contract digest.
2. Reconfirm the active-set pin selects exact Provider Processing v2 and unchanged External Export v1.
3. Create protected local recording staging outside every repository, working tree, sync/shared directory, log root, CI root and distribution root.
4. Configure recording-specific raw request/response capture only in that protected staging. Do not enable general payload logging.
5. Confirm the Credential Reference resolves only through the Credential Broker at the final Provider adapter.
6. Re-run the final Provider Payload/Egress Gate over the fully assembled payload immediately before transmission.

If the gate refuses, a binding drifts, the Provider reports an account limit, or the call outcome is ambiguous, stop. Do not fall back or automatically retry. A second call requires a new exact recording authorization; it is never inferred from the failed or ambiguous attempt.

## 4. Record once

With the human present, start the authorized AI7 product Run and make at most the one frozen Provider call. Keep the product attached until the attempt reaches a classified outcome. A Harness success, model response, tool result or Session event is not an AI7 Effect Receipt and does not prove Provider conformance or model quality.

Do not copy raw content into commentary, screenshots, diagnostics or the repository. Raw request/response bytes and recording-specific technical material remain only in protected local staging.

## 5. Normalize, sanitize and review

Treat the raw response as staging material, never as a fixture. In the protected local workspace:

1. Apply a declared deterministic normalization.
2. Remove secrets, account identifiers, private material, unnecessary source echo and unnecessary Provider metadata.
3. Record provenance and review the then-current Provider retention, test-reuse and redistribution terms.
4. Perform human content review of the exact normalized/sanitized candidate.
5. Compute immutable digests for the source, Provider, model, prompt contract, active Provider Processing policy, raw response and final candidate fixture.

If any review fails, abandon the candidate and delete raw staging. Do not weaken sanitization, substitute a different Provider response, or publish a partially reviewed artifact.

## 6. Admit separately, then replay

Fixture admission requires its own authorized Issue and pull request. That change may add only the reviewed fixture bytes and the non-secret provenance/digest manifest authorized by its brief. It must verify that raw recording material, credentials, private material and unnecessary source echo are absent.

After admission, deterministic replay may be used only through the AI7 local deterministic model adapter inside a complete supported journey. Replay makes no Provider call, repeats no Effect and creates no separate CI gate. Windows and macOS keep the same journey meaning and remain network-disabled during the ordinary E2E interval.

The fixture is development/test material. It does not ship, enter learning, authorize export or publication, grant Public Release Permission, prove current Provider/model quality, prove Provider conformance, or become an Effect Receipt.

## 7. Clean up

Delete the protected raw request/response staging after fixture admission or abandonment. Also delete rejected normalized candidates and disposable recording diagnostics. Preserve only the separately admitted reviewed fixture and its authorized non-secret provenance/digests.

Report what was deleted and whether any retained provider-side copy is governed by the reviewed Provider terms. Never claim local deletion erased Provider-retained data.
