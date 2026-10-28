# Provider Processing Policy v30 — ordinary-production candidate

**UNSELECTED SUCCESSOR DECLARATIONS — runtime activation and exact candidate-byte disposition remain separate.**

[Canonical JSON](provider-processing-policy.v30.json) · [whole-document const schema](provider-processing-policy.v30.schema.json) · [coherent candidate set v21](active-policy-set.v21.json) · [set schema](active-policy-set.v21.schema.json) · [ordinary predecessor v28](provider-processing-policy.v28.md).

[Issue #1156 revision 1](https://github.com/zhouy1017/ai7-harness/issues/1156) defines this declaration-only successor, authored from accepted Wave 21 commit `3355848349f3b1bf177f362530a89d6cb8b7ab59`. v30 directly succeeds ordinary v28, which succeeds v27; development-ci v29 is a different scope and is not v30's predecessor. Set v21 directly succeeds set v20, which succeeds selected set v19. The inherited `lifecycleStatus: active` describes the document lifecycle; it does not select this candidate.

The source-checkout carrier, build inventory and runtime still select set v19: ordinary-production v27, development-ci v1, fixture-recording v2, developer-live v24 and External Export v2. This candidate selects nothing, makes no Provider call, admits no material, dependency or credential, and delivers no reader or feature. Schema validation proves the declared document is exact, not that any runtime enforces it.

| Artifact | Exact UTF-8 SHA-256 |
| --- | --- |
| Ordinary v30 canonical JSON | `f12df1d43cfc9f52b999c2cc8a6e9bac419177d42210d3bbe8c5008ba8d6a59e` |
| Ordinary v30 schema | `5a7c1603dcea97143d24b31c31f0709d1fd3202e7c048e7d65ed085c845046ef` |
| Set v21 canonical JSON | `4b845e924df777f440b07d53ba6e31447e0fe0b004e86efa89bf76554fb05392` |
| Set v21 schema | `3d262deb0996ba7b61b8540589e03b6d5255ee9b6b17723fae144134ee9efb84` |

The design authority is accepted [ADR 0099 §§1–2 and 5–6](../adr/0099-distinguish-public-release-from-scoped-global-agent-processing.md), explicitly composed with accepted [ADR 0100](../adr/0100-admit-scoped-editor-task-instruction-text.md) and [ADR 0101](../adr/0101-admit-scoped-full-fidelity-learned-examples.md). Their exact accepted sources are respectively `c82b105f2a4c3dcaa283c878d7b0889532b0bc8e` ([acceptance](https://github.com/zhouy1017/ai7-harness/issues/1123#issuecomment-6394479236)), `825cb2d88dee06c51677e83ae6a8510679aea16d` ([acceptance](https://github.com/zhouy1017/ai7-harness/issues/1134#issuecomment-6393191200)) and `a32462d98d1cf578eea00226dc4add22799092b3` ([acceptance](https://github.com/zhouy1017/ai7-harness/issues/1141#issuecomment-6393191444)). Accepted #1155 supplies their composed text at the authoring base. The privacy purpose is already accepted; exact successor-byte review, selection, typed consumers and final gates remain required.

## The six-part original-field requirement

`originalFieldQualification.qualificationId` is exactly `ordinary-production-original-fields-adr0099`. All six definitions below are required, and every applicable obligation is conjunctive. These are requirements for future faithful consumers, not execution receipts or proof-by-boolean. Conditional research, fragment and authored-typos obligations apply only when the actual recipient, fragment or branch is used. They require no invented Task, Run, web recipient, fragment or source and grant none.

1. **Operation.** Only an independently authorized ordinary-production purpose, source read and origin qualifies. Use its real Task, Plan, Run and stage when present, otherwise its existing dialogue attempt, Fast action or connection-test action. Background processing needs its independently authorized explicit queue, matching enrollment or enabled-learning envelope, with the applicable finite ceiling, source pins, envelope and idle conditions. No second learning enrollment or per-pass click is added. Moving foreground presentation into the background changes no origin. No new operation authority follows.
2. **Field.** Only original words in an independently admitted typed field or bounded projection qualify, under the exact source/version, purpose/category, complete package and recipe. Bounds apply to actual transmitted values; fidelity, attribution, framing, citations and exclusions remain. No field, whole record, source read, personnel/role/attribution structure, Note/Internal Note/Personal Highlight object, secret or credential value is admitted, and missing proof cannot become an empty field. `ai7.editorial-learning-example/1` is explicitly excluded. No raw example contract is created. A retained fragment must be the existing Harness Session Ledger's complete fragment under its permitted continuation, carrying every influencing source's provenance and restriction. No third transcript, reconstruction, relabeled old attempt or cross-Task reuse is granted. Unknown or mixed restrictions hold affected processing without lossy elision or silent fallback.
3. **Model recipient.** The actual attempt or stage must bind exactly `modelRole`, `provider`, `route`, `model`, `protocol`, `credentialReference` and `credentialGeneration`. This does not mean all configured providers or a fallback chain. It changes no role or capability evidence; the Credential Broker stays unchanged.
4. **Research recipients.** Only the same operation's independently authorized research can carry its already-admitted model-produced query (`web-search-query`) to its selected policy-admitted backend, or its actual admitted model-cited/search-returned URL (`public-source-fetch`) through the existing citation and destination checks. The declared protocol may serialize the same bounded query in existing query/body fields. No separate raw bundle, additional field, header, referrer, upload channel, manufactured/unbound URL, other model/tool/subagent/stage/host/recipient or network capability is granted. An authorized model-only path needs no absent research authority.
5. **Recipe and rule.** Both must authorize every actual field and recipient. A missing typed consumer contract holds the affected use. No-web and tools-free recipes stay so; local tools stay local; curation gains no search/tool and retained Global gains no handler. All inherited counts, byte limits, breakers, budgets and account stops remain. The authored-typos branch is precisely ADR 0100 §1 as qualified by ADR 0099 §5.1: House-authored saved `editorInstruction`, `editorial-review/typos-and-usage`, bound Main Editorial Role, explicitly started foreground, no Default Rule, Deferred Start or background origin, and no web, tools, secondary recipient or subagent. Its 1,200-grapheme/version/framing limits stay. This branch does not impose Main/typos on other independently admitted fields. Raw-example source and consumer contracts must be separately typed and admitted under ADR 0101 as qualified by ADR 0099; none is created here.
6. **Currentness.** Existing purpose-specific source, control, policy and binding owners must recheck after a capacity wait, immediately before every physical model/search/fetch send, and before new-result publication where the consumer requires it. Exact prepared pins and applicable current authority must agree. An unrelated change or newer version alone does not invalidate an otherwise authorized historical pin. Loss or mismatch refuses the affected new send without silent refresh, fallback or resend; sent outcome, cost, checkpoints and history remain. A possibly sent request is not automatically resent, and frozen A is not retargeted to B.

The exact complete declaration is reproduced below as policy requirements. It records no per-operation identity, payload, source ID, credential value or runtime success.

```json
{
  "qualificationId": "ordinary-production-original-fields-adr0099",
  "requirements": {
    "operation": {
      "operationalScope": "ordinary-production",
      "independentPurposeSourceAndOriginRequired": true,
      "identity": "actual-operation-identity-only",
      "taskPlanRunAndStageWhenPresentRequired": true,
      "existingDialogueFastOrConnectionActionWhenApplicableRequired": true,
      "inventedTaskOrRunAllowed": false,
      "backgroundOrigin": "independently-authorized-explicit-queue-or-matching-enrollment-or-enabled-learning-envelope",
      "applicableFiniteCeilingSourceEnvelopeAndIdleConditionsRequired": true,
      "additionalLearningEnrollmentOrPerPassClickRequired": false,
      "presentationChangesOrigin": false,
      "newOperationAuthorityGranted": false
    },
    "field": {
      "representation": "original-words-in-an-independently-admitted-typed-field-or-bounded-projection",
      "exactSourceVersionPurposeCategoryCompletePackageAndRecipeRequired": true,
      "existingBoundsFidelityAttributionFramingCitationsAndExclusionsRequired": true,
      "boundsApplyToActualTransmittedValues": true,
      "newFieldWholeRecordOrSourceReadGranted": false,
      "missingDataMayBecomeEmptyField": false,
      "newStructuredPersonnelRoleOrAttributionAdmissionGranted": false,
      "editorNoteInternalNoteOrPersonalHighlightObjectAdmissionGranted": false,
      "credentialOrSecretValueAdmissionGranted": false,
      "excludedContractIds": ["ai7.editorial-learning-example/1"],
      "newRawExampleContractGranted": false,
      "retainedFragments": {
        "owner": "existing-harness-session-ledger",
        "completeFragmentAndPermittedContinuationRequired": true,
        "everyInfluencingSourceProvenanceAndRestrictionRequired": true,
        "thirdTranscriptReconstructionOrOldAttemptRelabelingAllowed": false,
        "crossTaskReuseGranted": false,
        "mixedRestrictionFailure": "hold-affected-processing-without-lossy-elision-or-silent-fallback"
      }
    },
    "modelRecipient": {
      "actualAttemptOrStageBindingRequired": true,
      "bindingMembers": ["modelRole", "provider", "route", "model", "protocol", "credentialReference", "credentialGeneration"],
      "allConfiguredProvidersOrFallbackChainAllowed": false,
      "roleReassignmentOrCapabilityProofGranted": false,
      "credentialBrokerUnchanged": true
    },
    "researchRecipients": {
      "sameOperationIndependentResearchAuthorityRequired": true,
      "searchField": "already-admitted-model-produced-query",
      "searchCategory": "web-search-query",
      "searchRecipient": "selected-policy-admitted-search-backend",
      "fetchField": "actual-admitted-model-cited-or-search-returned-url",
      "fetchCategory": "public-source-fetch",
      "citationAndDestinationChecksRequired": true,
      "existingDeclaredQueryProtocolSerializationAllowed": true,
      "separateRawBundleOrAdditionalFieldHeaderReferrerUploadChannelAllowed": false,
      "manufacturedOrUnboundUrlAllowed": false,
      "otherModelToolSubagentStageHostOrRecipientGranted": false,
      "newNetworkCapabilityGranted": false
    },
    "recipeAndRule": {
      "bothActualRecipeAndSelectedRuleMustAuthorizeEveryFieldAndRecipient": true,
      "missingTypedConsumerContractResult": "hold",
      "noWebAndToolsFreeRecipesRemainUnchanged": true,
      "localToolsRemainLocal": true,
      "curationSearchOrToolCapabilityGranted": false,
      "retainedGlobalHandlerCapabilityGranted": false,
      "allInheritedCountsBytesBreakersBudgetsAndAccountStopsRequired": true,
      "authoredTyposInstructionBranch": {
        "authority": "ADR0100-section1-as-qualified-by-ADR0099-section5.1",
        "source": "house-authored-saved-editorInstruction",
        "taskKind": "editorial-review/typos-and-usage",
        "modelRole": "Main Editorial Role",
        "origin": "explicitly-started-foreground",
        "defaultRuleDeferredStartOrBackgroundOriginAllowed": false,
        "webToolsSecondaryRecipientsOrSubagentsAllowed": false,
        "existing1200GraphemeVersionAndFramingLimitsRequired": true
      },
      "rawExampleSourceAndConsumerContracts": "separately-typed-and-admitted-under-ADR0101-as-qualified-by-ADR0099-not-created-here"
    },
    "currentness": {
      "owner": "existing-purpose-specific-source-control-policy-and-binding-owners",
      "checks": ["after-capacity-wait", "immediately-before-each-physical-model-search-or-fetch-send", "before-new-result-publication-when-consumer-contract-requires"],
      "exactPreparedPinsAndApplicableCurrentAuthorityRequired": true,
      "unrelatedChangeOrNewerVersionAloneInvalidatesHistoricalPin": false,
      "lossOrMismatch": "refuse-affected-new-send-without-silent-refresh-fallback-or-resend",
      "sentOutcomeCostCheckpointsAndHistoryPreserved": true,
      "possiblySentAutomaticResendAllowed": false,
      "frozenVersionRetargetAllowed": false
    }
  }
}
```

## Fourteen rule redaction wrappers

Only each rule's `redaction` value changes, in this inherited order. All other source, kind, role, origin, execution, research, payload, counting and output declarations remain those of [v28](provider-processing-policy.v28.json).

| Rule ID | Wrapper qualification |
| --- | --- |
| `ordinary-production-baseline-analysis` | Same six-part predicate; actual bound model and admitted fields |
| `ordinary-production-editorial-dialogue` | Same predicate; explicit real attempt and complete fragments; no web |
| `ordinary-production-review` | Same predicate; actual selected recipe retains its own tools/source conditions |
| `ordinary-production-writing` | Same predicate; no additional instruction or raw-example consumer |
| `ordinary-production-evaluation` | Same predicate; readers-report remains no-web |
| `ordinary-production-editorial-polish` | Same predicate; Fast foreground suggestions and bounded generalized preference |
| `ordinary-production-conflict-regenerate` | Same predicate; one conflict region and Fast action |
| `enrolled-background-manuscript-analysis-processing` | Same predicate; exact enrollment, finite ceiling and idle conditions |
| `ordinary-production-material-translation` | Same predicate; frozen bounded source, tools-free Fast action |
| `ordinary-production-custom-analysis` | Same predicate; dimension-version question, no web/tools |
| `ordinary-production-global-agent-dialogue` | Same predicate; listed eligible projections, explicit attempt, current no-tools rule |
| `enrolled-background-processing` | Same predicate; exact enrolled kind/origin/source/finite ceiling |
| `ordinary-production-learning-curation` | Same predicate for otherwise admitted fields; entire native `/1` remains excluded |
| `enrolled-background-factual-recheck` | Same predicate; exact one-claim request-evidence/enrollment and verification limits |

Every wrapper has `mode: qualified-original-field-processing`, `qualificationRef: ordinary-production-original-fields-adr0099` and `qualifiedOriginalWords: preserve-within-existing-field-contract`. Its `unqualified` is exactly the old four-member object: `housePeopleNamesAndRolesStripped: true`, `remarksAndInternalNotesStripped: true`, `authorInformationAllowed: true`, `houseNameAllowed: true`. No old true becomes an unconditional false.

`unqualified` preserves the predecessor field rule. A stale or failed new raw preparation is not silently downgraded to redaction or a plain request: the actual preparation/consumer retains its honest refusal or hold. An independently valid legacy/plain operation may still exist under its own contract. This declaration implements no fallback or new control flow.

## Six nested restrictions and four descriptions

Each listed block replaces only the scalar restrictions below with `textProcessing`, using the same four wrapper keys and mode/reference/originals values. The removed scalars are exactly its `unqualified` defaults.

| Rule/block | Exact `textProcessing.unqualified` | Other conditions preserved |
| --- | --- | --- |
| review `houseReviewPreference` | `housePeopleNamesAndRolesStripped: true`, `authorOrEditorNamesAllowed: false` | 12 lines / 200 total graphemes, same-house judged source/version, no manuscript text |
| polish `houseReviewPreference` | Same two defaults | Same bounded generalized line; Fast foreground/no-web/suggestions-only |
| learning-curation `houseReviewPreference` | Same two defaults | `purpose: candidate-reference-and-deduplication-only`; no raw before/proposal/after/reason |
| custom-analysis `editorAuthoredQuestionTemplate` | Same two defaults | 400 graphemes, dimension-version attribution, no manuscript/framing override, no web/tools |
| review `editorTaskInstruction` | `personNamesAllowed: false` | 1,200 graphemes, procedure-version attribution and no framing override; authored branch conditions above |
| review `houseReviewGuidelineClause` | `personNamesAllowed: false` | 40 clauses × 300 graphemes and imported-document-version attribution |

In the first four blocks only, one exact `descriptionZh` substring `绝不含作者或编辑姓名` becomes `姓名、角色或私密措辞仅在满足本文件原文字段资格时保留，否则沿用原有限制`. The `绝不含稿件正文` exclusion, all numeric bounds, version/source restrictions and framing stay. Names inside a bounded derived line do not admit a structured name/role/author attribution array or a raw exemplar.

## Nine approved inherited decisions

The [nine-row Owner approval](https://github.com/zhouy1017/ai7-harness/issues/1071#issuecomment-6393190963) of [packet 6387752881](https://github.com/zhouy1017/ai7-harness/issues/1071#issuecomment-6387752881), reviewed `a60c843d97a827aea42ad4db004d143921ae9acf`, remains the source of these exact declarations. Only the expressly qualified ordinary text restrictions above differ; all non-privacy conditions remain exact.

| Row | Preserved declaration |
| --- | --- |
| 1 | Full native `ai7.editorial-learning-example/1`, curation-only, required-redacted, complete 15-field model projection and local manifest/digest/roster. At most 10 whole examples, 2,048 graphemes per before/proposal/after side, 512 reason, 16,000 total and 131,072 canonical UTF-8 bytes; opaque IDs 128 and local material keys 256. Exact lineage, eligible proposal decisions, enabled-learning finite envelope and explicit acceptance. No truncation, fabricated evidence or automatic activation; `redactionLifted: false`. The **entire** `learningExamples` subtree is structurally identical to v28. It cannot qualify through a surrounding wrapper. |
| 2 | Polish's real generalized preference remains 12 lines / 200 graphemes, source/version-attributed, deliberate foreground Fast action, no web and suggestions only. The text qualification adds no raw exemplar. |
| 3 | Fixed-public DeepSeek Search test: POST `https://api.deepseek.com/v1/tools/search`, exact arguments `query: UNESCO World Book and Copyright Day April 23`, `count: 10`, `need_content: false`, canonical argument digest `ae23d5c44e8eec9398f100d153f0f5042bd7fe388f50c6c57aba1825659f629c`. Existing ready exact connection/broker/action pins; one request, 25,000 ms, 2,097,152 response bytes, at most three transient title/URL pairs bounded 120/2,048 Unicode code points. No retry/fallback, raw or editable field, fixture success, durable content, link following or Task-backend promotion. The separate model connection test also stays byte-for-value unchanged. |
| 4 | Whole-manuscript standard/strict factual stages keep `ai7-procedure/factual-claim-check`, extraction/verification `/1` and immutable ledger `/1`: U coverage units, at most 200 assertions/unit, C exact eligible occurrences, U+C initial sessions, U+129C model and 3C search submissions. Verification stays 129 model / 128 rounds / three distinct durable searches per claim; 16,384 metadata bytes plus the exact authorized source-unit bytes. Extraction has zero tools; no new retry, inherited +1 or semantic coalescing. Foreground ceiling stays actual value-or-unset. |
| 5 | One exact preexisting-claim enrolled recheck requires latest current `ai7.factual-review-decision/1` request-evidence and same-Book active enrollment, unchanged source/result/claim/decision pins, mandatory finite ceiling and durable once key `(enrollmentId, ledgerDigest, claimId, decisionId)`. Verification only: 129 model / 128 rounds / three searches, pre-send durable reservations, failed/unknown spends its slot, no counter reset, extraction, retry, ledger refresh, append/replacement, unresolved-result loop or retained-source reuse. |
| 6 | Exact unchanged development-ci v29 and its six fixture-only rules: review, Global dialogue, curation, polish, factual stages and recheck. Admitted public/synthetic pinned inputs, zero live/credential/remote fallback/recording. Only review/stages/recheck obtain the declared 4/3/1 execution and 180-second/one-Retry-After transport capabilities; factual retry=false overrides them. Global remains no-tools, curation has no activation and other/legacy rules inherit no new capabilities. |
| 7 | Ordinary instruction 1,200/version/framing and guideline 40×300/imported-document bounds remain. Unchanged v29 admits its instruction only for typos-and-usage and guideline only for style-and-format, with their exact typed input pins and redaction. Ordinary qualified words add no kind, role, origin or missing source consumer. |
| 8 | Coherent trusted scope selection and exact pins below; no product-setting/env/provider/plugin selector, cross-scope fallback or implicit activation. |
| 9 | v29's complete metadata-only legacy compatibility inventory remains 47 closed tuples, 13 registered evidence cases and 53 fixture file pins. Tuple manifest SHA-256 `2572c1b5aa05d6ccc9a60a2a8a03ba2cefc10d5f48c1a85377d53797360bc0d2`; all-file inventory `2f15e004949aba1d1e8e537b7223dd1bade7b39db994e9e56164df38fe3f1e53`. Frozen809 code pins are historical reconstruction provenance, not current code equality or a grant of 4/3/1. New contracts cannot fall back to this profile; old Plans/request identities stay frozen. No fixture payload is duplicated or repinned. |

All other v28 objects remain structurally equal, including authority separations, trusted selection, ordered rule IDs, kinds, roles, origins, source categories and predicates, execution, transport, research, subagents, all bounds/retries/receipts and both connection tests. Every old canonical policy, schema and projection remains immutable. Public release, Apply, export, dependencies, secrets and development-material restrictions do not change. Supplied words never grant an Editor Note, internal-note object, Personal Highlight or anchored manuscript read.

## Coherent unselected set v21

Only set identity/predecessor/schema metadata and the ordinary-production pin change from set20. Each SHA-256 pins the exact canonical JSON bytes, never a schema or projection; no document hashes itself.

| Scope/policy | Version and canonical path | SHA-256 |
| --- | --- | --- |
| ordinary-production | [v30](provider-processing-policy.v30.json) | `f12df1d43cfc9f52b999c2cc8a6e9bac419177d42210d3bbe8c5008ba8d6a59e` |
| development-ci | [v29](provider-processing-policy.v29.json) | `c9545a5f461a7791115c1f4664bbd731757775951f814d39c28b12c85af88c9d` |
| fixture-recording | [v2](provider-processing-policy.v2.json) | `d0e3996ce7ba091200d83178b48fb578090bf73b509406182a2d5403ab2a4ebc` |
| developer-live | [v24](provider-processing-policy.v24.json) | `1522e203f3ead6a259f93494e25c34526a024f93a757b1c7d22568e219f4a6b6` |
| External Export, all scopes | [v2](external-export-policy.v2.json) | `162441cc3e5d30b0cafb00a0d04ca5ab32b64c5039baafc8952a9925bd7984b6` |

## Unavailable consumers and actual next work

The existing validator understands the complete root-const declaration; the selected runtime does not understand these wrappers. The current literal-version/redaction readers deliberately cannot activate v30 by loading a declaration. No permissive cast, version-only activation, old-reader fallback or runtime interpreter is added.

| Existing owner | Missing bounded delivery |
| --- | --- |
| `config/source-checkout-launch-authority.json`, `tools/build.mjs` | Trusted coherent selection and built-file inventory; both remain set19/current pins |
| `src/service/launch-policy.ts`, `src/shared/protocol.ts` | Shared async/sync strict verifier and truthful closed projections, preserving four-file verification and every scope/rule |
| `src/service/task-authorization.ts`, `src/service/analysis/baseline-analysis-store.ts`, `src/service/analysis/execution.ts` | Actual Task/Plan/origin, persisted attempt/frozen-route and pre-mutation/current-send compatibility |
| `src/service/provider/egress-gate.ts`, `platform-tools.ts`, `platform-tool-session.ts` | Final actual recipient/payload, citation/destination and tool/session admission |
| `src/service/dialogue/global-agent-session.ts`, `dialogue-route.ts`, `dialogue-ledger.ts`, `fragments.ts` | First no-tools Global consumer, closed payload/redaction/provenance, complete fragment lineage and currentness |
| `src/service/house-review-preference.ts`, `src/service/store.ts`, `src/service/analysis/custom-analysis-contract.ts`, `src/service/review/review-category-contract.ts`, `src/service/fast-role/polish-contract.ts` | Actual generalized line, question, instruction/review and polish composition; content qualification admits no extra metadata/records |

The separately assigned first reader/selection/no-tools Global child must preserve every v29/set rule, 47 historical fixture tuples, old Plan pins and honest refusals for unsupported contracts. Direct set19→a new coherent selection can avoid transient set20 activation. A frozen v27 request cannot be relabeled or continued by guessing current policy.

F26 authored instruction, generalized review/polish/template projections, native C1 raw examples, Word/manual full source families, raw-example review/polish/Book/Global consumers and F06 source/tools/retained research/Annotation contracts remain separate. Their exact wrapper versions and payload contracts are absent. No guessed raw successor, automatic learning activation, F18 subagent, additional factual stage, retained-web reuse, external material or proposed ADR0102/0103 operational contract is declared here. Current Global no-tools and publication-risk/plot-consistency/readers-report no-web restrictions remain.

## Policy-review walkthrough

These are declaration reviews, not live behavior tests.

| Scenario | Required declaration interpretation |
| --- | --- |
| Original manuscript/question/generalized preference line | Only the actual independently admitted field or bounded projection, exact version/purpose/recipe, source exclusions, framing and payload bounds can qualify |
| Typed decision reason versus Note object | Proven record type/producer distinguishes them; equivalent words grant no Note object or anchored-source read; legacy `/1` still remains redacted |
| Authored typos versus wrong role/origin/recipe | House saved instruction/Main/explicit foreground/tools-free and 1,200/version/framing conditions apply to that branch; another field needs its own independently admitted contract |
| Real query/citation URL versus raw upload/unbound host | Same-operation independent research and both recipe/rule admit only the bounded query or actual citation/search-returned URL; no new field/channel/host |
| Complete current fragment versus unknown/mixed/stale provenance | Existing ledger owns the complete continuation; every influencing restriction/current pin must agree or affected new processing holds without elision/fallback/history rewriting |
| Legacy `/1` versus missing raw successor | Entire native redacted/curation-only subtree remains exact; no raw wrapper or consumer is manufactured |
| Development fixture | v29/set pin, six closed rules and complete47/13/53 inventory are unchanged; no ordinary privacy lift crosses scope |

Validation adds exactly two policy/schema pairs (49→51 at this base), exact six-part and14/6/4 comparison, independent bounded inverse inheritance and negative document mutations through the unchanged validator. E2E projection is **exact reuse — checked unchanged**. The final JSON/schema/test candidate still needs a fresh approved independent Reviewer, actual final head/base and all seven background-guest layers (`doctor → bootstrap → check → test → service → build → e2e:all`), current Journeys, the existing Gate and role completion/release. Those demonstrate preserved selected Journeys, not original-field behavior. Final base/guest/slot, exact candidate-policy-byte disposition, Ready and guarded merge remain Commander-owned; keep the PR Draft until that sequence is complete.
