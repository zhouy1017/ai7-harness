# AI7 V1 information architecture

Status: **V1 freeze-candidate direction; not future-architecture authority**

## 1. Navigation model

AI7 combines two structures without confusing them:

1. **Book-first navigation** for durable editorial work and source/mutation authority.
2. **Global work queue** for cross-Book attention, running work, clarification, decisions, and exceptions.

The global queue is a projection over Task Ledger and workflow state. It never becomes a third business ledger, never owns a proposal, and never treats a Harness Session as the user's project.

```text
AI7
├─ 工作台
│  ├─ 继续工作
│  ├─ 待我处理
│  ├─ 运行中
│  └─ 最近完成
├─ 书库
│  └─ Book
│     ├─ 概览
│     ├─ 稿件
│     ├─ 相关交付成果
│     │  ├─ 宣传文章
│     │  ├─ 新闻报道
│     │  └─ 评论文章
│     ├─ 来源与证据
│     ├─ 任务与提案
│     ├─ 编辑工作资料与交付包
│     └─ 历史与恢复
├─ 书系
│  └─ Series
│     ├─ 成员 Book
│     ├─ 书系知识
│     └─ 检索排除项
├─ 质量、学习与审计
│  ├─ 质量概览
│  ├─ 学习材料
│  ├─ 编辑记忆
│  └─ 学习审计记录
└─ 设置
   ├─ 编辑维度与方案
   ├─ 工作流程方案
   ├─ 模型服务与凭据
   ├─ 数据位置与导入导出
   └─ 外观、键盘与无障碍
```

Policy Document assets, identities, authoring, and activation are not editorial-user destinations in this IA. Editorial surfaces may explain the user-relevant outcome of a governing constraint without exposing the developer-only asset.

## 2. Desktop shell

### 2.1 Persistent top bar

The top bar carries context, not a generic page title:

- `Book / Editorial Deliverable / branch or revision` breadcrumb;
- save journal status;
- uncheckpointed-change or latest-checkpoint status;
- recovered-state or recovery-snapshot warning when applicable;
- global search entry with explicit scope; and
- notification/attention entry that links back to authoritative records.

The title may truncate descriptive text, but must preserve the differentiating Book and revision identity through a tooltip or accessible name.

### 2.2 Left navigation

The left region contains:

- application-level destinations;
- the current Book's durable areas;
- pinned/recent Book shortcuts; and
- compact, labeled work-state counts.

Tasks do not appear as peer “conversations” beside Books. They live inside a Book and in the global queue projection.

### 2.3 Central work surface

The center shows exactly one primary work object:

- manuscript or other deliverable editor;
- proposal comparison;
- editorial review or factual-verification result;
- workflow or Delivery Package work surface; or
- full-page audit/settings view when no text must remain visible.

Running AI work never automatically navigates the editor away from the text.

### 2.4 Right context rail and inspector

A narrow icon-and-label rail opens one inspector at a time:

- 大纲;
- 编辑审读与核验;
- 修改建议;
- 来源与证据;
- 编辑任务;
- 工作流程.

The rail changes available destinations according to the central work object. It never contains terminal, arbitrary browser, generic filesystem, model reasoning level, or blanket-access controls.

### 2.5 Bottom task entry

When text or a deliverable is active, a compact bottom entry displays the bound context and opens the Task inspector. It is not a persistent full chat transcript and must not cover the final manuscript lines.

## 3. Responsive behavior

| Layout | Left navigation | Center | Right inspector |
| --- | --- | --- | --- |
| Wide desktop | Expanded by default | Prioritized manuscript width | One expanded inspector |
| Standard laptop | Collapsible | Stable manuscript measure | Overlay or replaces left expansion |
| 1366×768 at 150% | Collapsed rail or temporary drawer | Always visible | At most one temporary drawer |
| Focus mode | Hidden | Maximum centered manuscript | Hidden; task status remains reachable |
| Proposal comparison | Usually collapsed | Inline or two-column comparison | Decision/evidence inspector |

There is no viewport where four permanent vertical regions are allowed.

## 4. Screen inventory

### 4.1 Workbench and library

- continue-working home;
- global attention queue;
- Book library/search;
- create Book/import manuscript;
- Book overview; and
- Series overview and membership.

### 4.2 Manuscript and source work

- windowed manuscript editor;
- outline and whole-manuscript find/replace;
- import fidelity review;
- source library and source detail;
- revision/history view;
- checkpoint and recovery view; and
- export fidelity and delivery preparation.

### 4.3 AI-assisted editorial work

- context-aware task composer;
- Plan Preview and Run Authorization;
- running task and durable clarification;
- Plan Revision review;
- Task Outcome;
- factual-verification workspace;
- editorial review findings;
- correction/proposal review;
- conflict resolution; and
- Effect outcome and receipt.

### 4.4 Deliverable workflow

- deliverable overview;
- Workflow Instance phases;
- 工作关口/evidence review;
- Editorial Artifact registry and detail;
- signoff;
- Delivery Package; and
- export versus public-release decision.

### 4.5 Learning, quality, and settings

- quick non-blocking result feedback;
- Learning Material review;
- Memory Candidate and active memory review;
- Learning Audit lineage;
- quality metrics;
- Editorial Dimension/Profile settings;
- Workflow Profile settings;
- model provider and credential setup;
- read-only evidence-status explanations and factual-verification criteria notices;
- data-location and sync-root warning; and
- appearance, keyboard, and accessibility settings.

## 5. Cross-object navigation rules

1. Clicking evidence navigates to the exact immutable 源材料版本 or pinned 稿件修订版 and exact range.
2. Clicking a queue item opens its authoritative record in its Book; the queue does not render a substitute detail view.
3. Clicking a proposal opens the base/current/proposal relationship before any decision control.
4. Clicking a workflow status opens the deliverable's Workflow Instance, not a Task Session that worked on it.
5. Clicking a quality metric opens attributed signals without granting access to raw text outside the user's selected Book or task scope.
6. Notifications are pointers. Dismissing one never changes the underlying Clarification Request, proposal, gate, or Effect state.

## 6. Default landing behavior

- If a recoverable editing state exists, offer to reopen it and label it as recovered before showing recent work.
- Otherwise reopen the last active Book and work surface.
- If no Book exists, show Book creation/import with model-provider setup as a secondary readiness step.
- A running task may show in the top-level queue but never steals focus on launch.

## 7. Naming rules

- Use `新建编辑任务`, not `新对话`.
- Use `来源与证据`, not generic `文件`.
- Use `编辑审读`, not `审查` or `Review` alone.
- Use `修改建议` or `更正提案`, not generic `AI 输出`.
- Use `任务运行授权`, `提案处理决定`, `受控动作批准`, and `公开发布许可` as applicable; never one generic `批准`.
- Use `暂停` and `取消` separately.
- Use `续行`, `重试`, `重做`, and `重放` separately.
