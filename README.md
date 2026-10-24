# AI7 Harness

AI7 是面向中文文学编辑的本地桌面工作台：把长篇稿件、审校建议、参考资料、事实考据和出版交付放在同一条可追溯的工作流里。你决定哪些修改进入稿件；模型输出先成为建议或证据线索。

当前面向 Windows 交付并从源码构建。依 [ADR 0097](docs/adr/0097-defer-the-macos-platform-indefinitely-and-deliver-windows-only.md)，macOS 平台的全部 gate 与目标（托管 Gate 作业、nightly 打包、发布与再入验证）无限期后置，源码中的 macOS 适配保留但不再验证，直到 Owner 明确要求恢复。当前源码版本 **0.1.0**（Data Version 1），下一目标 0.2.0（Wave 21），1.0.0 为 Wave 23 验收发布（[ADR 0098](docs/adr/0098-adopt-one-x-y-z-version-across-releases-and-internal-management.md)）。[PROGRESS](PROGRESS.md) 记录实际集成能力与证据，已完成的 Initial v1.0.0 Development Milestone 不代表公开发行或平台认证。

## 现在可以怎样工作

1. **导入并编辑。** 创建图书、导入稿件，在长文视图中编辑、标注、比较版本和恢复中断工作。当前 DOCX 修订导入为建议标记，完整原件保留。
2. **审校并核红。** 运行基线分析、审阅、AI7 初评和审稿意见；查看覆盖、引文与缺口。对选中段落「就这段提问」或「润色这段」，再决定是否接受并应用建议。
3. **查资料与核事实。** 本地资料库支持已接入格式的全文提取、检索与精确取证；已接入任务可通过配置的搜索服务获取公开资料，事实判断与编辑采纳分开记录。扫描 PDF 目前只提示需要识别。
4. **准备出版交付。** 起草生产文档，保留版本与交付记录，导出 DOCX 或图书交付包；发稿与文件导出分别决定。
5. **复用编辑经验。** 使用书系知识、社级审阅偏好、范例、工序和自定义分析维度；图书绑定的 Agent 工作区通过既有建议与 Apply 链提出修改。

工作台提供暖纸/夜墨外观、图书搜索切换、专注模式、阅读密度、快捷键与按需技术详情。当前正式模型连接为用户自己的 OpenCode Go 或 DeepSeek 官方凭据；运行数据与开发测试证据分开。

## 已接受、尚待实现的方向（0.2.0 → 1.0.0）

[ADR 0094](docs/adr/0094-unified-multi-provider-runtime-global-learning-agent-and-word-track-changes-intake.md)、[ADR 0095](docs/adr/0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md)、[ADR 0096](docs/adr/0096-edit-manuscript-structure-recognize-structure-and-remove-editor-facing-ceremony.md) 与[开发计划](docs/development/development-plan.md)规定后续交付顺序；文档变更没有实现下列能力：

- **工序为中心。** 每个任务都是一份工序的一次运行：预装工序（基线分析、九类审阅、评估与审稿意见、写作）与本社自己改写、新建、从运行中捕获的工序同在工序库；编辑的任务说明与豁免规则进入工序；每条产出仍过精确锚定，写稿仍过 Apply。
- **更快、可并行的执行。** 一本书内多个单元并行、多本书同时审阅、空闲时自动处理非即时任务；请求有超时、速率限制退避、结果未知只影响该单元。
- **工具型 harness。** 模型回合可按策略调用只读本地工具回看稿件、基线事实、规范条款与术语表，并行调用，子代理在父尝试内扇出；不开放 shell、文件系统或任意网络。
- **审阅契约 v2 与证据上卡。** 块编号、逐条容错、被排除的发现可见；跨章一致性成为模型阶段；事实核查证据（来源、逐字片段、译文、说明）挂在卡片上并归档，报告导出逐条附带；出版政策与风险不联网即可运行；国标标点数字、规范汉字、本社词表与术语一致性由确定性检查阶段完成。
- **统一渠道与选模。** 一份生产策略之后，模型在已声明协议内成为可配置记录；Zen、Go 与 Claude / Gemini / OpenAI / DeepSeek 官方服务共用配置、连接测试与模型选择；各协议仍需能力准入。
- **DeepSeek 与博查双擎考据。** 默认来源可选，回退限于已授权链路，保留实际取证来源。
- **默认本地学习与全域智能体。** 有效核红决定与 Word 修订样本进入可关闭、可排除的智能归纳流程；学习 agent 在需要时以选项加可选输入主动问原因，频率可调可关；检索可用审美记忆并标出参考规则。无需打开图书即可监督学习方向、整理记忆和按明确范围跨书检索。
- **Word 修订双路径。** 导入时明确选择「直接并入正文」或「转为 AI7 修订建议」，两者保留原件与符合准入的修前/修后学习样本。
- **稿件结构与保真。** 拆段、并段、增删段、改标题层级成为普通编辑；脚注可见可编辑，表格与图片只读显示；无样式稿件的结构识别；超长段落导入拆分而非拒绝。
- **案头提效。** 跨段精确选区、右侧常驻副驾、工序一键开始、卡片单一决定、千条建议流畅核红、真实的处理状态指示及更好的 Word 格式保留。一次点击仍只授权本次处理；写入稿件仍需随后明确采纳与 Apply。

## 当前限制与发布状态

AI 输出需要编辑判断。确定性测试证明程序行为，一次模型记录只证明那次结果。[编辑质量实测](docs/development/editorial-evidence-2026-10.md)仍有漏报、锚点失配和不完整响应；标准/严格事实核查及多轮证据复用仍待完善。已编辑 DOCX 的行内格式、超链接、域与修订往返仍有[具体限制](https://github.com/zhouy1017/ai7-harness/issues/874)。真实 EPUB/ODT/RTF 格式验证仍须专门材料准入，已有 DOCX 样本不能替代。

Word 插件集成、OCR、独立稿件窗口、结构调整模式、可执行外来 Skill 与自动更新仍在演进池。DOCX 修订导入是桌面文件工作流，不等于 Word 插件集成；默认学习、全域智能体和真实本地语义模型尚未交付。

已有未签名 Windows 安装包/便携包构建与便携程序自检记录；这不等于安装卸载或完整打包环境验收。依据[自动交付约定](docs/adr/0093-automate-nightly-packages-and-windows-version-tag-releases.md)，Windows nightly Gate 与原生构建通过后，匹配版本标签发布对应 Windows 产物并披露未签名状态。macOS 平台整体依 [ADR 0097](docs/adr/0097-defer-the-macos-platform-indefinitely-and-deliver-windows-only.md) 无限期后置：不运行 macOS Gate，不构建 macOS 包。签名准备与 `main` 晋升仍需各自授权。打包版目前不附赠示例书。

<details>
<summary>开发者：从源码构建、打开与配置生产连接</summary>

## Getting started from source

Use Windows 11 24H2+ on x64; macOS 15+ on Apple Silicon remains a declared but unverified host while the macOS platform is deferred under ADR 0097. Install Git, Node **24.18.1** and Corepack; the repository selects pnpm **11.24.0**. Microsoft Office, Python and a model credential are not required to build and open the local workbench.

From the repository root:

```text
pnpm run doctor
pnpm run bootstrap
pnpm run inspect
```

This builds and opens the provider-free development workbench with a dedicated external inspection data folder. Use `pnpm run inspect:build` for build-only verification without opening a window. See [quick local inspection](docs/development/local-inspection.md) for data location and prerequisites; agents follow the background-guest verification rules.

For your own editorial work after building, use:

```text
pnpm run start:production
```

Choose the product data location when prompted. In 设置 › 模型服务, configure your own OpenCode Go or DeepSeek 官方 connection for model-assisted tasks; the key is stored through the operating system's protected credential store. Supported web tasks also need a configured search backend and its key. Production uses your own data and credentials, separately from development evidence and caches. See the [source-checkout guide](docs/development/source-checkout.md) for launch scopes, data locations and troubleshooting.

</details>

## Documentation and contributions

- [Documentation index](docs/README.md) — current guides, design owners and evidence.
- [Nightly builds and Windows version-tag releases](docs/development/releasing.md) — Windows nightly package builds and unsigned Windows releases.
- [Version identity](docs/development/versioning.md) — matching software version, Data Version, build number and source commit across the app and its packages.
- [PROGRESS](PROGRESS.md) — exact integrated checkpoint and remaining risks.
- [Development plan](docs/development/development-plan.md) — next fixes, features and decision blockers.
- [AGENTS.md](AGENTS.md) — mandatory entry for repository work; [Orca dispatch](docs/agents/orca-dispatch.md) owns assignment, review and integration.

Development inputs must follow the [protected-material boundary](AGENTS.md#protected-material). Only explicitly admitted Public SampleBooks and permitted synthetic inputs belong in tests; keep private manuscripts, their derivatives and credentials outside the repository and hosted CI.
