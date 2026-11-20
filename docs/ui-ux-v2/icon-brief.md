# AI7 编辑工作台 · 成套图标规格

对应 [#1318](https://github.com/zhouy1017/ai7-harness/issues/1318)、[主 Issue #1313](https://github.com/zhouy1017/ai7-harness/issues/1313) 与 [Owner 决定 #1314 第 4 条](https://github.com/zhouy1017/ai7-harness/issues/1314)。[#1554](https://github.com/zhouy1017/ai7-harness/issues/1554) 起，本文件是当前图标集合的唯一清单：侧栏每一行、稿件右缘每个入口、侧栏开合与稿件工具栏各有自己的固定 ID，任何两个去向不共用一个。

规格：每个图标使用 **24 × 24 网格，单线描边 1.8，圆端点与圆连接**；`viewBox="0 0 24 24"`、`fill="none"`、`stroke="currentColor"`，正式界面显示为 18px（`src/renderer/styles.css` 的 `.icon`），在此尺寸下仍需可辨识。不要渐变、立体、阴影、文字充当图形或复杂装饰；各图标的视觉重量和留白一致。风格稿使用暖纸底色 `#f3f0ea`、单色赭色线条 `#7a3e28`，安静、清晰、克制，适合长时间阅读。

风格稿是视觉参考。矢量化时保留以下全部 ID，只替换 `src/renderer/components/icon-sprite.ts` 中的几何定义，不改变导航、状态、事件或持久化。

## 侧栏

| 固定 symbol ID | 名称 / 含义 |
| --- | --- |
| `i-inbox` | 待我处理 · 收件匣 |
| `i-checklist` | 任务 · 两行带大勾的任务单（#1554） |
| `i-library` | 书库 · 并排书脊 |
| `i-series` | 书系 · 分层书组 |
| `i-kb` | 知识库 · 资料书 |
| `i-learn` | 质量与学习 · 成长刻度 |
| `i-agent` | AI 助手 · 带星芒的对话气泡（#1413） |
| `i-settings` | 设置 · 调节滑杆 |
| `i-more` | 更多图书 · 两册书脊与向下的展开箭头（#1554） |
| `i-menu` | 侧栏展开 / 收起 · 三条横线 |

## 当前图书

| 固定 symbol ID | 名称 / 含义 |
| --- | --- |
| `i-ms` | 主稿件 · 有文字行的纸页 |
| `i-derivative` | 衍生稿件 · 一页压在另一页上（#1521） |
| `i-review` | 审阅 · 带核对记号的放大镜 |
| `i-flag` | 待办汇总 · 小旗 |
| `i-star` | 评估 · 星形 |
| `i-box` | 交付物 · 打开的盒子 |
| `i-workspace` | AI 改稿 · 带分栏的窗口（#1413） |
| `i-analysis` | 分析 · 同心观察标记 |
| `i-source` | 来源与证据 · 记录卡 |
| `i-overview` | 工作概览 · 四格概览 |

## 稿件右缘

| 固定 symbol ID | 名称 / 含义 |
| --- | --- |
| `i-nav` | 导航与查找 · 带放大镜的目录（① 原型扩展符号） |
| `i-paragraph-analysis` | 当前段落的分析 · 两行段落与观察圈（#1554） |
| `i-task` | 这本书的任务 · 笔与任务行（① 原型扩展符号） |
| `i-comment` | 批注 · 对话气泡（#1413） |

## 工具栏与保留

| 固定 symbol ID | 名称 / 含义 |
| --- | --- |
| `i-undo` | 撤销 · 回转箭头 |
| `i-redo` | 重做 · 反向回转箭头 |
| `i-back` | 返回 · 向左箭头 |
| `i-history` | 历史与恢复 · 回转时钟（保留；侧栏不再使用，#1521） |

几何取自 [editor-surfaces §0.4](editor-surfaces.md#04-屏幕索引) 的 ②B 原型；右缘的 `i-nav` 与 `i-task` 取自 ① 原型。
