# Source checkout buildability

Status: **Owner-accepted `dev` development-plan contract; carried by the first complete vertical journey, not a separate gate or `main`-promotion authorization**

This contract prevents the repository from depending on an author's machine, a sibling checkout, or CI-image accidents in order to build and start AI7. It defines operational source-checkout buildability, not byte-for-byte reproducibility and not a new engineering gate.

## Outcome

On every declared **Supported Development Host**, a developer with authorized repository access can begin from a fresh checkout and use the documented root command surface to:

1. check the host prerequisites;
2. restore immutable declared dependencies;
3. build the host-native Electron renderer, main process, AI7 service, and composed Harness runtime;
4. launch an interactive, provider-free AI7 with a dedicated development data root outside the working tree; and
5. start the same launchable product subject used by the existing E2E Functional Gate.

Model-dependent work may remain unavailable until the user configures a provider, but startup, local Book access, editing, journaling, recovery, and the provider-free E2E journey never require a provider credential, a live model, or product network access. Base launch is achieved only after the Electron main and renderer plus the separate AI7 service complete their startup handshake and the interactive shell reports ready; spawning processes and immediately exiting is not success. Harness may remain dormant until an AI-assisted task begins, but a supported E2E journey that crosses Harness must activate the composed runtime successfully against the in-boundary deterministic fixture before reporting its user-visible outcome.

## Repository-development vocabulary

These terms are local to repository development and do not enter the AI7 Editorial or AI7 Execution domain glossaries:

- **Source Checkout Buildability** — the ability to bootstrap, build, and launch from a fresh checkout using only the inputs permitted below.
- **Supported Development Host** — one explicit operating-system, minimum-version, CPU-architecture, and required-toolchain entry in the development matrix.
- **Host-native build** — a build produced and launched for the current Supported Development Host. This contract does not require cross-compiling another platform.

The product platforms are Windows and macOS. Linux and Ubuntu are not product or release targets. Before Phase 1 can complete, the development matrix must name the supported Windows version and architecture plus the supported macOS version and Apple Silicon/Intel policy. Distribution, update, signing, and notarization decisions may remain later platform work only when they do not block an unsigned or locally trusted development build and launch.

## Permitted inputs

A build may use only:

- regular files in the tracked checkout at the selected source revision;
- Git and the exact Node/package-manager toolchain declared by the repository;
- explicitly documented host-native tool prerequisites, within the restriction below, including their supported versions, canonical source, purpose, and detection rule;
- dependencies resolved from the committed lockfile and other exact declared pins;
- regular tracked artifacts, approved package registries, and approved immutable artifact sources under the acquisition rules below; and
- optional, task-local dependency caches that only accelerate restoration and whose complete absence does not change the selected or produced inputs.

An immutable declared dependency has an exact version or revision and a content-integrity binding. Each non-registry artifact declaration also names its source URL or repository/store identity, supported OS/CPU tuple where applicable, digest, license, and required notice. A package-manager lifecycle script, postinstall hook, generator, Git LFS restore, or submodule restore that performs a secondary fetch is itself an acquisition step and follows the same declaration and integrity rules. A Gitlink or LFS pointer alone is not a buildable tracked input.

Any repository-local or AI7-controlled dependency store must be reconstructable from empty by `bootstrap` from regular tracked artifacts or approved immutable acquisitions. A prefilled store is neither a host prerequisite nor a correctness cache. Mirrors may change the transport location only when the selected identity and verified content digest remain unchanged.

When a required runtime dependency belongs in an Agent Data Root-owned store, `bootstrap` produces a manifest-bound, digest-bound dependency snapshot as a generated build output. Before product launch and without further network access, `start-built` or `e2e` atomically materializes and re-verifies that snapshot in its selected Agent Data Root. A pre-existing entry may not satisfy or override a required pin without matching the manifest and digest, and launch never reads another development root, a global store, or a prefilled CI image as a fallback.

Repository checkout authentication and declared dependency-source access are development infrastructure. Repository, registry, and artifact-store credentials may be used only by checkout or bootstrap, must be documented by required scope without recording their values, and must never be exposed to the product process.

Any required dependency-source authorization is part of the documented standard AI7 developer access path; it cannot depend on an author's personal account, undocumented entitlement, or manually transferred secret. A developer who has the declared standard access must not need another machine's state to complete bootstrap.

Every source file, static asset, schema, migration, default configuration, public-synthetic fixture, generation input, license, and notice needed to build or launch must either be tracked or be derivable by a repository command from a tracked input plus an immutable declared dependency. Generated outputs remain ignored build products, never hidden source inputs.

## Host prerequisites are tools, not payloads

A host prerequisite may be a declared operating-system component, compiler, linker, SDK, or equivalent host-native build tool. It must be used as a tool through its documented interface; except for platform APIs and runtime components that are part of the declared Supported Development Host itself, its bytes must not be copied into the product or loaded by the launched product.

Any runtime, library, payload, model, product logic, or third-party application component that is copied into an output or loaded by AI7 is a tracked or immutably acquired dependency, not a host prerequisite. An ambient Office PIA, Python payload, sibling tool bundle, or arbitrary installed runtime therefore cannot be made valid merely by documenting its path. The host check fails early with the missing tool's canonical name and supported remediation; it never searches personal or global directories and adopts an arbitrary copy.

## Prohibited hidden inputs

Bootstrap, build, launch, and E2E setup must not depend on:

- either predecessor repository, another worktree, or a developer's sibling checkout;
- user-specific or author-specific absolute paths;
- untracked source, manually copied files, pre-generated `dist/` output, or a previous build;
- undeclared global packages, tools that happen to exist on one CI image, or mutable branches, tags, ranges, and `latest` dependencies;
- build-critical submodule or Git LFS content that `bootstrap` cannot restore through a declared immutable acquisition;
- private manuscripts, private sample Books, AI7 product credentials, provider credentials or provider API keys, signing secrets, or release-only secrets;
- an application-build cache as a correctness requirement; or
- a live provider, provider rehearsal, cassette, replay, or outbound product request.

The build-affecting input surface is closed. Only repository-documented, allowlisted command options, environment variables, and configuration files may influence the selected toolchain, source, dependency, artifact, generator input, or output mode. Unrelated ambient variables are ignored; a recognized legacy selector or undeclared override fails closed instead of changing the selection. Commands never probe a home directory, global package installation, sibling checkout, predecessor tree, or list of candidate payload directories for a usable copy. `doctor` reports the selected non-secret input identities and sources so a developer can explain what will be built.

## Root command surface

Phase 1 selects one package manager, pins its exact version, and exposes one documented root command surface with these stable semantics:

| Command role | Required behavior |
| --- | --- |
| `doctor` | Report whether the current OS, CPU, Node, package manager, and named native prerequisites match one Supported Development Host, plus the selected non-secret dependency and artifact sources. |
| `bootstrap` | Run the host check; enforce the frozen lockfile and closed input surface; restore all declared packages, secondary artifacts, LFS/submodule content if admitted, and local stores; verify integrity; and generate only outputs derivable from permitted inputs. |
| `build` | Build the host-native renderer, main, service, and composed Harness product path without signing or provider credentials. |
| `start-built` | Launch the built product in the foreground with a dedicated development Agent Data Root outside the repository, a stable readiness signal, and no required provider connection. |
| `e2e` | Launch that same product subject with an isolated run-local data root and run an admitted supported journey or observed-bug variation. |

The exact invocation syntax belongs in the root manifest and root quick-start documentation once the scaffold exists. CI calls these commands; it does not maintain a second CI-only build path. A command may delegate to platform-specific scripts, but their user-visible semantics and source-input boundary remain the same.

`start-built` and `e2e` instantiate the same production-shaped renderer, Electron main, AI7 service, composed Harness runtime, private IPC carrier, required platform adapters, and non-release-only startup dependencies. The E2E path may replace provider bindings with the deterministic model fixture, disable outbound product network access, select an isolated data root, and attach non-substituting observation/control hooks; it may not omit or replace another required product component because `CI`, `test`, or `provider-free` mode is active. A missing required helper, adapter, IPC carrier, or runtime artifact fails launch. Signing, notarization, installer activation, updater integration, and other declared release-only mechanics remain outside local launch.

`start-built` creates its development data root when absent and never clears or reinitializes an existing root. Its root process stays attached until AI7 exits. Any failure before readiness first terminates every process already started and then returns nonzero. Normal exit and cancellation also shut down owned children; if the root process dies unexpectedly, service and Harness descendants exit through parent-death detection or an equivalent lease rather than remaining orphaned. `e2e` uses a distinct disposable run-local root, waits for the same readiness signal, and owns cleanup of the processes it starts under the same failure semantics. These lifecycle rules prevent a detached, immediately terminated, or process-leaking launch from satisfying “actual launch.”

## Dependency and network interval

Source completeness does not mean vendoring Harness or committing `node_modules`. AI7 uses a **declared-source-assisted bootstrap**:

1. bootstrap may access approved package registries and approved immutable artifact sources only to restore the exact committed lockfile and declared pins, including declared secondary downloads made by lifecycle scripts;
2. every acquired package or artifact is checked against its lockfile integrity or declared digest before it can become an input;
3. after restoration, required Agent Data Root-owned runtime dependencies are atomically materialized and re-verified from the generated snapshot without network access;
4. the product E2E execution interval begins with outbound product network access disabled;
5. the E2E journey uses public synthetic data and its in-boundary deterministic model fixture; and
6. the product process receives no registry token, repository token, artifact-store credential, provider credential, or signing secret.

A truly offline dependency installation, a required AI7-maintained offline package mirror, a vendored Harness tree, or a byte-for-byte reproducible build is outside this contract. Adopting one would require a separate owner decision and must not be inferred from “fresh checkout.” A transport mirror remains permitted only under the identity-and-digest rule above and never becomes a required hidden input.

## Integration with the one E2E Functional Gate

Each Windows and macOS execution of the one logical E2E Functional Gate begins from a fresh checkout or an equivalently empty job checkout. It selects the pinned toolchain, gives bootstrap initially empty job-local dependency-store and build-output roots, runs the same `bootstrap`, `build`, and `start-built` semantics documented for developers, and then executes the same admitted journey IDs. An optional cache may be restored only into a job-local cache root; a miss continues through the same path. The setup never clears or repurposes a developer's global, shared, or system cache.

This setup has no independent success record. A setup or launch failure fails the applicable platform execution of the one E2E Functional Gate; it does not create a build-smoke, packaging, reproducibility, ABI, platform-certification, or release-proof gate. Job-local dependency caches are optional optimizations. The first fulfillment on each Supported Development Host uses their absent state inside that same complete E2E execution; later executions may restore them without making them authoritative.

Release automation may later package accepted source with platform-specific signing or notarization credentials. Those credentials and package mechanics never become prerequisites for local `build` or `start-built`.

## First-journey setup obligations

Phase 1 establishes and continuously maintains the command and input boundary, but does not claim this contract is fulfilled before a complete supported journey exists. The setup is not a standalone implementation issue, scenario, test result, or gate. It is carried by the first accepted vertical product journey. On every Supported Development Host entry, that journey's setup must satisfy these conditions:

- a fresh checkout passes the documented host check;
- frozen dependency and secondary-artifact restoration succeeds, including reconstruction of any declared local store, without a sibling checkout or hidden local artifact;
- any Agent Data Root-owned runtime dependency store is atomically materialized and re-verified from the declared snapshot without consulting another root or global store;
- the host-native product builds, instantiates the production-shaped non-provider topology, completes the base multi-process readiness handshake, remains running, reaches an interactive provider-free state, and activates the composed Harness runtime when the journey first requires it;
- the persistent development Agent Data Root is created when absent and preserved when present, while the E2E Agent Data Root plus runtime copies, imports, indexes, journals, databases, and outputs remain outside the repository; regular tracked public-synthetic fixture inputs may remain inside it;
- the applicable complete E2E journey starts through that same built product path; and
- the first fulfillment succeeds with absent job-local caches; later restored caches may accelerate restoration but supply no required source, local-store content, or application output.

Only the complete E2E journey has a pass/fail result. The setup obligations above are properties of the subject it launches and have no separate report or promotion authority. When implementation planning is authorized, the first product slice includes this path; do not create a horizontal “build the monorepo” issue or a separate clean-build scenario whose only outcome is a compiled layer.

Any later change to the toolchain, root commands, host prerequisites, dependency source, generated inputs, or launch path updates this contract's implementation and the root quick-start documentation in the same change.

## Non-goals

- Linux or Ubuntu product support.
- Cross-compiling Windows from macOS or macOS from Windows.
- Fully offline dependency installation.
- Vendoring the Harness monorepo or npm dependency tree.
- Byte-identical or formally reproducible artifacts.
- A separate build, package, signing, notarization, release, or same-SHA gate.
