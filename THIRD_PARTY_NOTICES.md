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
| `vitest` and its `@vitest/expect`, `@vitest/mocker`, `@vitest/pretty-format`, `@vitest/runner`, `@vitest/snapshot`, `@vitest/spy`, `@vitest/utils` | 4.1.11 | MIT; Copyright (c) 2021-Present VoidZero Inc. and Vitest contributors |
| `vite` | 8.2.2 | MIT; Copyright (c) 2019-present, VoidZero Inc. and Vite contributors |
| `rolldown` and all exact optional `@rolldown/binding-*` lock carriers (only the current host is materialized), `@oxc-project/types` | 1.2.7, 0.148.0 | MIT; Copyright (c) 2024-present VoidZero Inc. & Contributors |
| `@rolldown/pluginutils` | 1.0.1 | MIT; Copyright (c) 2026-present, rolldown/plugins repository contributors |
| `lightningcss` and all exact optional `lightningcss-*` lock carriers (only the current host is materialized) | 1.33.0 | Mozilla Public License 2.0; maintained by Devon Govett and contributors; the installed `LICENSE` carries the complete license text and AI7 redistributes the packages unmodified |
| `postcss`, `nanoid` | 8.5.26, 3.3.18 | MIT; Copyright 2013 Andrey Sitnik; Copyright 2017 Andrey Sitnik |
| `chai`, `assertion-error`, `@types/chai`, `@types/deep-eql`, `@types/estree` | 6.2.2, 2.0.1, 5.2.3, 4.0.2, 1.0.9 | MIT; Copyright (c) 2017 Chai.js Assertion Library; Copyright (c) 2013 Jake Luer; Copyright (c) Microsoft Corporation. |
| `tinybench`, `tinyexec`, `tinyrainbow`, `tinyglobby`, `fdir`, `picomatch` | 2.9.0, 1.3.0, 3.1.1, 0.2.17, 6.5.0, 4.0.7 | MIT; Copyright (c) 2022 Tinylibs; Copyright (c) 2024 Tinylibs; Copyright (c) 2024 Madeline Gurriarán; Copyright 2023 Abdullah Atta; Copyright (c) 2017-present, Jon Schlinkert. |
| `std-env`, `pathe` | 4.2.0, 2.0.3 | MIT; Copyright (c) Pooya Parsa; Copyright (c) Pooya Parsa - Daniel Roe |
| `magic-string`, `estree-walker`, `@jridgewell/sourcemap-codec`, `es-module-lexer`, `convert-source-map`, `obug`, `why-is-node-running`, `stackback`, `fsevents` (exact optional macOS carrier) | 0.30.21, 3.0.3, 1.6.0, 2.3.2, 2.0.0, 2.1.4, 2.3.0, 0.0.2, 2.3.3 | MIT; Copyright 2018 Rich Harris; Copyright (c) 2015-20 estree-walker contributors; Copyright 2024 Justin Ridgewell; Copyright (C) 2018-2022 Guy Bedford; Copyright 2013 Thorsten Lorenz; Copyright © 2025-PRESENT Kevin Deng; Copyright (c) 2016 Mathias Buus; `stackback` declares MIT in its manifest and ships no license file (Roman Shtylman); `fsevents` Copyright (C) 2010-2020 by Philipp Dunkel, Ben Noordhuis, Elan Shankar, Paul Miller |
| `picocolors`, `siginfo` | 1.1.1, 2.0.0 | ISC; Copyright (c) 2021-2024 Oleksii Raspopov, Kostiantyn Denysov, Anton Verinov; Copyright (c) 2017, Emil Bay |
| `source-map-js` | 1.2.1 | BSD-3-Clause; Copyright (c) 2009-2011, Mozilla Foundation and contributors |
| `detect-libc`, `expect-type` | 2.1.2, 1.4.0 | Apache License 2.0; Copyright Lovell Fuller; Copyright 2024 Misha Kaletsky |

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

Copyright (c) 2021-Present VoidZero Inc. and Vitest contributors

Copyright (c) 2019-present, VoidZero Inc. and Vite contributors

Copyright (c) 2024-present VoidZero Inc. & Contributors

Copyright (c) 2026-present, rolldown/plugins repository contributors

Copyright 2013 Andrey Sitnik

Copyright 2017 Andrey Sitnik

Copyright (c) 2017 Chai.js Assertion Library

Copyright (c) 2013 Jake Luer

Copyright (c) 2022 Tinylibs

Copyright (c) 2024 Tinylibs

Copyright (c) 2024 Madeline Gurriarán

Copyright 2023 Abdullah Atta

Copyright (c) 2017-present, Jon Schlinkert.

Copyright (c) Pooya Parsa

Copyright (c) Pooya Parsa - Daniel Roe

Copyright 2018 Rich Harris

Copyright (c) 2015-20 estree-walker contributors

Copyright 2024 Justin Ridgewell

Copyright (C) 2018-2022 Guy Bedford

Copyright 2013 Thorsten Lorenz

Copyright © 2025-PRESENT Kevin Deng

Copyright (c) 2016 Mathias Buus

Copyright (C) 2010-2020 by Philipp Dunkel, Ben Noordhuis, Elan Shankar, Paul Miller

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## ISC license text

`picocolors@1.1.1` (Copyright (c) 2021-2024 Oleksii Raspopov, Kostiantyn Denysov, Anton Verinov) and `siginfo@2.0.0` (Copyright (c) 2017, Emil Bay) ship the ISC license text in their installed packages. The `saxes@6.0.0` npm tarball omits a license file. Its authoritative tagged [upstream license](https://github.com/lddubeau/saxes/blob/v6.0.0/LICENSE) contains the following two applicable ISC blocks, reproduced here.

The ISC License

Copyright (c) Contributors

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

The ISC License

Copyright (c) Isaac Z. Schlueter and Contributors

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

## Apache License 2.0 route

The complete Apache License 2.0 text is available at <https://www.apache.org/licenses/LICENSE-2.0> and in the installed `playwright-core@1.62.1`, `typescript@6.0.3`, `detect-libc@2.1.2`, and `expect-type@1.4.0` license files. Playwright's installed `NOTICE` and `ThirdPartyNotices.txt` and TypeScript's installed `ThirdPartyNoticeText.txt` retain their exact development-tool notices. Electron's complete bundled third-party license text, including Chromium notices, is carried verbatim in `dist/notices/ELECTRON_LICENSES.chromium.html`.

## Mozilla Public License 2.0 route

`lightningcss@1.33.0` and its exact optional `lightningcss-*` carriers are development-only dependencies of the vitest toolchain, redistributed unmodified. The complete Mozilla Public License 2.0 text is available at <https://mozilla.org/MPL/2.0/> and in each installed package's `LICENSE` file; no AI7 modification of covered software exists.

## BSD-3-Clause license text

`source-map-js@1.2.1`: Copyright (c) 2009-2011, Mozilla Foundation and contributors. All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

- Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
- Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
- Neither the names of the Mozilla Foundation nor the names of project contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
