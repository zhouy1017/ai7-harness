const variants = {
  A: "协作三栏",
  B: "稿件专注",
  C: "编辑台面",
};

const stages = ["editor", "compose", "plan", "running", "evidence", "proposal", "applied"];

function readPrototypeState() {
  const params = new URLSearchParams(window.location.search);
  const variant = variants[params.get("variant")] ? params.get("variant") : "A";
  const stage = stages.includes(params.get("stage")) ? params.get("stage") : "editor";
  const compare = params.get("compare") === "split" ? "split" : "inline";
  const evidenceOpen = params.get("evidence") === "open";
  const feedback = params.get("feedback") || "";
  const panelOpen = params.get("panel") !== "closed";
  return { variant, stage, compare, evidenceOpen, feedback, panelOpen };
}

let prototypeState = readPrototypeState();

function updatePrototypeState(next) {
  prototypeState = { ...prototypeState, ...next };
  const params = new URLSearchParams();
  params.set("variant", prototypeState.variant);
  params.set("stage", prototypeState.stage);
  if (prototypeState.compare !== "inline") params.set("compare", prototypeState.compare);
  if (prototypeState.evidenceOpen) params.set("evidence", "open");
  if (prototypeState.feedback) params.set("feedback", prototypeState.feedback);
  if (!prototypeState.panelOpen) params.set("panel", "closed");
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  render();
}

function icon(symbol, label = "") {
  return `<span aria-hidden="true">${symbol}</span>${label ? `<span>${label}</span>` : ""}`;
}

function currentRevision() {
  return prototypeState.stage === "applied" ? "r8" : "r7";
}

function topbar(variant) {
  const compactBrand = variant === "B";
  const revision = currentRevision();
  return `
    <header class="topbar">
      <button class="icon-button" type="button" data-action="toggle-left" aria-label="打开主导航">${icon("☰")}</button>
      <div class="brand"><span class="brand-mark">A7</span>${compactBrand ? "" : "<span>AI7</span>"}</div>
      <div class="topbar-title" title="《雾港来信》 / 稿件 / 当前稿件修订版 ${revision}">
        <span class="muted breadcrumb-detail">《雾港来信》</span>
        <span class="muted breadcrumb-detail">/</span>
        <strong>稿件 · 当前稿件修订版 ${revision}</strong>
      </div>
      <span class="status-text hide-compact"><span class="status-dot"></span>已写入修订日志</span>
      <span class="status-text hide-compact"><span class="status-dot warn"></span>有修改尚未建立稿件修订检查点</span>
      <span class="prototype-flag">◇ 合成内容 · 设计原型</span>
      <button class="icon-button" type="button" aria-label="搜索当前 Book">⌕</button>
      <button class="icon-button" type="button" aria-label="打开待处理事项">◉</button>
    </header>`;
}

function leftNavigation() {
  return `
    <nav class="left-nav" aria-label="AI7 主导航">
      <button class="nav-item"><span aria-hidden="true">⌂</span><span>工作台</span><span class="count">4</span></button>
      <button class="nav-item"><span aria-hidden="true">▣</span><span>书库</span></button>
      <button class="nav-item"><span aria-hidden="true">⌘</span><span>全局工作队列</span><span class="count">2</span></button>

      <div class="nav-heading">当前 BOOK</div>
      <section class="nav-book" aria-label="当前 Book">
        <div class="nav-book-title">
          <span class="book-glyph" aria-hidden="true"></span>
          <div>
            <strong>雾港来信</strong>
            <div class="small muted">文学长篇 · 合成示例</div>
          </div>
        </div>
      </section>
      <button class="nav-item active"><span aria-hidden="true">文</span><span>稿件</span></button>
      <button class="nav-item"><span aria-hidden="true">◫</span><span>相关交付成果</span><span class="count">3</span></button>
      <button class="nav-item"><span aria-hidden="true">⌕</span><span>来源与证据</span><span class="count">6</span></button>
      <button class="nav-item"><span aria-hidden="true">✦</span><span>任务与提案</span><span class="count">1</span></button>
      <button class="nav-item"><span aria-hidden="true">◇</span><span>编辑工作资料</span></button>
      <button class="nav-item"><span aria-hidden="true">↶</span><span>历史与恢复</span></button>

      <div class="nav-heading">书系与治理</div>
      <button class="nav-item"><span aria-hidden="true">◎</span><span>潮汐书系</span></button>
      <button class="nav-item"><span aria-hidden="true">≋</span><span>质量、学习与审计</span></button>
      <button class="nav-item"><span aria-hidden="true">⚙</span><span>设置</span></button>
    </nav>`;
}

function editorToolbar() {
  return `
    <div class="editor-toolbar" role="toolbar" aria-label="稿件编辑工具">
      <button class="icon-button" type="button" aria-label="撤销">↶</button>
      <button class="icon-button" type="button" aria-label="重做">↷</button>
      <span class="muted">|</span>
      <button class="plain-button hide-compact" type="button">正文</button>
      <button class="icon-button hide-compact" type="button" aria-label="添加批注">▢</button>
      <button class="icon-button hide-compact" type="button" aria-label="查找全文">⌕</button>
      <span class="spacer"></span>
      <span class="status-text"><span class="status-dot"></span>修订日志已持久化 · 18 秒前</span>
      <button class="plain-button hide-compact" type="button">建立稿件修订检查点</button>
    </div>`;
}

function manuscriptParagraph() {
  if (prototypeState.stage === "applied") {
    return `海陵城的新港于一九三八年三月十二日开始试运转，并于四月二日正式通车。父亲在信里只写“汽笛第一次越过旧堤”，没有分清那是试运转还是正式通车。`;
  }

  if (prototypeState.stage === "proposal") {
    return `海陵城的新港<del class="proposal-delete">于一九三八年三月十二日正式通车</del><ins class="proposal-insert">于一九三八年三月十二日开始试运转，并于四月二日正式通车</ins>。父亲在信里只写“汽笛第一次越过旧堤”，没有分清那是试运转还是正式通车。`;
  }

  const claimClass = prototypeState.stage === "evidence" && prototypeState.evidenceOpen
    ? "evidence-highlight"
    : "selected-claim";
  return `海陵城的新港<span class="${claimClass}">于一九三八年三月十二日正式通车</span>。父亲在信里只写“汽笛第一次越过旧堤”，没有分清那是试运转还是正式通车。`;
}

function manuscriptSurface() {
  if (prototypeState.stage === "proposal" && prototypeState.compare === "split") {
    return `
      <div class="editor-shell">
        ${editorToolbar()}
        <div class="paper-wrap">
          <div class="split-comparison" aria-label="原稿与更正提案对照">
            <section class="split-pane">
              <h3>当前稿 · r7</h3>
              <p>海陵城的新港<del class="proposal-delete">于一九三八年三月十二日正式通车</del>。父亲在信里只写“汽笛第一次越过旧堤”，没有分清那是试运转还是正式通车。</p>
            </section>
            <section class="split-pane">
              <h3>更正提案 · 基于 r7</h3>
              <p>海陵城的新港<ins class="proposal-insert">于一九三八年三月十二日开始试运转，并于四月二日正式通车</ins>。父亲在信里只写“汽笛第一次越过旧堤”，没有分清那是试运转还是正式通车。</p>
            </section>
          </div>
        </div>
        ${taskLauncher()}
      </div>`;
  }

  return `
    <div class="editor-shell">
      ${editorToolbar()}
      <div class="paper-wrap">
        <article class="paper" aria-label="合成稿件《雾港来信》" contenteditable="true" spellcheck="false">
          <span class="synthetic-note">设计测试用合成稿件，不是实际出版材料</span>
          <h1>雾港来信</h1>
          <div class="manuscript-meta">第六章 · 潮声以外　｜　窗口 12 / 86　｜　当前稿件修订版 ${currentRevision()}</div>
          <p>雨停在凌晨四点。旧堤外的灯一盏一盏熄下去，像有人沿着海岸收起一封写得太长的信。</p>
          <p>${manuscriptParagraph()}</p>
          <p>她把那张发黄的报纸折回原样，又从抽屉里取出父亲的第三封信。信纸边缘有盐粒留下的白痕，日期却清楚得近乎固执。</p>
          <h2>二</h2>
          <p>码头钟楼敲过六下，渡船才从雾里露出船首。岸上的人没有招手，只把帽檐压得更低。她忽然明白，那些信不是为了说明过去，而是为了让某个人在多年以后仍能找到返回的路。</p>
          <div class="window-boundary">下一稿件窗口将在继续阅读时加载 · 全稿位置由大纲与索引维护</div>
        </article>
      </div>
      ${taskLauncher()}
    </div>`;
}

function taskLauncher() {
  const labels = {
    editor: ["对当前选区发起编辑任务", "选区 · 当前稿件修订版 r7 · 默认任务运行来源范围：本书"],
    compose: ["正在组织：事实核验并提出更正", "目标与范围将在右侧确认"],
    plan: ["计划等待任务运行授权", "本书 + 2 项已选来源 · 不包含公开发布"],
    running: ["事实核验正在运行", "可继续编辑 · 已读取当前稿件修订版 r7 与 2 项来源"],
    evidence: ["发现一项日期差异", "引证完整性已确认 · 陈述支持存在差异 · 事实核验待处理"],
    proposal: ["更正提案等待处理", "基于稿件修订版 r7 · 当前稿件修订版仍为 r7 · 无漂移"],
    applied: ["更正已应用并取得回执", "新稿件修订版 r8 · 原提案与证据可追溯"],
  };
  const [title, context] = labels[prototypeState.stage];
  const action = prototypeState.stage === "editor" ? "start-task" : "open-panel";
  return `
    <button class="task-launcher" type="button" data-action="${action}" aria-label="${title}">
      <span aria-hidden="true">✦</span>
      <span class="task-launcher-text">
        <strong>${title}</strong>
        <span class="context-line">${context}</span>
      </span>
      <span aria-hidden="true">→</span>
    </button>`;
}

function inspectorTitle() {
  const titles = {
    editor: "大纲与当前选区",
    compose: "新建编辑任务",
    plan: "计划预览",
    running: "任务运行中",
    evidence: "事实核验结果",
    proposal: "更正提案",
    applied: "应用结果与反馈",
  };
  return titles[prototypeState.stage];
}

function inspectorBody() {
  if (prototypeState.stage === "editor") {
    return `
      <section class="panel-section">
        <div class="eyebrow">当前大纲</div>
        <h3>第六章 · 潮声以外</h3>
        <ul class="summary-list">
          <li><span class="label">当前窗口</span><span>12 / 86</span></li>
          <li><span class="label">全稿位置</span><span>第 68,420–70,190 字</span></li>
          <li><span class="label">当前选区</span><span>“于一九三八年三月十二日正式通车”</span></li>
        </ul>
      </section>
      <section class="panel-section">
        <h3>可从选区开始</h3>
        <div class="decision-list">
          <button class="choice-button" type="button" data-action="start-task">事实核验并提出更正</button>
          <button class="choice-button" type="button">核对引文与日期</button>
          <button class="choice-button" type="button">检查叙事时间线</button>
        </div>
      </section>`;
  }

  if (prototypeState.stage === "compose") {
    return `
      <section class="panel-section">
        <div class="eyebrow">任务模板</div>
        <h3>事实核验并提出更正</h3>
        <div class="chip-row">
          <span class="chip">《雾港来信》</span>
          <span class="chip">稿件修订版 r7</span>
          <span class="chip">精确选区 · 15 字</span>
          <span class="chip">引证完整性、陈述支持与事实核验</span>
        </div>
      </section>
      <section class="panel-section">
        <label class="field-label" for="task-prompt">希望 AI7 做什么</label>
        <textarea class="task-textarea" id="task-prompt">核验选中句子的通车日期。区分试运转与正式通车；如果有可靠证据，请提出最小范围的更正，不要改写相邻叙述。</textarea>
      </section>
      <section class="panel-section">
        <h3>任务运行来源范围</h3>
        <div class="chip-row">
          <span class="chip">本书稿件修订版 r7</span>
          <span class="chip">港务档案摘录 · 源材料版本 v2</span>
          <span class="chip">地方报纸索引 · 源材料版本 v1</span>
        </div>
        <p>未选择书系或跨 Book 来源。模型调用会处理当前选区和已选证据，不构成公开发布。</p>
      </section>
      <div class="action-row">
        <button class="plain-button" type="button" data-action="reset">取消草稿</button>
        <button class="primary-button" type="button" data-action="show-plan">生成计划预览</button>
      </div>`;
  }

  if (prototypeState.stage === "plan") {
    return `
      <section class="panel-section">
        <div class="eyebrow">计划预览 · 不是授权本身</div>
        <h3>核验一项日期陈述并形成可选更正</h3>
        <ol class="timeline">
          <li><span class="timeline-mark"></span><div><div class="timeline-title">读取精确稿件选区</div><div class="timeline-detail">固定到《雾港来信》稿件修订版 r7</div></div></li>
          <li><span class="timeline-mark"></span><div><div class="timeline-title">检索并精确读取两项来源</div><div class="timeline-detail">检索只返回候选，引用必须经过精确读取</div></div></li>
          <li><span class="timeline-mark"></span><div><div class="timeline-title">分别判断三类核验状态</div><div class="timeline-detail">引证完整性、陈述支持、事实核验</div></div></li>
          <li><span class="timeline-mark"></span><div><div class="timeline-title">必要时形成更正提案</div><div class="timeline-detail">仅创建提案，不直接修改当前稿</div></div></li>
        </ol>
      </section>
      <section class="panel-section">
        <ul class="summary-list">
          <li><span class="label">精确目标</span><span>《雾港来信》 · 稿件修订版 r7 · 当前精确选区（15 字）</span></li>
          <li><span class="label">任务运行来源范围</span><span>当前 Book；海陵港务档案摘录 · 源材料版本 v2；《海陵晨报》索引摘录 · 源材料版本 v1；未选书系或跨 Book 来源</span></li>
          <li><span class="label">外发数据类别</span><span>未公开编辑材料：当前选区与上述两项来源片段；仅发送给已配置的核验模型</span></li>
          <li><span class="label">演示预算与停止条件</span><span>最多 1 次模型调用、6,000 输入字；达到任一上限即停止并返回部分结果</span></li>
          <li><span class="label">计划内调整</span><span>可调整检索次序与候选排序；不得改变目标、来源、模型绑定、外发类别、预算或受控动作</span></li>
          <li><span class="label">预期结果</span><span>事实核验记录；可能附带更正提案</span></li>
          <li><span class="label">受控动作</span><span>本计划不应用稿件变更、不导出、不公开发布</span></li>
        </ul>
        <div class="notice">任务运行授权只允许在以上计划权限边界内工作。接受提案与应用稿件变更会在之后分别决定。</div>
      </section>
      <div class="action-row">
        <button class="plain-button" type="button" data-action="back-compose">返回修改</button>
        <button class="primary-button" type="button" data-action="authorize">授权此任务并开始</button>
      </div>`;
  }

  if (prototypeState.stage === "running") {
    return `
      <section class="panel-section">
        <div class="eyebrow">运行中 · 可继续编辑</div>
        <h3>事实核验并提出更正</h3>
        <ol class="timeline">
          <li class="done"><span class="timeline-mark">✓</span><div><div class="timeline-title">已读取稿件精确选区</div><div class="timeline-detail">《雾港来信》稿件修订版 r7 · 15 字</div></div></li>
          <li class="done"><span class="timeline-mark">✓</span><div><div class="timeline-title">已检索两项授权来源</div><div class="timeline-detail">精确读取 2 项候选；未扩大任务运行来源范围</div></div></li>
          <li class="active"><span class="timeline-mark"></span><div><div class="timeline-title">正在比较日期与事件类型</div><div class="timeline-detail">区分试运转、正式通车及报道日期</div></div></li>
          <li><span class="timeline-mark"></span><div><div class="timeline-title">等待形成核验结果</div><div class="timeline-detail">如需改稿，只会创建提案分支（Proposal Branch）</div></div></li>
        </ol>
        <div class="notice">内部工具调用和模型技术事件已隐藏。可在高级执行详情中审计，但它们不是业务完成证据。</div>
      </section>
      <div class="action-row">
        <button class="plain-button" type="button">暂停</button>
        <button class="danger-button" type="button">取消任务</button>
        <button class="primary-button" type="button" data-action="show-evidence">模拟完成核验</button>
      </div>`;
  }

  if (prototypeState.stage === "evidence") {
    return `
      <section class="panel-section">
        <div class="eyebrow">被核验陈述</div>
        <h3>“新港于一九三八年三月十二日正式通车”</h3>
        <p>来源区分了“试运转”与“正式通车”。稿件把前者日期写成了后者日期。</p>
      </section>
      <section class="panel-section">
        <h3>三个独立状态</h3>
        <div class="evidence-status-grid">
          <div class="evidence-status"><div class="evidence-status-head"><span>引证完整性</span><span class="state-word good">✓ 已确认</span></div><p>两项引证均已从固定源材料版本精确读取。</p></div>
          <div class="evidence-status"><div class="evidence-status-head"><span>陈述支持</span><span class="state-word warn">△ 不支持</span></div><p>现有来源不支持“3 月 12 日正式通车”。</p></div>
          <div class="evidence-status"><div class="evidence-status-head"><span>事实核验</span><span class="state-word warn">× 证据反驳</span></div><p>两项来源一致指向 4 月 2 日正式通车；建议编辑确认并更正。</p></div>
        </div>
      </section>
      <section class="panel-section">
        <h3>证据</h3>
        <button class="source-card" type="button" data-action="open-evidence" aria-label="打开海陵港务档案摘录原文"><strong>海陵港务档案摘录 · 源材料版本 v2</strong><span>“三月十二日开始试运转……四月二日正式通车。” · 精确读取成功</span></button>
        <button class="source-card" type="button" data-action="open-evidence" aria-label="打开海陵晨报索引摘录原文"><strong>《海陵晨报》索引摘录 · 源材料版本 v1</strong><span>四月三日报道前一日通车仪式 · 佐证日期，非权威档案</span></button>
      </section>
      <div class="action-row">
        <button class="plain-button" type="button">保留为尚未解决</button>
        <button class="plain-button" type="button">形成作者询问</button>
        <button class="primary-button" type="button" data-action="create-proposal">形成更正提案</button>
      </div>`;
  }

  if (prototypeState.stage === "proposal") {
    return `
      <section class="panel-section">
        <div class="eyebrow">Correction Proposal · 基于稿件修订版 r7</div>
        <h3>区分试运转与正式通车日期</h3>
        <div class="compare-toggle" role="group" aria-label="提案显示方式">
          <button class="tab-button ${prototypeState.compare === "inline" ? "active" : ""}" type="button" data-action="compare-inline" aria-pressed="${prototypeState.compare === "inline"}">行内</button>
          <button class="tab-button ${prototypeState.compare === "split" ? "active" : ""}" type="button" data-action="compare-split" aria-pressed="${prototypeState.compare === "split"}">对照</button>
        </div>
      </section>
      <section class="panel-section">
        <h3>最小范围更改</h3>
        <div class="diff-block">海陵城的新港<del class="proposal-delete">于一九三八年三月十二日正式通车</del><ins class="proposal-insert">于一九三八年三月十二日开始试运转，并于四月二日正式通车</ins>。</div>
        <ul class="summary-list">
          <li><span class="label">共同基线</span><span>稿件修订版 r7</span></li>
          <li><span class="label">当前目标</span><span>稿件修订版 r7 · 无漂移</span></li>
          <li><span class="label">来源</span><span>2 项精确读取来源；核验记录 FV-014</span></li>
          <li><span class="label">应用方式</span><span>单段落原子应用；如目标漂移则停止</span></li>
        </ul>
      </section>
      <section class="panel-section">
        <h3>提案处理决定</h3>
        <div class="decision-list" role="group" aria-label="提案处理决定">
          <button class="choice-button selected" type="button" aria-pressed="true">接受此提案</button>
          <button class="choice-button" type="button" aria-pressed="false">编辑后接受</button>
          <button class="choice-button" type="button" aria-pressed="false">保留为备选分支</button>
          <button class="choice-button" type="button" aria-pressed="false">拒绝</button>
        </div>
        <div class="notice warn">“接受并应用”将记录提案处理决定，并为这一次精确稿件变更创建受控动作批准。只有回执能证明应用成功。</div>
      </section>
      <div class="action-row">
        <button class="plain-button" type="button">稍后处理</button>
        <button class="primary-button" type="button" data-action="apply-proposal">接受并应用到 r7</button>
      </div>`;
  }

  return `
    <section class="panel-section">
      <div class="eyebrow">提案处理决定</div>
      <h3>已接受更正提案</h3>
      <p>Proposal Decision · PD-SYNTH-0014。该决定记录编辑对内容的判断；它本身不证明文本已经写入稿件。</p>
    </section>
    <section class="panel-section">
      <div class="eyebrow">受控动作批准</div>
      <h3>已批准这一次精确稿件变更</h3>
      <ul class="summary-list">
        <li><span class="label">批准记录</span><span>Effect Approval · EA-SYNTH-0008</span></li>
        <li><span class="label">精确绑定</span><span>提案 CP-SYNTH-0014 v1 → 《雾港来信》稿件修订版 r7</span></li>
        <li><span class="label">重放策略</span><span>单次原子应用；目标或载荷漂移即失效</span></li>
      </ul>
      <p>这项批准只允许尝试提交；它本身仍不证明应用成功。</p>
    </section>
    <section class="panel-section">
      <div class="receipt">
        <strong>✓ 稿件变更已提交</strong>
        <p>目标稿件修订版 r7 已原子更新为 r8。新稿件修订版、分支指针、审计记录与回执已一起提交。</p>
        <div class="receipt-id">Effect Receipt · ER-SYNTH-0008</div>
      </div>
    </section>
    <section class="panel-section">
      <h3>这次更正为什么合适？（可选）</h3>
      <p>以下选项没有预选。忽略也不会影响已完成的提案处理。</p>
      <div class="chip-row">
        ${["事实更准确", "改动范围恰当", "证据说明清楚"].map(reason => `<button class="choice-button ${prototypeState.feedback === reason ? "selected" : ""}" type="button" data-action="feedback" data-value="${reason}" aria-pressed="${prototypeState.feedback === reason}">${reason}</button>`).join("")}
      </div>
    </section>
    <div class="action-row">
      <button class="plain-button" type="button" data-action="reset">返回编辑器并重置演示</button>
    </div>`;
}

function inspector() {
  return `
    <aside class="inspector" aria-label="${inspectorTitle()}">
      <div class="inspector-header">
        <h2>${inspectorTitle()}</h2>
        <button class="icon-button" type="button" data-action="close-panel" aria-label="收起右侧面板">×</button>
      </div>
      <div class="inspector-body">${inspectorBody()}</div>
    </aside>`;
}

function prototypeSwitcher() {
  return `
    <div class="prototype-switcher" aria-label="原型变体切换器">
      <button type="button" data-action="previous-variant" aria-label="上一套界面">←</button>
      <span class="switcher-label">${prototypeState.variant} — ${variants[prototypeState.variant]}</span>
      <button type="button" data-action="next-variant" aria-label="下一套界面">→</button>
    </div>`;
}

function variantA() {
  return `
    <div class="window">
      ${topbar("A")}
      ${leftNavigation()}
      <main class="workspace">${manuscriptSurface()}</main>
      ${inspector()}
    </div>`;
}

function variantB() {
  const showDrawer = prototypeState.stage !== "editor" || prototypeState.panelOpen;
  return `
    <div class="window">
      ${topbar("B")}
      <main class="workspace">${manuscriptSurface()}</main>
      <nav class="focus-mini-nav" aria-label="专注模式快捷入口">
        <button class="icon-button" type="button" aria-label="打开 Book 导航">书</button>
        <button class="icon-button" type="button" aria-label="打开大纲">纲</button>
        <button class="icon-button" type="button" data-action="open-panel" aria-label="打开上下文面板">✦</button>
      </nav>
      ${showDrawer ? `<div class="focus-drawer">${inspector()}</div>` : ""}
    </div>`;
}

function deskMap() {
  const revision = currentRevision();
  return `
    <aside class="desk-map" aria-label="Book 编辑台面导航">
      <div class="brand"><span class="brand-mark">A7</span><span>雾港来信</span></div>
      <div class="small muted" style="margin:8px 0 18px 35px">文学长篇 · 当前稿件修订版 ${revision}</div>
      <button class="nav-item active"><span>文</span><span>当前稿件</span></button>
      <button class="nav-item"><span>✦</span><span>任务与提案</span><span class="count">1</span></button>
      <button class="nav-item"><span>⌕</span><span>来源与证据</span><span class="count">6</span></button>
      <button class="nav-item"><span>◫</span><span>相关交付成果</span><span class="count">3</span></button>
      <div class="desk-outline">
        <div class="eyebrow">稿件大纲</div>
        <button>一　潮汐表</button>
        <button>二　远岸的灯</button>
        <button>三　没有寄出的信</button>
        <button class="active"><strong>六　潮声以外</strong></button>
        <button>七　旧堤</button>
      </div>
      <div class="nav-heading">BOOK 状态</div>
      <div class="chip-row">
        <span class="chip">修订日志已持久化</span>
        <span class="chip warn">待建稿件修订检查点</span>
      </div>
    </aside>`;
}

function attentionStrip() {
  return `
    <div class="attention-strip" aria-label="当前 Book 待处理事项">
      <span class="eyebrow">待我处理</span>
      <span class="attention-item"><span class="status-dot warn"></span>1 个更正提案</span>
      <span class="attention-item"><span class="status-dot"></span>宣传文章 · 等待审读</span>
      <span class="attention-item"><span aria-hidden="true">◇</span>最近稿件修订检查点 · 今天 09:42</span>
      <button class="text-button" type="button">打开全局工作队列 →</button>
    </div>`;
}

function variantC() {
  return `
    <div class="window">
      ${topbar("C")}
      ${deskMap()}
      ${attentionStrip()}
      <div class="desk-main">
        <main class="workspace">${manuscriptSurface()}</main>
        ${inspector()}
      </div>
    </div>`;
}

function render() {
  const app = document.getElementById("app");
  const variantMarkup = prototypeState.variant === "A" ? variantA() : prototypeState.variant === "B" ? variantB() : variantC();
  const inspectorClass = prototypeState.panelOpen || prototypeState.stage !== "editor" ? "show-inspector" : "";
  app.innerHTML = `
    <div class="prototype-root variant-${prototypeState.variant.toLowerCase()} ${inspectorClass}" data-prototype="true">
      ${variantMarkup}
      ${prototypeSwitcher()}
    </div>`;
}

function cycleVariant(direction) {
  const keys = Object.keys(variants);
  const index = keys.indexOf(prototypeState.variant);
  const nextIndex = (index + direction + keys.length) % keys.length;
  updatePrototypeState({ variant: keys[nextIndex], panelOpen: true });
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;
  const action = trigger.dataset.action;

  if (action === "previous-variant") cycleVariant(-1);
  if (action === "next-variant") cycleVariant(1);
  if (action === "start-task") updatePrototypeState({ stage: "compose", panelOpen: true });
  if (action === "show-plan") updatePrototypeState({ stage: "plan", panelOpen: true });
  if (action === "back-compose") updatePrototypeState({ stage: "compose", panelOpen: true });
  if (action === "authorize") updatePrototypeState({ stage: "running", panelOpen: true });
  if (action === "show-evidence") updatePrototypeState({ stage: "evidence", panelOpen: true });
  if (action === "open-evidence") {
    updatePrototypeState({ evidenceOpen: true, panelOpen: true });
    window.requestAnimationFrame(() => {
      document.querySelector(".evidence-highlight")?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }
  if (action === "create-proposal") updatePrototypeState({ stage: "proposal", compare: "inline", panelOpen: true });
  if (action === "compare-inline") updatePrototypeState({ compare: "inline" });
  if (action === "compare-split") updatePrototypeState({ compare: "split" });
  if (action === "apply-proposal") updatePrototypeState({ stage: "applied", compare: "inline", panelOpen: true });
  if (action === "feedback") updatePrototypeState({ feedback: trigger.dataset.value || "" });
  if (action === "reset") updatePrototypeState({ stage: "editor", compare: "inline", evidenceOpen: false, feedback: "", panelOpen: true });
  if (action === "open-panel") updatePrototypeState({ panelOpen: true });
  if (action === "close-panel") updatePrototypeState({ panelOpen: false });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const target = event.target;
  if (target.matches("button, input, textarea, select, [contenteditable='true']")) return;
  event.preventDefault();
  cycleVariant(event.key === "ArrowLeft" ? -1 : 1);
});

window.addEventListener("popstate", () => {
  prototypeState = readPrototypeState();
  render();
});

render();
