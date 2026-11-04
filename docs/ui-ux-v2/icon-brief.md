# AI7 编辑工作台 · 成套图标风格稿任务单

对应 [#1318](https://github.com/zhouy1017/ai7-harness/issues/1318)、[主 Issue #1313](https://github.com/zhouy1017/ai7-harness/issues/1313) 与 [Owner 决定 #1314 第 4 条](https://github.com/zhouy1017/ai7-harness/issues/1314)。由 Commander 将本文件附至 Issue，供 Owner 使用 GPT image 生成风格稿。

请生成一张中文编辑工作台的成套图标参考稿：17 个图标等尺寸、等间距排列，暖纸底色 `#f3f0ea`，单色赭色线条 `#7a3e28`，安静、清晰、克制，适合长时间阅读。每个图标使用 **24 × 24 网格，单线描边 1.8，圆端点与圆连接**；正式界面显示为 18px，在此尺寸下仍需可辨识。不要渐变、立体、阴影、文字充当图形或复杂装饰；各图标的视觉重量和留白一致。请在各格下方标注对应 ID 与中文名称，便于核对。

| 固定 symbol ID | 名称 / 含义 |
| --- | --- |
| `i-inbox` | 待我处理 · 收件匣 |
| `i-library` | 书库 · 并排书脊 |
| `i-series` | 书系 · 分层书组 |
| `i-kb` | 知识库 · 资料书 |
| `i-learn` | 质量与学习 · 成长刻度 |
| `i-settings` | 设置 · 调节滑杆 |
| `i-ms` | 稿件 · 有文字行的纸页 |
| `i-review` | 审阅 · 带核对记号的放大镜 |
| `i-star` | 评估 · 星形 |
| `i-box` | 交付物 · 打开的盒子 |
| `i-flag` | 发现 · 小旗 |
| `i-analysis` | 分析 · 同心观察标记 |
| `i-source` | 来源与证据 · 记录卡 |
| `i-overview` | 工作概览 · 四格概览 |
| `i-history` | 历史与恢复 · 回转时钟 |
| `i-menu` | 侧栏展开 / 收起 · 三条横线 |
| `i-back` | 返回 · 向左箭头 |

风格稿是视觉参考。后续矢量化时保留以上全部 ID、`viewBox="0 0 24 24"`、`fill="none"` 与 `stroke="currentColor"`，仅替换 `src/renderer/components/icon-sprite.ts` 中的几何定义，不改变导航、状态、事件或持久化。过渡图形取自 [editor-surfaces §0.4](editor-surfaces.md#04-屏幕索引) 的 ②B 原型；右缘另保留 ① 原型的 `i-nav`（导航与查找）和 `i-task`（任务）扩展符号，不计入本次 17 个风格稿。
