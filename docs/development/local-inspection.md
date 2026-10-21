# Quick local inspection

For a person inspecting current source, after the one-time prerequisites below:

```text
pnpm run inspect
```

This rebuilds current code and opens the normal provider-free development product. It awaits the existing build controller, then runs the existing foreground `start-built` launcher with explicit `development-ci` scope. Only the launcher's `AI7_READY` handshake means the main process, service and renderer are ready. The terminal stays attached until AI7 closes; build, launch and readiness failures return a nonzero exit code. Close AI7 before rebuilding, and do not run builds concurrently in the same checkout.

## Prerequisites

Use a [supported source-checkout host](source-checkout.md#declared-host-matrix): Windows 11 24H2+ x64 or macOS 15+ arm64, Node **24.18.1** and repository-pinned pnpm **11.24.0**. From a fresh checkout, or after dependency/artifact pins change:

```text
pnpm run doctor
pnpm run bootstrap
```

Bootstrap restores declared, integrity-checked dependencies and the Electron carrier. Inspection does not run bootstrap every time: it performs one clean build using those prepared inputs. It does not package, sign or call a model. This is the source-checkout development product; actual editorial model use follows its separate production launch and policy route.

## Data location

The default persistent inspection root is separate from production and stable for each checkout:

| Host | Default |
| --- | --- |
| Windows | `%LOCALAPPDATA%\AI7-inspection\<checkout-id>\data` |
| macOS | `~/Library/Application Support/AI7-inspection/<checkout-id>/data` |

`<checkout-id>` is a short hash of the checkout's absolute path. Moving the checkout selects a different root; no migration or deletion is performed. The command prints the selected path before launching. To choose a dedicated external development directory:

```text
pnpm run inspect -- --data-root "C:\AI7-inspection\manual-data"
pnpm run inspect -- --data-root "/Users/your-name/AI7-inspection/manual-data"
```

Use the command for your host. A relative path or a path inside any Git checkout/worktree, including a redirected alias, is refused. The existing launch owner also enforces its canonical boundary against this checkout. Use a dedicated directory, never a production root, credential directory or manuscript repository. Inspection preserves its data between launches; use only admitted Public SampleBooks for development. Do not archive or upload the data directory with build outputs.

## Build-only verification

Agents and anyone who only wants compiled output use:

```text
pnpm run inspect:build
```

Equivalent: `pnpm run inspect -- --build-only`. It invokes the existing build controller and writes the ordinary ignored `dist/` output. It never selects or creates an inspection data root and never launches Electron. It is a build result, not a readiness, Journey, Gate or release result. `pnpm run inspect -- --help` is side-effect free.

Agent-run desktop inspection and Electron Journeys still use the [background guest and existing verification ladder](../agents/ci-test-boundaries.md). The human launch command above is not an exception to that rule. Non-GUI bootstrap probes remain part of normal source preparation.

If a build fails, use the existing build diagnostics and repair the source/input problem before launching. If launch fails, `start-built` retains its bounded startup failure marker; this helper neither substitutes readiness nor retries product work. The command never deletes inspection data.
