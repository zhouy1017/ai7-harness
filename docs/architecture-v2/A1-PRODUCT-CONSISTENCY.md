# A1 — One-product consistency and UI parity

Status: **Issue #4 decision-ready noncanonical contract; owner choice not made**

Working premise: the owner asked for Windows and macOS with a “consistent product outlook,” as recorded exactly by the [Commander review packet](../architecture-exploration/REVIEW-PACKET.md#audited-candidate-input--platform-q16-and-phase-0). Canonical `main@c8cbe26` remains Windows-only. This document defines what the premise could mean without promoting candidate ADR 0027, choosing an implementation mechanism, or making the platform promise on the owner's behalf.

Source keys such as `C-07`, `U-I`, and `P-W` resolve to immutable Git objects in the [crosswalk source registry](./A1-EVIDENCE-CROSSWALK.md#source-registry).

## Contract vocabulary

**Supported cell** means one declared combination:

`{OS floor × CPU architecture × distribution-channel outcome × support tier}`

**Shared product semantics** means the same domain identity, preconditions, authority, state transition, negative guarantees, user-observable outcome, and evidence obligation in every supported cell at the same tier.

**Native variation** means a declared OS-specific presentation or facility that preserves all shared semantics. It is not a waiver for missing capability, weaker authority, silent data loss, weaker privacy, or a different product edition.

**Parity** is tested by comparing records and outcomes for the same journey and starting state, not by comparing pixels, source trees, toolkits, or package shapes. The 79 requirements and fourteen journeys are candidate inputs and have exact dispositions in the [evidence crosswalk](./A1-EVIDENCE-CROSSWALK.md).

## Stable invariant list

These invariants do not depend on the owner's later choice among the support/parity options. The first eleven rest on accepted canonical records; I-12 and I-13 are derived guardrails needed to make any cross-platform promise honest.

| ID | Shared invariant in every supported cell | What may vary natively | Exact basis |
| --- | --- | --- | --- |
| **I-01** | Product identity is exactly **AI7**; Chinese-first professional literary-publishing work, Standalone scope, and V1 Word exclusion retain one meaning. | OS chrome, fonts, menu placement, input conventions. | [C-A](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-ED](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-13](./A1-EVIDENCE-CROSSWALK.md#source-registry). |
| **I-02** | AI7 business/domain records retain their exact identities and ownership and remain separate from whichever executor's technical history survives A2. Technical records may correlate only through an exact binding; none becomes an AI7 Task, Run, Workflow, Effect, Receipt, manuscript, or Book-scope record. Under the conditional Codex-closure pass, DeepSeek produces no product Session/tool history at all. | Executor technical primitive, protocol, and UI projection; never AI7 record meaning. | [C-02](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-06](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-08](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-11](./A1-EVIDENCE-CROSSWALK.md#source-registry), post-packet [OD-2026-08-21](./DECISION-QUEUE.md#od-2026-08-21--v2-harness-selection-direction-recorded-not-pending), and exact [OR-2026-08-21-01](./DECISION-QUEUE.md#or-2026-08-21-01--conditional-primary-agent-harness-role-resolved-not-pending). |
| **I-03** | Exact Book/deliverable/revision/selection, Run Source Scope, provider-processing scope, Outbound Data Category, budget, expected outcome, and Effect classes are bound and understandable before Run Authorization. | Layout, disclosure controls, and native focus/notification behavior. | [C-09](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-10](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-17](./A1-EVIDENCE-CROSSWALK.md#source-registry). |
| **I-04** | Run Authorization, Execution Grant, Proposal Decision, Review Decision, Effect Approval, Public Release Permission, and Effect Receipt never collapse. Executor approval, sandbox grant, tool consent, or lifecycle state grants none of those AI7 authorities and proves no Effect outcome. | Confirmation surface and platform interaction pattern; never authority class or proof. | [C-07](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-ED](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-EX](./A1-EVIDENCE-CROSSWALK.md#source-registry), and post-packet [OD-2026-08-21](./DECISION-QUEUE.md#od-2026-08-21--v2-harness-selection-direction-recorded-not-pending). |
| **I-05** | Textual fidelity never becomes factual truth. Reference Integrity, Claim Support, and Factual Verification remain independent; unresolved/conflicting evidence stays visible; Foundation Model knowledge is not evidence. | Evidence-card presentation, exact-jump control, native return-focus behavior. | [C-05](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-26](./A1-EVIDENCE-CROSSWALK.md#source-registry). The Q16 five-rule extension is candidate evidence [P-F](./A1-EVIDENCE-CROSSWALK.md#source-registry), not silently accepted here. |
| **I-06** | Generated manuscript changes are proposal-first and exact-pin-bound; interacting conflicts require explicit resolution; apply is atomic; journal, Manuscript Checkpoint, recovery state, and Recovery Snapshot remain distinct. | Diff presentation, crash/startup interaction, native durability plumbing. | [C-06](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-07](./A1-EVIDENCE-CROSSWALK.md#source-registry). |
| **I-07** | Each deliverable owns its Workflow Instance; gates, Review Decisions, Signoff Records, Delivery Packages, external export, and public release retain separate authority and proof. | Phase layout, destination chooser, native file/share interaction. | [C-07](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-08](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-17](./A1-EVIDENCE-CROSSWALK.md#source-registry). |
| **I-08** | Editorial Learning is not Model Training; explicit eligibility outranks inference; lineage is inspectable; quality and workload displacement are paired; N=0 never blocks work; per-task time tracking remains absent. | Feedback control, charts, audit navigation, native accessibility semantics. | [C-03](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-04](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-19](./A1-EVIDENCE-CROSSWALK.md#source-registry). |
| **I-09** | Manuscripts remain outside repositories/hosted CI/distributable evidence; configured provider processing is not public release; editorial users receive AI7 domain capabilities, never a generic shell, roaming filesystem, arbitrary network, developer-profile escalation, or inherited coding defaults. The executor cannot define AI7 domain, Policy, Effect, ledger, or UX authority. | Native file selection, secure-store prompts, path/location explanation. | [C-16](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-17](./A1-EVIDENCE-CROSSWALK.md#source-registry), and post-packet [OD-2026-08-21](./DECISION-QUEUE.md#od-2026-08-21--v2-harness-selection-direction-recorded-not-pending). |
| **I-10** | Professional editing has one fidelity contract and one declared scale promise: no silent loss, preserve/degrade/reject disclosure, whole-manuscript operations, and the accepted 500K/1M/10M outcomes. | Text-service behavior and measured budgets; no mechanism is selected in A1. | [C-A](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-13](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-25](./A1-EVIDENCE-CROSSWALK.md#source-registry). |
| **I-11** | Parallel Runs, pause/cancel, durable clarification, Task Outcome, Resume/Retry/Redo/Replay, partial outcomes, and ambiguous-outcome stop rules retain identical identity consequences. | OS background lifecycle, notification, window attention, disabled-state presentation. | [C-07](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-11](./A1-EVIDENCE-CROSSWALK.md#source-registry), [C-21](./A1-EVIDENCE-CROSSWALK.md#source-registry). |
| **I-12** | Native accessibility must preserve the product promise chosen below: essential journeys cannot lose exact focus, keyboard reachability, Chinese composition integrity, non-color semantics, reflow/zoom, or authority/evidence meaning without a declared lower support tier. | Screen reader, contrast mode, IME, key chords, system focus APIs, typography metrics. | Candidate cross-cutting journey [U-I §16 / J-14](./A1-EVIDENCE-CROSSWALK.md#source-registry), [U-U](./A1-EVIDENCE-CROSSWALK.md#source-registry); evidence is not yet run. |
| **I-13** | Every material platform difference is declared against exact supported cells, carries evidence, and never changes I-01–I-11. Unsupported/preview behavior is labeled before use, not discovered through failure. | Only the bounded differences admitted below. | [K-D](../architecture-exploration/CANDIDATE-DELTA-REVIEW.md#first-three-investigations) and the proposed principles in [Round 1](../architecture-exploration/ROUND-1-REVIEW.md#proposed-v2-principles). |

### A2 — Codex-first agent harness selection and composition closure handoff

The Commander may declare this invariant list stable without waiting for the owner to fill the option tuple. That confirmation is the only A1 dependency for a separately briefed, read-only, noncanonical **A2 — Codex-first agent harness selection and composition closure** investigation. Exact owner resolutions [OR-2026-08-21-01](./DECISION-QUEUE.md#or-2026-08-21-01--conditional-primary-agent-harness-role-resolved-not-pending) and [OR-2026-08-21-02](./DECISION-QUEUE.md#or-2026-08-21-02--codex-gap-closure-and-deepseek-runtime-re-entry-resolved-not-pending) say that a future **Codex Harness Capability Closure** pass makes Codex the sole production Primary Agent Harness and DeepSeek a Development Reference Framework only; they do not assert the pass. A claimed gap must be proven against an exact Codex surface, then assessed for a costed Codex-based secondary-development closure. DeepSeek can re-enter comparison only after both an exact Codex gap and a Mature Runtime Alternative are proven, and even then requires a new owner choice rather than becoming fallback or a second loop. The owner choice below instead gates canonical product promises and the later coherent candidate; it gates neither A2 nor A3 work. **Primary Agent Harness**, **Development Reference Framework**, **Harness Capability Closure**, **Codex Capability Gap**, **Codex Secondary Development**, **Mature Runtime Alternative**, and **DeepSeek Runtime Re-entry Gate** are defined in the candidate [Execution context](./domain/execution/CONTEXT.md), indexed bilingually in the [candidate glossary](./GLOSSARY.md), and dispositioned in [candidate ADR 0001](./adr/0001-conditional-primary-agent-harness-and-gap-closure.md); all three are candidate-local and noncanonical. This branch still stops after A1 and does not begin A2.

## Native variation contract

A difference qualifies as native variation only when all seven tests pass:

1. **Same semantic input:** the same Book, pins, scope, plan, payload, destination class, and governing constraint reach the action.
2. **Same record transition:** the same authoritative record classes, preconditions, identity bindings, terminal states, and history are produced.
3. **Same negative guarantees:** no platform weakens no-silent-loss, scope, factual uncertainty, atomic apply, receipt proof, recovery, credential secrecy, or public-release separation.
4. **Same declared feature promise:** the difference is permitted by the selected feature/support option for that exact cell.
5. **Same accessibility tier:** native interaction can differ, but the selected accessibility outcomes remain demonstrable.
6. **Visible and attributable:** the user sees any material difference before relying on it, and the release evidence identifies its supported cells.
7. **Reversible classification:** if later evidence shows authority, data, fidelity, or accessibility impact, the item leaves the native ledger and returns to product/parity decision.

### Allowed adapter-bound concerns

| Concern | Allowed variation | Variation must never change |
| --- | --- | --- |
| Window/menu conventions | Chrome, menu placement, tabs/windows, system close/minimize behavior. | Current authoritative object, unsaved/recovery handling, or action meaning. |
| Commands and shortcuts | Native chord and discoverability convention. | Command name, availability at the selected tier, IME safety, confirmation, or result. |
| Text/input/accessibility | IME, screen reader, contrast/reduced-motion/zoom mapping, font fallback, caret/candidate window. | Text content, exact range, focus return, non-color meaning, or authority action. |
| User-selected files/destinations | Native picker, drag/drop, path display, bookmark/token/permission flow. | Bounded source/destination, provenance, fidelity disclosure, or agent filesystem authority. |
| Data/secret/trust presentation | Native names and prompts for local data, protected secrets, application trust, and security decisions. | Secret exposure, scope, provider-processing distinction, or the honest strength of the runtime boundary. |
| Distribution experience | Native entry/exit, installation, relocation, removal, and update presentation at the selected channel outcome. | Product data/recovery semantics, compatibility disclosure, or support tier. |
| CPU artifact | Native artifact identity and installation choice. | Feature, authority, fidelity, scale, accessibility, and evidence promised for that cell. |
| Bounded OS integration | Explicitly named native integration in the exception ledger. | Core journeys or any I-01–I-11 semantic. |

This classification does not select a package, updater, secret store, IPC carrier, sandbox, editor, renderer, or store.

### Native Exception Ledger contract

Every permitted exception needs: stable ID; affected supported cells; shared command/outcome; native rationale; user-visible difference; authority/data/fidelity/accessibility impact (normally `none`); evidence owner; expiry/review point; and invalidation condition. An exception with material authority, privacy, fidelity, or recovery impact is not a native exception—it is a support/parity decision.

## Mutually exclusive owner-choice axes

The axes are deliberately separate. The owner chooses **exactly one row from each set**, then the combination is checked for contradictions. A1 does not fill exact OS versions, CPU names, package formats, or release dates.

### 1. OS floor policy

| Option | Promise rule | Trade-off | Required evidence before exact values |
| --- | --- | --- | --- |
| **O1 — Fixed product-major floors** | Each AI7 major version names a minimum for each OS and holds it until an explicit deprecation. | Best enterprise predictability; longest legacy verification/security burden. | Target-house fleet, vendor lifecycle, native capability and security evidence. |
| **O2 — Rolling vendor window** | Support follows a declared “current plus N prior vendor-supported versions” rule. | Clear moving boundary; slow-upgrading houses may lose support between AI7 releases. | Vendor lifecycle and measurable target-house upgrade cadence. |
| **O3 — Release-specific evidence floor** | Every release declares floors justified by its required capabilities and observed fleet. | Most evidence-honest and flexible; hardest promise to understand and floors may fluctuate. | Per-release native evidence plus user-fleet impact assessment. |

No admitted object contains a minimum OS version; the [review packet](../architecture-exploration/REVIEW-PACKET.md#audited-candidate-input--platform-q16-and-phase-0) explicitly leaves it open.

### 2. CPU policy

| Option | Promise rule | Trade-off | Evidence dependency |
| --- | --- | --- | --- |
| **C1 — All vendor-current native families** | Every CPU family still actively supported by each OS vendor is a native supported cell. | Broadest reach; largest dependency, performance, accessibility, security, and release matrix. | Native closure and per-cell journeys/evidence. |
| **C2 — One launch-baseline native family per OS** | One owner-named native family per OS is supported initially. | Smallest honest matrix; may exclude material enterprise hardware and needs a later expansion decision. | Target fleet and exclusion impact. |
| **C3 — Primary native plus translated compatibility** | Named native cells receive the selected formal tier; translated/emulated cells receive an explicitly lower compatibility tier unless fully evidenced. | Extends reach; “can launch” cannot prove performance, IME, accessibility, confinement, or Effect safety. | Final A2 candidate's actual compatibility/ABI/composed-surface evidence plus per-cell native/translation evidence. |

The owner does not choose CPU names here. Later A2 evidence can invalidate an option, but A2 itself is not blocked on this choice.

### 3. Distribution-channel outcome

These options describe user outcomes, not package or updater mechanisms.

| Option | Promise rule | Trade-off |
| --- | --- | --- |
| **H1 — Symmetric dual outcomes** | Every OS offers both a self-contained/movable-workspace experience and an installed/managed experience, though native forms may differ. | Clearest channel parity; risks forcing an unnatural or unsafe native experience merely for symmetry. |
| **H2 — One preferred native outcome per OS** | Each OS has one primary channel chosen for its users/platform; channel count need not match. | Smallest evidence surface; may remove the Windows portable adoption outcome or enterprise choice. |
| **H3 — Per-platform evidence-driven portfolio** | Each OS may have a different declared set, with separate tier, lifecycle, data/recovery, and migration promises for every channel. | Most adaptable; most complex support, documentation, update, and data-safety story. |

The Windows zip/NSIS behavior in [C-23](./A1-EVIDENCE-CROSSWALK.md#source-registry) is canonical at the base and candidate carry-over only; it is not a macOS or V2 default.

### 4. Support tier

| Option | Promise rule | Trade-off |
| --- | --- | --- |
| **S1 — Uniform GA only** | Every listed cell has the same release-blocking evidence and formal support; no public preview cells. | Strongest one-product meaning; smallest launch breadth or highest cost. |
| **S2 — Per-cell GA plus preview** | Maturity is declared for each exact OS/CPU/channel cell; preview is visibly lower and never marketed as GA. | Earlier evidence/user access; greater misunderstanding and support burden. |
| **S3 — Primary-platform / secondary-platform** | One OS is globally formal while the other remains preview/compatibility. | Lowest near-term cost; most likely to turn “one product” into two product tiers and requires explicit owner acceptance of that tension. |

No lower tier may weaken authority, privacy, receipt proof, no-silent-loss, or recovery safeguards. It can reduce the feature/support promise, not the safety semantics.

### 5. Feature parity

| Option | Promise rule | Trade-off |
| --- | --- | --- |
| **F1 — Full lockstep** | Every surviving V1 requirement and journey is delivered in the same release for all GA cells; only presentation-level native variation is allowed. | Simplest product story; the slowest cell controls release scope and schedule. |
| **F2 — Explicit Core Parity Set plus expiring exceptions** | An owner-approved row/journey set is lockstep; other OS integrations may differ only through a time-bounded Native Exception Ledger. | Balanced cost and consistency; “core” becomes a loophole unless named row by row. |
| **F3 — Transparent differentiated catalogs** | GA platforms may expose different feature catalogs while preserving domain/data compatibility and I-01–I-11. | Fastest platform-specific delivery; if core editing/evidence/recovery differs, the working premise effectively becomes separate editions. |

F1–F3 apply to GA cells. Preview differences belong to S2 and cannot be hidden inside the parity definition.

### 6. Accessibility promise

| Option | Promise rule | Trade-off |
| --- | --- | --- |
| **A11Y-1 — Essential-journey outcome equivalence** | All GA cells demonstrate the same keyboard, focus, Chinese IME, zoom/reflow, non-color status/diff, and native screen-reader outcomes across every essential journey. | Strong result-oriented product bar; AI7 must maintain its own precise evidence matrix. |
| **A11Y-2 — Formal conformance plus journey evidence** | The owner later names one external standard/level for all GA cells, while retaining professional-editor journey proof. | Strongest auditability; highest design, testing, and possibly independent-review cost. |
| **A11Y-3 — Published compatibility matrix only** | AI7 promises only named AT/IME/OS combinations and makes no general cross-platform equivalence claim. | Smallest obligation; greatest tension with a professional one-product promise. |

The admitted candidate contains Windows Narrator/high-contrast/scaling/IME plans but no completed professional-editor, disabled-editor, macOS, or production accessibility evidence ([U-U](./A1-EVIDENCE-CROSSWALK.md#source-registry)).

### 7. Policy visibility and activation

These options combine visibility with a compatible activation authority so “visible” is never mistaken for “authorized.”

| Option | Editorial product exposure | Activation authority | Trade-off / ADR effect |
| --- | --- | --- | --- |
| **PV1 — Outcome-only, developer activation** | Editors see applicable criteria in plain language, current effect, blocker/reason, notice, and safe next action; no Policy identity/version/diff. | Developer track only. | Lowest cognitive load and preserves the current [C-18](./A1-EVIDENCE-CROSSWALK.md#source-registry) baseline. |
| **PV2 — Read-only policy receipt, developer activation** | Editors also see stable Policy name/version/digest, activation time, applicable scope, and change notice, but not authoring/control. | Developer track only. | Better audit/support trace; explicitly supersedes the absolute “editorial users never see these assets” wording. |
| **PV3 — Scoped editorial governance** | A designated editorial owner may inspect and activate an explicitly bounded product-domain subset, most plausibly Learning Eligibility; other authority policies remain developer-only. | Dual/delegated authority defined by a new role/record contract. | Closest to ADR 0004's user-governed language; largest authority-model change and must supersede C-18's blanket rule. |

Current-baseline precedence is PV1: [C-18](./A1-EVIDENCE-CROSSWALK.md#source-registry) and later [C-A](./A1-EVIDENCE-CROSSWALK.md#source-registry) require developer review and hide assets. The earlier [C-04](./A1-EVIDENCE-CROSSWALK.md#source-registry) wording is superseded for the sealed baseline, so [U-T C01](./A1-EVIDENCE-CROSSWALK.md#source-registry) is stale. A1 records PV2/PV3 as deliberate future supersession options and does not choose one.

## Combination consistency checks

- **S1 + F3** is normally contradictory: one formal tier cannot quietly contain different product catalogs.
- **S3** is compatible with “consistent product outlook” only if the owner explicitly accepts staged platform inequality.
- **C3** can be GA only with full per-cell evidence; otherwise it requires S2 compatibility/preview treatment.
- **A11Y-3 + S1** requires the owner to say accessibility equivalence is outside the formal parity promise; silence is not enough.
- **PV1** cannot coexist with editorial activation: a user cannot activate an asset the product does not identify.
- **F2** is incomplete until its Core Parity Set names exact requirement/journey IDs and every exception has an owner and expiry.
- No combination may weaken I-01–I-11, even in preview.

The single compound owner decision is therefore:

`{OS-floor policy, CPU policy, channel outcome, support tier, feature parity, accessibility promise, Policy visibility/activation}`

Exact values and supported-cell enumeration follow evidence; this candidate neither recommends nor preselects a tuple.

## Conflicts

1. **Canonical target versus working premise.** Canonical [C-13](./A1-EVIDENCE-CROSSWALK.md#source-registry), the Windows verification rule, [C-23](./A1-EVIDENCE-CROSSWALK.md#source-registry), and the current runtime ADRs remain Windows-specific; [P-27](./A1-EVIDENCE-CROSSWALK.md#source-registry) is candidate-only despite its branch-local “accepted” label.
2. **UI candidate versus platform premise.** [U-R](./A1-EVIDENCE-CROSSWALK.md#source-registry), J-12, J-14, Windows paths/channels, Narrator, scaling, shortcuts, dialogs, and IME examples were authored for Windows and cannot become shared rules.
3. **Current Policy baseline versus future option.** [C-18](./A1-EVIDENCE-CROSSWALK.md#source-registry) and later [C-A](./A1-EVIDENCE-CROSSWALK.md#source-registry) settle the baseline at developer-reviewed hidden assets. PV2/PV3 would intentionally supersede that rule and therefore require an explicit owner resolution; they do not cure a current ambiguity.
4. **Candidate platform recommendation versus A1 prohibition.** [P-W](./A1-EVIDENCE-CROSSWALK.md#source-registry) recommends one renderer/visual system/release version; none is accepted by the packet, and A1 cannot select a renderer or implementation mechanism.

## Unknowns and evidence gaps

- No exact OS floors, CPU fleet, channel demand, release cadence, support lifetime, translation policy, or cross-OS data-transfer evidence exists.
- No macOS professional-editor research, disabled-editor research, native component system, or native usability/accessibility evidence exists.
- The 79-ID trace omits accessibility as a numbered requirement, while its D-series source aliases are outside the packet.
- Import schema/reimport ambiguity, end-to-end Unicode/IME anchors, and the full five-state factual taxonomy lack accepted exact records.
- Document fidelity, 500K/1M/10M performance, exact selection, native IME/AT behavior, background lifecycle, crash recovery, and per-cell install/remove/update behavior are unproven.
- Future A2 must prove or refute Codex Harness Capability Closure and establish the surviving lifecycle/protocol/package/ABI/provider/process/tool/network/approval/sandbox surface before any CPU or runtime-backed product promise becomes final. A pass activates the conditional sole-Codex/reference-only-DeepSeek candidate role. A claimed failure must survive exact gap verification and a costed Codex secondary-development assessment; only a proven Mature Runtime Alternative may admit DeepSeek to comparison, which still requires a new owner choice. A3 stays closed until one decision-ready, single-execution-authority surface survives that ladder. Neither investigation begins here.
- “Same release version” under preview/staged support has no accepted meaning.
- Candidate light-first tokens and geometry supply visual hypotheses only; permissible native typography/reflow and any theme promise remain open ([U-V](./A1-EVIDENCE-CROSSWALK.md#source-registry)).

## Non-goals

- Selecting Electron, ProseMirror, renderer, process topology, IPC, store/index/retrieval, package, updater, credential store, signing, sandbox, CI topology, or any other implementation mechanism.
- Selecting exact OS versions, CPU names, package formats, release dates, or a preferred option tuple.
- Reusing A/B/C geometry, raw Figma, HTML/CSS/JavaScript, Windows paths, shortcuts, dialogs, DPI behavior, or native controls as architecture.
- Extending Word, web, mobile, multiple product editions, or new user/role models.
- Treating 79/79 traceability, browser console health, a planned usability gate, one source tree, or one visual system as parity evidence.
- Canonicalizing either frozen branch, asserting Codex Harness Capability Closure or a Codex Capability Gap, choosing an exact Codex surface or adapter/upstream/patch/fork form, answering Question 3, activating DeepSeek runtime/fallback, writing the A2 gap matrix, promoting the candidate-local execution context/glossary/ADR to canonical records, editing V1 records, starting A2/A3, or decomposing implementation.

## Rejected but implementation-tempting assumptions

- “Windows+macOS” automatically commits every OS release, CPU, and channel.
- A cross-platform toolkit automatically proves IME, accessibility, security, or feature parity.
- Pixel identity is required for consistency—or, conversely, identical color/layout proves consistency.
- Windows shortcut, dialog, portable-folder, and path semantics should be copied to macOS.
- A binary starting under translation means the CPU is supported.
- A secondary-OS preview silently satisfies a two-platform product promise.
- Native convention may change authority, receipt, fidelity, privacy, or recovery semantics.
- “Hidden is permitted” allows the product to conceal a governing effect, reason, or safe next action.
- Policy visibility grants authoring/activation authority, or hidden Policy can require editorial activation.
- Narrator/owner inspection substitutes for disabled-editor and native-platform validation.
- Candidate ADR status outranks packet authority.
- Browser/prototype evidence from one OS proves a native product on either OS.
- “Codex-first” means Codex is already the canonical dependency, execution authority, provider path, or UI implementation.
- Codex app-server, Codex SDK, and `codex exec` are interchangeable, or two harnesses may run overlapping agent loops because both are useful.
- The conditional owner resolutions prove Codex closure; an unverified or verified Codex gap automatically admits DeepSeek; or a Mature Runtime Alternative selects DeepSeek without a new owner choice.
- “Development Reference Framework” permits shipping DeepSeek packages, processes, Sessions, tools, capability grants, or branding.
- Codex Desktop-like interaction licenses copying Codex branding, layouts, assets, coding defaults, or coding-agent purpose into AI7.

## A1 exit

A1 is ready for Commander review when the invariant list, crosswalk, option axes, conflicts, gaps, non-goals, and both exact resolved future-A2 inputs remain internally consistent under validation. The branch then stops. Commander confirmation of the stable invariant list may later admit the Codex Harness Capability Closure investigation under a separate A2 brief; the owner's compound tuple is required before canonical product promises or a coherent V2 candidate. A3 waits for a closure-pass Codex surface or, after the exact gap-closure/re-entry ladder and any new owner choice, a separately clarified single-authority surface; a gap report or re-entry eligibility alone grants no A3 entry.
