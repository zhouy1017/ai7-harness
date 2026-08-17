# Runtime Language and Release Channel

Status: **accepted in Question 33 with owner revisions; also settles the release-channel half of Question 26**

## Evidence: what the legacy Python actually was

Audited at `ai7-reborn-ai@3e6e9ac`.

- **62 Python files with zero third-party dependencies.** No `requirements.txt`, no `pyproject.toml`, no `Pipfile`. Every import is either Python stdlib or a local module.
- **No document library anywhere.** No `python-docx`, no `PyMuPDF`, no `pdfplumber`, no `lxml`. DOCX handling is `zipfile` plus `xml.etree.ElementTree` — treating DOCX as what it is, a zip of XML.
- The files are business logic: manuscript merge, proposals, publication, recovery, project store, operation journal, provider adapters, plus `ctypes` for Windows APIs in the credential store.
- No library-backed PDF implementation exists in either language at the pin.

This corrects the working assumption that Python was present *for* document processing. It was simply the backend implementation language, and the packaged Python runtime existed to ship that backend inside an all-in-one release.

## Decision 1 — No Python in the new project

AI7 is TypeScript and Node throughout. No embedded interpreter ships.

Every legacy capability has a direct Node equivalent, most of them stdlib to stdlib:

| Legacy Python | Node replacement |
| --- | --- |
| `zipfile` + `xml.etree` for DOCX | A zip library plus an XML parser. Direct OOXML control is arguably better for the round-trip fidelity Question 23 requires |
| `hashlib` | `node:crypto` |
| `ctypes` into DPAPI | Harness ships `dsh-credentials`; Windows Credential Manager bindings exist |
| `pathlib`, `json`, `re`, `uuid`, `datetime`, `tempfile`, `threading` | Direct Node equivalents |

Three accepted decisions already pointed here. Question 30 pins a TypeScript/ESM package family on Node `^22.19.0 || >=24`. Question 31 forbids a competing runtime. ADR 0006 accepted manuscript *semantics* while explicitly rejecting the legacy Python, JSON-store, and proof-compatibility machinery — so that business logic is being re-expressed from contract regardless, and keeping Python would mean porting nothing while carrying a second runtime.

The cost avoided: roughly 50 to 100 MB in a portable build, a second dependency tree, a second security surface, a second upgrade contract, cross-language IPC, and the standing risk about Python runtime limitations on Windows.

**Reconsideration trigger.** A *named* capability with no adequate Node implementation may enter as a bounded native module or a sidecar process under its own ADR. It never enters as a general-purpose embedded interpreter. PDF import, if it becomes V1 scope, is greenfield in either language and is covered by `pdfjs-dist` in Node; it is not a Python-forcing requirement.

## Decision 2 — Portable is the only V1 release channel

AI7 ships as an all-in-one portable Windows folder. No installer, no admin rights, no registry writes, no IT ticket. The intended users are publishing professionals on managed corporate machines, so avoiding an installer is an adoption lever rather than a convenience. The legacy product already shipped this way, and Question 24's concise-and-quick verification favors one artifact over two.

An installer is deferred until a concrete need appears.

### The data root lives inside the AI7 folder

By owner decision, AI7 stores its data and files inside its own folder whenever possible. A portable installation is genuinely self-contained: copying the folder moves the work with it, and backing up the folder backs up everything.

Suggested layout, so that update-in-place can replace program files without touching user data:

```text
AI7/
  app/      program files, replaced wholesale on update
  data/     Agent Data Root: Books, manuscripts, revisions, journals, deliverables
  logs/
```

### What stays outside, and why

**The Protected Secret Store.** ADR 0017 places it outside the Agent Data Root, and that constraint survives unchanged — this is the case where "inside the folder" is not possible. Credentials live in Windows Credential Manager or DPAPI, resolved through the Credential Broker. A portable folder is designed to be copied, and a copied folder carrying credential material to another machine would be a genuine leak rather than a theoretical one.

### Residual risk and its mitigation

Portable folders end up on USB drives, network shares, and **synced cloud folders**. With the data root inside the folder, a sync client will carry every manuscript off the machine.

This does not violate the Question 36 egress rule as written — that rule governs paths AI7 automates, and folder placement is a user decision AI7 does not make. But the exposure is real, so the mitigation is detection rather than a different default:

- AI7 detects when its own folder sits beneath a known sync or backup root and **warns clearly**, in editorial language rather than technical language.
- The warning is informational, not blocking. The user is authorized personnel and may proceed.

Because the data root is now inside the application folder, **ADR 0016's rule extends to the whole folder**: the AI7 folder must never sit inside a repository working tree, since that would place manuscripts in a repository regardless of `.gitignore`.

### Non-writable location fallback

A portable folder placed somewhere unwritable — `Program Files`, a read-only share, a mounted image — cannot host the data root. AI7 detects this on first run, falls back to `%LOCALAPPDATA%\AI7`, and states plainly where the data went. It never fails silently and never runs with an unwritable data root.

### Consequences for release and update

**Question 24's `release` workflow is amended.** It currently proves install, launch, canonical journey, and uninstall. A portable build has no install or uninstall, so the proof becomes: extract → first-run data-root creation → launch → canonical Standalone journey → removal leaves no residue outside the folder and outside the Protected Secret Store.

**Sign the executable regardless.** No installer does not remove the signing requirement. An unsigned executable triggers SmartScreen, which for a non-expert user on a corporate machine is a hard stop rather than a warning.

**Updates replace `app/` and preserve `data/`.** With no installer there is no updater, so a new build must locate an existing data root and the data root needs a version marker allowing an older build to refuse newer data rather than corrupt it.

## Question 33 decision

Accepted with owner revisions:

- TypeScript and Node throughout, with no embedded Python interpreter, and a named-capability trigger for a bounded native module or sidecar;
- portable all-in-one Windows folder as the only V1 release channel, with an installer deferred;
- the Agent Data Root lives inside the AI7 folder, keeping the installation self-contained;
- the Protected Secret Store remains outside it, since a copied folder must not carry credentials;
- sync-root placement is detected and warned about rather than prevented, and the whole folder must stay outside any repository working tree; and
- an unwritable location falls back to `%LOCALAPPDATA%\AI7` with a clear notice.

See [ADR 0022](../docs/adr/0022-typescript-only-runtime.md) and [ADR 0023](../docs/adr/0023-portable-release-with-self-contained-data-root.md).
