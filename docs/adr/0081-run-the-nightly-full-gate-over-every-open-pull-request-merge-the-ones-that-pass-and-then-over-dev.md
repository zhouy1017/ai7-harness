---
status: accepted — wave routing and integration authority amended by ADR 0089; implementation adaptation pending
---

> [ADR 0097](0097-defer-the-macos-platform-indefinitely-and-deliver-windows-only.md): the full Gate over candidates and the integration line runs on Windows only (2026-10-24); "paired-platform" and "Windows and macOS" below read Windows-only while that hold lasts.

# Run the nightly full Gate over candidates and the integration line

The retained design is a provider-free paired-platform full Gate over the exact candidate tree and the integration line. [ADR 0089](./0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) replaces the old nightly integration operating instructions with [Orca dispatch](../agents/orca-dispatch.md): the new branch flow is defined there rather than repeated here.

## Existing implementation and P0 adaptation

The deployed workflow and `tools/nightly-queue.mjs` still select open non-draft pull requests targeting `dev`, prepare a squash candidate against the moving `dev` tip, run the full admitted set on Windows and macOS, auto-merge successful candidates, and finally test `dev`. They have not been changed by this documentation. Proposed ADR and canonical-policy exclusions remain in that implementation.

This dev-only automatic queue does not yet implement slice-to-wave review or the final wave-to-dev integration boundary. P0 must adapt PR routing, candidate construction, result attribution and queue merge authority to the new branch flow before the Orca pipeline relies on hosted evidence or Ready transitions. During migration, keep an unready dev integration candidate Draft rather than allowing the existing queue to perform an unintended integration. The adaptation itself uses the existing logical Gate and adds no independent hosted gate.

## Retained verification boundaries

- The pull-request lane is the bounded Windows `GATE_JOURNEYS` occurrence; a full candidate or nightly occurrence runs every admitted Journey on Windows and macOS. Each report names the exact occurrence and tree; a local result or bounded lane is not a full paired-platform result.
- A failed or conflicting candidate remains unintegrated, with payload-safe attribution to its platform and Journey. A failure is not relabeled green; a clearly external transient follows the existing single rerun allowance.
- CI receives no Provider credentials and calls no LLM. Public-test-material, network denial, diagnostics and scenario admission rules remain unchanged.
- The queue grants no release or `main` authorization and is not an Actions-usage instrument. No unit, lint, type-check, coverage, packaging or release gate is created.

[CI and test boundaries](../agents/ci-test-boundaries.md) owns the executable verification procedure and truthful migration disclosure. Git history retains the retired dev-auto-merge operating decision.
