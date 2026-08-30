# AI7 third-party notices

AI7 is proprietary software. The following components remain under their own licenses. This notice is generated into every development build together with the verified current-host Electron `LICENSE` and `LICENSES.chromium.html` carriers.

## Runtime npm components

| Components | Version(s) | License and attribution |
| --- | --- | --- |
| the `@deepseek-ai/` scoped packages `dsh-agent`, `dsh-agent-loop`, `dsh-attachment`, `dsh-brand`, `dsh-code-runtime`, `dsh-invariants`, `dsh-llm`, `dsh-scope`, `dsh-session`, `dsh-session-persistence`, `dsh-settings`, `dsh-system-prompt`, `dsh-timeout`, `dsh-tools`, `dsh-typert-protocol`, `dsh-user-approval` | 0.1.0-rc.6 | MIT; Copyright (c) 2026 DeepSeek |
| `@deepseek-ai/cordis`, `@deepseek-ai/cosmokit`, `@deepseek-ai/schemastery` | 4.0.1, 1.8.2, 3.18.1 | MIT; Copyright (c) 2021-present Shigma |
| `@standard-schema/spec` | 1.1.0 | MIT; Copyright (c) 2024 Colin McDonnell |
| `@napi-rs/keyring` and its exact optional `@napi-rs/keyring-*` native carriers | 1.3.0 | MIT; Copyright (c) 2020 N-API for Rust |
| `fflate` | 0.8.3 | MIT; Copyright (c) 2026 Arjun Barrett |
| `prosemirror-commands`, `prosemirror-history`, `prosemirror-keymap`, `prosemirror-model`, `prosemirror-state`, `prosemirror-transform`, `prosemirror-view` | exact versions in `pnpm-lock.yaml` | MIT; Copyright (C) 2015-2017 by Marijn Haverbeke `<marijn@haverbeke.berlin>` and others |
| `orderedmap`, `w3c-keyname` | 2.1.1, 2.2.8 | MIT; Copyright (C) 2016 by Marijn Haverbeke `<marijn@haverbeke.berlin>` and others |
| `rope-sequence` | 1.3.4 | MIT; Copyright (C) 2016 by Marijn Haverbeke `<marijn@haverbeke.berlin>` |
| `saxes` | 6.0.0 | ISC; Copyright (c) Contributors; inherited sax portions Copyright (c) Isaac Z. Schlueter and Contributors |
| `xmlchars` | 2.2.0 | MIT; Copyright Louis-Dominique Dubeau and contributors to xmlchars |

## Development-only components

| Components | Version(s) | License and attribution |
| --- | --- | --- |
| `pnpm` package manager (official npm carrier selected by the root sha512 SRI) | 11.24.0 | MIT; Copyright (c) 2015-2016 Rico Sta. Cruz and other contributors; Copyright (c) 2016-2025 Zoltan Kochan and other contributors |
| `@types/node`, `undici-types` | 24.13.3, 7.18.2 | MIT; Copyright (c) Microsoft Corporation.; Copyright (c) Matteo Collina and Undici contributors |
| `esbuild` and all 26 exact optional `@esbuild/*` lock carriers (only the current host is materialized) | 0.28.2 | MIT; Copyright (c) 2020 Evan Wallace |
| `playwright-core` | 1.62.1 | Apache License 2.0; Copyright (c) Microsoft Corporation; package `NOTICE` attributes code derived from Puppeteer under Apache-2.0, and `ThirdPartyNotices.txt` routes bundled sidecar license files |
| `typescript` | 6.0.3 | Apache License 2.0; Copyright (c) Microsoft Corporation; package `ThirdPartyNoticeText.txt` carries DefinitelyTyped, Unicode, and WebGL notices |

Development-only tools are not part of the launched product code. Their exact tarball integrities, the possible esbuild platform-binary acquisition, and supported-host binary SHA-256 values are documented in [`docs/development/dependency-provenance.md`](docs/development/dependency-provenance.md).

## Secondary artifacts

| Carrier | SHA-256 | License route |
| --- | --- | --- |
| Node 24.18.1 Windows x64 distribution | `ec56b84a7551893ab2324ebdfdc4ab974a63b4781162600b68a1293cc3e53765` | Node.js license declared in `config/dependency-artifacts.json` |
| Node 24.18.1 macOS arm64 distribution | `eb02f7fab96d3d67de40c5ec8566096fcb4c2026728787683ae5a97eb612b941` | Node.js license declared in `config/dependency-artifacts.json` |
| Electron 43.4.1 Windows x64 zip | `c2ef9a5f65472c34d14bd3e67b7d14e66b0c01f124aba45263d6a4232160e13a` | exact extracted `LICENSE` and `LICENSES.chromium.html` copied into the build |
| Electron 43.4.1 macOS arm64 zip | `fe3cac8cbfd9ba1739fac6c69166cf30848741f93cbe251d800ae6ef7cebb64b` | exact extracted `LICENSE` and `LICENSES.chromium.html` copied into the build |

## MIT license text

Copyright (c) 2026 DeepSeek

Copyright (c) 2021-present Shigma

Copyright (c) 2024 Colin McDonnell

Copyright (c) 2020 N-API for Rust

Copyright (c) 2026 Arjun Barrett

Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others

Copyright (C) 2016 by Marijn Haverbeke <marijn@haverbeke.berlin> and others

Copyright (C) 2016 by Marijn Haverbeke <marijn@haverbeke.berlin>

Copyright Louis-Dominique Dubeau and contributors to xmlchars

Copyright (c) 2015-2016 Rico Sta. Cruz and other contributors

Copyright (c) 2016-2025 Zoltan Kochan and other contributors

Copyright (c) Microsoft Corporation.

Copyright (c) Matteo Collina and Undici contributors

Copyright (c) 2020 Evan Wallace

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## ISC license text

The `saxes@6.0.0` npm tarball omits a license file. Its authoritative tagged [upstream license](https://github.com/lddubeau/saxes/blob/v6.0.0/LICENSE) contains the following two applicable ISC blocks, reproduced here.

The ISC License

Copyright (c) Contributors

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

The ISC License

Copyright (c) Isaac Z. Schlueter and Contributors

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

## Apache License 2.0 route

The complete Apache License 2.0 text is available at <https://www.apache.org/licenses/LICENSE-2.0> and in the installed `playwright-core@1.62.1` and `typescript@6.0.3` license files. Playwright's installed `NOTICE` and `ThirdPartyNotices.txt` and TypeScript's installed `ThirdPartyNoticeText.txt` retain their exact development-tool notices. Electron's complete bundled third-party license text, including Chromium notices, is carried verbatim in `dist/notices/ELECTRON_LICENSES.chromium.html`.
