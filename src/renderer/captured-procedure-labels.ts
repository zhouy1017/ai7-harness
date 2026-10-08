import {
  CAPTURED_PROCEDURE_SCOPE_LABELS,
  type CapturedProcedureDocument,
  type CapturedProcedureGuidelineProjection,
  type CapturedProcedureRunProjection,
  type CapturedProcedureScopeSlot,
  type CapturedProcedureStepProjection,
  type CapturedProcedureVersionProjection,
  type DeveloperProposalVersionProjection,
  type ProcedureCaptureResultKind,
  type ReviewCategoryOutputKind,
  type ReviewRunProcedureProjection,
} from '../shared/protocol.js';

/**
 * The words of 可复用工序 and 开发建议 (Issue #65, plan slice S30; ADR 0087; V2-UX-REUSE-001 to 020, 029 to 031, 063 to 066,
 * KB-010; interaction-spec "Reusable procedure classification"; IA "Reusable procedure capture"). Professional purpose
 * first (REUSE-010): no Skill, Workflow or Plugin vocabulary before the editor needs it, and identities only under
 * 查看技术详情. Pure, so the unit suite reads them exactly as the screens do.
 */

export const CAPTURE_ACTION = '将以上工序保存为可复用工序' as const;
export const CAPTURE_TITLE = '保存为可复用工序' as const;
export const CAPTURE_CLOSE_NOTE = '关闭这里不会保存任何东西。' as const;
export const CAPTURE_SOURCE_LEGEND = '工序捕获来源：这次审阅的类别' as const;
export const CAPTURE_ORDER_NOTE = '保留的步骤按审阅配置的顺序运行，不能调换；未完成的类别不会保存。' as const;
export const CAPTURE_SCOPE_LEGEND = '运行时的审阅范围' as const;
export const CAPTURE_SCOPE_NOTE = '选「选定章节」时，章节在每次运行时再选。' as const;
export const CAPTURE_CLASSIFICATION_LEGEND = '保存成什么' as const;
export const CAPTURE_WHY_HEADING = '为什么这样分类' as const;
export const CAPTURE_EXTRACT_HEADING = '将提取什么' as const;
export const CAPTURE_NOT_SAVED_HEADING = '不会保存什么' as const;
export const CAPTURE_TITLE_LABEL = '工序名称（只作标签，不发给模型）' as const;
export const CAPTURE_TARGET_LABEL = '保存为' as const;
export const CAPTURE_NEW_PROCEDURE = '新的可复用工序' as const;
export const CAPTURE_SAVE = '保存为可复用工序' as const;
export const CAPTURE_PICK_STEP = '请至少保留一个步骤。' as const;
export const CAPTURE_PICK_TITLE = '请给这个工序起一个名字。' as const;
export const PROPOSAL_SAVE = '保存开发建议' as const;
export const PROPOSAL_FIELDS = {
  title: '建议的标题',
  missingCapability: '缺少的能力（必填）',
  affectedProcedure: '涉及的工序',
  direction: '建议的实现方向',
  pluginCandidate: '可以评估的插件',
} as const;
export const PROPOSAL_PICK_TITLE = '请写建议的标题。' as const;
export const PROPOSAL_PICK_CAPABILITY = '请写明缺少的能力。' as const;

/** The result types a capture could create (REUSE-003), each with what choosing it means here. */
export const CAPTURE_RESULT_LABELS = {
  'captured-procedure': '可复用工序',
  'developer-proposal': '开发建议',
  'skill-draft': '原生 Skill 草稿',
  'workflow-draft': '工作流定义草稿',
  'default-rule': '默认执行规则',
} as const satisfies Record<ProcedureCaptureResultKind, string>;

export const CAPTURE_RESULT_CONSEQUENCES = {
  'captured-procedure': '保存为第 1 版 · 待验证。在知识库「工序与规则」里验证并启用后，才能在新建审阅里按它运行；它不会自己运行。',
  'developer-proposal': '需要 AI7 新增能力时选它：只记在本机，可以导出为文件交给开发流程；AI7 不会发送它，也不会安装或启用任何插件。',
  'skill-draft': '这一版还不能创建：需要新的指令写法时，先记为开发建议。',
  'workflow-draft': '这一版还不能创建：阶段、关卡与交付物的工作流定义尚未接通。',
  'default-rule': '只用于「快速开始」的分析任务，不能按审阅工序设立。',
} as const satisfies Record<ProcedureCaptureResultKind, string>;

/** REUSE-005 as ADR 0087 §1 amends it: a finished Review Run is work the existing executors already perform. */
export const CAPTURE_WHY = '这次审阅的每一步都是 AI7 已有的审阅类别：保存为可复用工序后，按审阅运行，照常先看计划、再由你开始，不需要新的能力。' as const;

/** 不会保存什么 (REUSE-013, REUSE-015 to REUSE-018; ADR 0087 §1): instance content and authority never enter the asset. */
export const CAPTURE_NOT_SAVED: ReadonlyArray<string> = [
  '稿件文字、书名与这本书的身份、章节与书系',
  '这次审阅的发现、修改建议的内容与你对它们的决定',
  '授权、计划摘要与回执',
  '模型服务、路由与模型',
  '规范文件的条款与版本：每次运行都按当时本社的版本',
  'AI7 内部的运行细节、推理与重试',
];

const OUTPUT_LABELS = { 'change-suggestion': '修改建议', annotation: '批注' } as const satisfies Record<ReviewCategoryOutputKind, string>;

export function captureOutputLabel(output: ReviewCategoryOutputKind): string {
  return OUTPUT_LABELS[output];
}

/** One step in words: what it runs, at which 工序 version, what it yields, and whether it calls a model or a search engine. */
export function captureStepLine(step: Pick<CapturedProcedureStepProjection, 'label' | 'procedureTitle' | 'procedureVersion' | 'output' | 'model' | 'searchEngine'>): string {
  return `${step.label} · ${step.procedureTitle}（第 ${step.procedureVersion} 版） · 输出${OUTPUT_LABELS[step.output]} · ${step.model ? '调用模型' : '不调用模型'} · ${step.searchEngine ? '使用搜索引擎' : '不使用搜索引擎'}`;
}

/** 将提取什么 (REUSE-013, REUSE-014): the purpose, the ordered steps, the one parameter slot, and the ceiling. */
export function captureExtractLines(
  title: string,
  steps: ReadonlyArray<Pick<CapturedProcedureStepProjection, 'label' | 'output' | 'model' | 'searchEngine'>>,
  scope: CapturedProcedureScopeSlot,
): string[] {
  const outputs = Array.from(new Set(steps.map((step) => OUTPUT_LABELS[step.output])));
  return [
    `用途：${title.trim().length === 0 ? '（待起名）' : `《${title.trim()}》`}`,
    `步骤（按顺序）：${steps.length === 0 ? '（未保留）' : steps.map((step) => step.label).join(' → ')}`,
    `参数：审阅范围「${CAPTURED_PROCEDURE_SCOPE_LABELS[scope]}」`,
    `输出：${outputs.length === 0 ? '无' : outputs.join('、')}`,
    `权限上限：只读当前这本书；${steps.some((step) => step.model) ? '会调用模型' : '不调用模型'}；${steps.some((step) => step.searchEngine) ? '会使用搜索引擎' : '不使用搜索引擎'}；不超过这次审阅`,
  ];
}

/** Where a capture came from, said once and kept only on this computer (REUSE-015). */
export function captureSourceLine(runLabel: string, scopeLabel: string): string {
  return `来源：${runLabel}（${scopeLabel}）。来源只记在本机，不进入工序。`;
}

export function captureNextVersionOption(title: string, latestVersion: number): string {
  return `《${title}》的第 ${latestVersion + 1} 版`;
}

export function captureSavedLine(title: string, version: number): string {
  return `已保存《${title}》第 ${version} 版 · 待验证；在知识库「工序与规则」里验证并启用后才能运行。`;
}

export function proposalSavedLine(title: string, version: number): string {
  return `已保存开发建议《${title}》第 ${version} 版；只记在本机，AI7 不会发送它。`;
}

// ---- 知识库 › 工序与规则 --------------------------------------------------------------------------------------

export const PROCEDURES_SECTION_HEADING = '可复用工序' as const;
export const PROCEDURES_SECTION_NOTE = '从完成的审阅保存下来的工序。每一版验证并启用后，才能在一本书的新建审阅里按它运行；它从不自己运行，也不能设为快速开始或后台分析。' as const;
export const PROCEDURES_EMPTY = '还没有可复用工序。在一次完成的审阅里点「将以上工序保存为可复用工序」就能保存。' as const;
export const PROPOSALS_SECTION_HEADING = '开发建议' as const;
export const PROPOSALS_SECTION_NOTE = '需要 AI7 新增能力的做法，只记在本机。可以导出为文件交给开发流程；AI7 不会发送它，也不会安装或启用任何插件。' as const;
export const PROPOSALS_EMPTY = '还没有开发建议。' as const;
export const PROCEDURE_ACTIONS = {
  validate: '验证并启用…',
  confirm: '确认启用',
  cancel: '取消',
  stop: '停用',
  stopAll: '全部停用',
  run: '运行此工序…',
  open: '打开这本书的审阅',
  proposalFile: '导出为文件…',
  proposalRevise: '修改…',
} as const;
export const PROCEDURE_RUN_BOOK_LABEL = '在哪本书里运行' as const;
export const PROCEDURE_RUN_NOTE = '会打开这本书的「新建审阅」，按这个工序选好类别；你看过计划后，再由你开始。' as const;
export const PROCEDURE_STOP_NOTE = '停用后这一版不会再被选用，也不能再启用；按它运行过的审阅仍然记着它。要再用，请从一次新的审阅重新保存。' as const;

export function procedureVersionLine(version: Pick<CapturedProcedureVersionProjection, 'version' | 'stateLabel' | 'steps' | 'scopeSlot'>): string {
  return `第 ${version.version} 版 · ${version.stateLabel} · ${version.steps.length} 步 · 范围「${CAPTURED_PROCEDURE_SCOPE_LABELS[version.scopeSlot]}」`;
}

export function procedureSourceLine(version: Pick<CapturedProcedureVersionProjection, 'source'>): string {
  return `来自《${version.source.bookTitle}》${version.source.runLabel}`;
}

export function procedureRunsLine(version: Pick<CapturedProcedureVersionProjection, 'runCount'>): string {
  return version.runCount === 0 ? '还没有审阅按这一版运行过' : `按这一版运行过 ${version.runCount} 次审阅`;
}

export function procedureRunLinkLine(run: { bookTitle: string; label: string }, at: string): string {
  return `《${run.bookTitle}》${run.label}审阅 · ${at}`;
}

/** A guideline document a run would apply today, against the source Run's (ADR 0087 §3). */
export function procedureGuidelineLine(guideline: CapturedProcedureGuidelineProjection): string {
  const today = `${guideline.title}（${guideline.issuer}）第 ${guideline.version} 版`;
  if (guideline.sourceVersion === null) return `${today} · 来源审阅没有用它`;
  return guideline.sourceVersion === guideline.version ? `${today} · 与来源审阅相同` : `${today} · 来源审阅用的是第 ${guideline.sourceVersion} 版`;
}

/** The ceiling in words (ADR 0087 §4): what a Run prepared from the version may do, and no more. */
export function procedureCeilingLines(ceiling: CapturedProcedureDocument['authorityCeiling']): string[] {
  return [
    '只读当前这本书的稿件；书系、其他书与社级资料都要在任务里另行选择和授权',
    `输出：${ceiling.outputs.map((output) => OUTPUT_LABELS[output]).join('、')}；修改建议只是建议，接受与应用都由你决定`,
    ceiling.model ? '会调用模型，按每次的计划与授权' : '不调用模型',
    ceiling.searchEngine ? '会使用搜索引擎' : '不使用搜索引擎',
  ];
}

export const PROCEDURE_UNAVAILABLE_LINES: ReadonlyArray<string> = [
  '不会自己运行，也不能设为快速开始或后台分析',
  '不能调换步骤顺序，也不能在原版上修改：要改，请从一次新的审阅重新保存',
];

export function procedureValidationResult(passes: boolean): string {
  return passes ? '验证通过：确认后这一版就是「已启用」。' : '验证没有通过：这一版会保持「待验证」，原因会记下来。';
}

export function procedureEnabledLine(title: string, version: number): string {
  return `已启用《${title}》第 ${version} 版；在一本书的新建审阅里可以按它运行。`;
}

export function procedureValidationFailedLine(title: string, version: number): string {
  return `《${title}》第 ${version} 版没有通过验证，仍是「待验证」。`;
}

export function procedureStoppedLine(title: string, versions: number): string {
  return versions === 1 ? `已停用《${title}》的这一版；按它运行过的审阅仍然记着它。` : `已停用《${title}》的全部版本；按它们运行过的审阅仍然记着它们。`;
}

export function proposalVersionLine(version: Pick<DeveloperProposalVersionProjection, 'version' | 'fileCount'>, at: string): string {
  return `第 ${version.version} 版 · 记录于 ${at} · ${version.fileCount === 0 ? '还没有导出' : `导出过 ${version.fileCount} 次`}`;
}

export function proposalFileSavedLine(fileName: string): string {
  return `已导出为文件「${fileName}」；AI7 不会发送它。`;
}

// ---- 新建审阅 and the Run ---------------------------------------------------------------------------------------

export const SHEET_PROCEDURE_LABEL = '按已保存的工序' as const;
export const SHEET_PROCEDURE_NONE = '不按工序（自己选类别）' as const;
export const SHEET_PROCEDURE_NONE_ENABLED = '还没有启用的可复用工序。' as const;

/** What the sheet says once a Captured Procedure filled it (ADR 0087 §4; REUSE-054): the exact version, and what it leaves out. */
export function sheetProcedureLines(run: CapturedProcedureRunProjection): string[] {
  if (run.resolved === null) return [run.unavailableReason ?? ''];
  const resolved = run.resolved;
  const lines = [`按《${run.title}》第 ${resolved.version} 版：${resolved.steps.map((step) => step.label).join(' → ')}；范围「${CAPTURED_PROCEDURE_SCOPE_LABELS[resolved.scopeSlot]}」。类别已按它选好，计划照常先看。`];
  for (const step of resolved.steps) if (!step.available) lines.push(`不运行「${step.label}」：${step.unavailableReason ?? ''}`);
  for (const change of resolved.guidelineChanges) {
    lines.push(change.sourceVersion === null
      ? `「${change.label}」按今天的《${change.title}》第 ${change.version} 版`
      : `「${change.label}」按今天的《${change.title}》第 ${change.version} 版，来源审阅用的是第 ${change.sourceVersion} 版`);
  }
  for (const passed of run.passedOver) lines.push(`没有用第 ${passed.version} 版：${passed.reason}`);
  return lines;
}

/** The pin a Run shows (ADR 0087 §4): never moved by a later version or a 停用. */
export function runProcedureLine(procedure: ReviewRunProcedureProjection): string {
  const note = procedure.missing ? '（本机没有这一版；这次审阅仍记着它）' : procedure.stopped ? '（这一版已停用；这次审阅仍记着它）' : '';
  return `按可复用工序《${procedure.title}》第 ${procedure.version} 版${note}`;
}

export function runProcedureLeftOutLine(entry: ReviewRunProcedureProjection['leftOut'][number]): string {
  return `未运行「${entry.label}」：${entry.reason}`;
}
