# Public SampleBooks

The Owner designated the six files in this directory for public test use through
[Issue #32](https://github.com/zhouy1017/ai7-harness/issues/32), under the narrow
admission rule in [ADR 0043](../docs/adr/0043-allow-public-samplebooks-in-repository-and-ci.md).

The original source is the ignored, untracked `SampleBooks/` directory in the local
worktree `C:\Users\Chooo\codebase\ai7-harness` beside
`main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`. Because those files were not Git
objects, their source identity is the Owner designation plus the exact path, size,
and SHA-256 allowlist below. The repository copies are byte-for-byte identical.

| Exact path under `SampleBooks/` | Bytes | SHA-256 |
| --- | ---: | --- |
| `1蟠虺（修订290326字).docx` | 546758 | `988f5b43445ce357fc2f98a07428d26504650d33f378e6868af62d758d953797` |
| `2听漏（定稿368544字）.docx` | 631075 | `39a3ce58dd53ff9ff157547c573b260979ac226ad571cd6518b1f98a6769cf50` |
| `3天兽（定稿395870字)##＊.doc` | 1173504 | `931d8035946f7689aaaa25c14c5822f46eedc59d23925081ded7b06618d9e4d2` |
| `春歌(一次通读后电子版).pdf` | 4330883 | `a41ebd36e8f1547500571fa9c8ca837e118a4f4b634605a46b2aae6ecb99e78b` |
| `蟠虺.docx` | 43661 | `a45283e6132f8992e71aa924b3ad3504a65c8651895fa92ad8c087305f2fb183` |
| `sample1.docx` | 29550 | `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483` |

Total: 6 files, 6,755,431 bytes.

These files may be used as provider-free input to local and hosted-CI tests,
including authoring synthetic test data. A consuming scenario must still bind the
exact admitted input in its own authorized Change Brief.

This admission does not authorize raw manuscript payload in logs, diagnostics,
screenshots, traces, videos, or uploaded artifacts. It also grants no application
distribution, live-provider use, credential use, production learning, export,
external delivery, publication, or Public Release Permission. Runtime derivatives
remain confined to disposable external test data roots under the existing cleanup
lifecycle.
