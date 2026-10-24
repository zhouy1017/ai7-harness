import {
  LEARNING_INFLUENCE_RESULT_MARKER,
  LEARNING_INFLUENCE_WITHDRAWN_LABEL,
  type LearningAuditStanding,
  type LearningLineageDecisionProjection,
  type LearningLineageSignalProjection,
  type LearningLineageTaskProjection,
  type LearningLedgerMaterialKind,
  type LearningMaterialKind,
  type LearningRemediationLeftOut,
} from '../shared/protocol.js';
import { learningChoiceLabel } from './quality-learning-labels.js';

/**
 * 质量与学习 › 学习回溯's words (Issue #62, plan slice S27a; V2-UX-LAUD-001 to LAUD-012): the Book-grouped audit list and its
 * filters, the Learning Lineage Explorer in its fixed order, and 停止今后使用's 学习补救影响预览. A material's 学习信号 are the
 * 本社审阅偏好 versions it supports and its 使用过的任务 the 审阅 that read them (Issue #912); nothing in AI7 yet makes a Memory
 * Candidate or memory of learning material, so those stages say they are empty and why, rather than hiding. Pure, so the
 * unit suite pins every one.
 */

export const LEARNING_AUDIT_HEADING = '学习回溯';
/** What the audit is and is not (LAUD-001, LAUD-009, LAUD-012), said once above it. */
export const LEARNING_AUDIT_NOTE =
  '学习回溯只是记录：每条学习材料从哪里来、准入怎样决定、后来影响了什么。停止今后使用不会删除任何历史，这里也不授予任何权限。';
export const LEARNING_AUDIT_FILTERS = {
  query: '搜索',
  book: '图书',
  series: '书系',
  kind: '类型',
  standing: '准入状态',
  from: '起始日期',
  to: '截止日期',
} as const;
export const LEARNING_AUDIT_ALL = '全部';
/**
 * A filter that lists only the first of the house's Books or Series by title (Issue #677). The 图书 filter also offers the
 * Book chosen and every Book a page has named; `others` counts those beyond the first `listed`, so the note and the
 * select always agree.
 */
export function learningAuditChoicesCut(filter: 'book' | 'series', listed: number, others = 0): string {
  return filter === 'book'
    ? `图书筛选只列出按书名排序的前 ${listed} 本图书${others > 0 ? `，另有当前所选或列表里出现的 ${others} 本` : ''}。`
    : `书系筛选只列出按名称排序的前 ${listed} 个书系。`;
}

/** The 书系 filter when the house's Series could not be read: the audit still reads, and the filter offers 全部 alone. */
export const LEARNING_AUDIT_SERIES_UNAVAILABLE = '书系记录无法读取，书系筛选暂时只有「全部」；学习回溯照常可用。';

/** The filters LAUD-002 names that are not offered yet, and why. */
export const LEARNING_AUDIT_FILTERS_LATER =
  '记忆候选、已启用记忆、后续使用和历史影响暂不能筛选；每条材料的编辑记忆状态和实际使用过的任务，在它的来源链里查看。模型自动归纳尚未提供。';
export const LEARNING_AUDIT_EMPTY = '还没有学习材料。你在修改建议、分析结果和审阅里写下的原因与改动，会在这里留下来源链。';
export const LEARNING_AUDIT_NONE_MATCH = '没有符合的学习材料。';
export const LEARNING_AUDIT_OPEN = '查看来源链…';
export const LEARNING_AUDIT_MORE = '更多学习材料…';
export const LEARNING_AUDIT_FIRST = '回到首批学习材料';
export const LEARNING_AUDIT_SEARCH = '查找';

export const LEARNING_AUDIT_KIND_LABELS: Readonly<Record<LearningLedgerMaterialKind, string>> = {
  'proposal-decision': '修改建议',
  'analysis-feedback': '分析反馈',
  'review-disposition': '审阅',
  'readers-report-exemplar': '审稿意见范例',
};

/** Where a material stands, as a pill on its row and a choice of the filter. */
export const LEARNING_AUDIT_STANDING_LABELS: Readonly<Record<LearningAuditStanding, string>> = {
  pending: '待定',
  changed: '改过 · 需要重新决定',
  deferred: '稍后决定',
  book: '仅纳入当前图书',
  house: '纳入出版社经验',
  excluded: '明确排除',
};

/** A row's downstream-use summary (LAUD-001): no Task read it yet. */
export const LEARNING_AUDIT_UNUSED = '尚未被任何任务使用';

/** A row's downstream-use summary (Issue #912): how many Tasks read a 本社审阅偏好 version it supports. */
export function learningAuditUse(tasks: number): string {
  return tasks === 0 ? LEARNING_AUDIT_UNUSED : `被 ${tasks} 个任务使用过`;
}

export function learningAuditBookHeading(book: { readonly title: string; readonly materialCount: number }): string {
  return `《${book.title}》 · ${book.materialCount} 条`;
}

// ---- the Learning Lineage Explorer (LAUD-003 to LAUD-005) ------------------------------------------------------------------

export const LEARNING_LINEAGE_HEADING = '学习来源链';
export const LEARNING_LINEAGE_STEPS = [
  { step: 'material', label: '学习材料' },
  { step: 'decisions', label: '准入决定' },
  { step: 'signals', label: '学习信号' },
  { step: 'candidates', label: '记忆候选' },
  { step: 'memories', label: '已启用记忆' },
  { step: 'tasks', label: '使用过的任务' },
] as const;
/** The forward path's heading (LAUD-004), over the four stages after the decision. */
export const LEARNING_LINEAGE_FORWARD = '后来影响了什么';
export const LEARNING_LINEAGE_NOT_YET = '尚未生成';
export const LEARNING_LINEAGE_TASKS_NONE = '尚未被任何任务使用';
/** What the forward stages are, and why two are empty: said once, so an empty stage never reads as a hidden one. */
export const LEARNING_LINEAGE_WHY_EMPTY =
  '学习信号是这条材料参与生成的本社审阅偏好版本，使用过的任务是实际参考过这些版本的审阅；这条材料目前没有编辑撰写的候选或已启用记忆，并非被隐藏。模型自动归纳尚未提供。';
/**
 * Candidate and active states are independent: an editor's proposed memory is real before explicit acceptance.
 */
export function learningLineageWhy(activeMemories: number, memoryCandidates = 0): string {
  return activeMemories === 0 && memoryCandidates === 0 ? LEARNING_LINEAGE_WHY_EMPTY
    : `学习信号是这条材料参与生成的本社审阅偏好版本，使用过的任务是实际参考过这些版本的审阅；当前有 ${memoryCandidates} 条编辑撰写的候选、${activeMemories} 条已启用记忆。候选须明确接受后使用，来源受限时暂停使用；模型自动归纳尚未提供。`;
}
export function learningLineageMemories(count: number): string {
  return `${count} 条你明确新建的编辑记忆引用了它；停止今后使用后，这些记忆会暂停使用，记录原样保留。`;
}
export const LEARNING_LINEAGE_CURRENT = '现行版本';

/** One 学习信号 (Issue #912): a 本社审阅偏好 version the material supports, when it was made, and how much of it. */
export function learningLineageSignalLine(signal: Pick<LearningLineageSignalProjection, 'ordinal' | 'recordedAt' | 'current' | 'lines'>, instant: (iso: string) => string): string {
  return `本社审阅偏好 v${signal.ordinal} · ${instant(signal.recordedAt)} · 其中 ${signal.lines} 行出自这条材料${signal.current ? ` · ${LEARNING_LINEAGE_CURRENT}` : ''}`;
}

export const LEARNING_LINEAGE_TASK_USE: Readonly<Record<LearningLineageTaskProjection['use'], string>> = {
  running: '正在运行',
  completed: '已完成',
  stopped: '已停下',
};

/** One 使用过的任务 (Issue #912): the 审阅 category, the version it read, where it stands, and its marker. */
export function learningLineageTaskLine(task: Pick<LearningLineageTaskProjection, 'label' | 'versionOrdinal' | 'use' | 'marked'>): string {
  return `${task.label} · 参考 v${task.versionOrdinal} · ${LEARNING_LINEAGE_TASK_USE[task.use]}${task.marked ? ` · 已标上「${LEARNING_INFLUENCE_RESULT_MARKER}」` : ''}`;
}

export function learningLineageEarlierTasks(count: number): string {
  return `更早还有 ${count} 个任务用过它。`;
}
export const LEARNING_LINEAGE_NO_DECISION = '还没有准入决定。';
export const LEARNING_LINEAGE_BACK = '返回学习回溯';
export const LEARNING_LINEAGE_STOP = '停止今后使用…';
export const LEARNING_LINEAGE_REINCLUDE = '重新纳入…';
export const LEARNING_LINEAGE_REINCLUDE_LEGEND = '重新纳入的范围';
/** What re-inclusion does to the history (LAUD-009). */
export const LEARNING_LINEAGE_REINCLUDE_NOTE = '重新纳入会追加一个新的准入决定；之前的排除仍留在记录里，不会被改写。';

export function learningLineageHeading(originLabel: string): string {
  return `${LEARNING_LINEAGE_HEADING}：${originLabel}`;
}

export function learningLineageEarlier(count: number): string {
  return `更早还有 ${count} 个准入决定，仍在记录里。`;
}

/** One decision of the chain: the choice, when, and the note given with it. */
export function learningLineageDecisionLine(entry: Pick<LearningLineageDecisionProjection, 'choice' | 'recordedAt' | 'note'>, instant: (iso: string) => string): string {
  return `${learningChoiceLabel(entry.choice)} · ${instant(entry.recordedAt)}${entry.note === null ? '' : ` · ${entry.note}`}`;
}

/** What the decision is now: the one that stands, or one a later decision superseded — and where it was made. */
export function learningLineageDecisionStatus(entry: Pick<LearningLineageDecisionProjection, 'superseded' | 'currentVersion' | 'via'>): string {
  const parts = [entry.superseded ? '已被后来的决定取代' : '现在的决定'];
  if (!entry.currentVersion) parts.push('针对材料较早的版本');
  if (entry.via === 'learning-audit') parts.push('在学习回溯中停止今后使用');
  return parts.join(' · ');
}

// ---- 停止今后使用 and its 学习补救影响预览 (LAUD-006 to LAUD-011) ---------------------------------------------------------

export const LEARNING_REMEDIATION_HEADING = '学习补救影响预览';
export const LEARNING_REMEDIATION_GROUPS = [
  { group: 'future', label: '未来使用' },
  { group: 'running', label: '正在运行' },
  { group: 'memory', label: '候选或已启用记忆' },
  { group: 'completed', label: '已完成历史' },
] as const;
export const LEARNING_REMEDIATION_CONFIRM = '确认停止今后使用';
export const LEARNING_REMEDIATION_CANCEL = '取消';
export const LEARNING_REMEDIATION_RUNNING = '没有正在运行的任务使用它们。';
export const LEARNING_REMEDIATION_MEMORY = '没有引用这些材料的编辑记忆候选或已启用记忆。';
/** The memory group once explicit editorial memory references the selection (Issue #1082). */
export function learningRemediationMemory(count: number): string {
  return count === 0 ? LEARNING_REMEDIATION_MEMORY
    : `${count} 条编辑撰写的候选或已启用记忆引用了它们：记录后停止后续使用，候选仍须明确接受，记忆和版本历史原样保留；模型自动归纳尚未提供。`;
}

function namedTasks(named: ReadonlyArray<string>, count: number): string {
  const listed = named.join('、');
  return count > named.length ? `${listed}等 ${count} 个` : listed;
}

export function learningRemediationFuture(count: number, scope: 'book' | 'house' | null, bookTitle: string, version: { readonly currentVersion: number | null; readonly linesAffected: number } = { currentVersion: null, linesAffected: 0 }): string {
  if (count === 0 || scope === null) return '所选材料中没有可以停止今后使用的。';
  const was = scope === 'book' ? `仅纳入《${bookTitle}》` : '纳入出版社经验';
  const lines = version.currentVersion === null || version.linesAffected === 0 ? ''
    : `本社审阅偏好 v${version.currentVersion} 中有 ${version.linesAffected} 行出自它们，记录后会生成不含它们的新版本，之后的审阅只读新版本。`;
  return `${count} 条学习材料今后不再可用于学习（原来是${was}）；它们会显示为明确排除。${lines}`;
}

/** 正在运行 (Issue #912; LAUD-008): the Tasks that stop before their next read, and the prepared Runs that cannot be approved. */
export function learningRemediationRunning(groups: { readonly running: number; readonly prepared: number; readonly runningNamed: ReadonlyArray<string> }): string {
  if (groups.running === 0 && groups.prepared === 0) return LEARNING_REMEDIATION_RUNNING;
  const parts: string[] = [];
  if (groups.running > 0) {
    parts.push(`${groups.running} 个已授权或正在运行的审阅任务参考了含有它们的本社审阅偏好版本，会在下一次读取前停下，显示「${LEARNING_INFLUENCE_WITHDRAWN_LABEL}」：${namedTasks(groups.runningNamed, groups.running)}。它们只能「重新执行（不含该影响）」或「取消任务」；已经读到的内容保留，已经发给模型服务的内容无法收回。`);
  }
  if (groups.prepared > 0) parts.push(`${groups.prepared} 个已准备、尚未授权的审阅任务不能再授权，需要重新准备。`);
  return parts.join('');
}

export function learningRemediationCompleted(decisionsKept: number, completed: { readonly completed: number; readonly completedNamed: ReadonlyArray<string> } = { completed: 0, completedNamed: [] }): string {
  const kept = `它们来自的反馈与改动，以及此前的 ${decisionsKept} 个准入决定，都原样保留。`;
  if (completed.completed === 0) return `没有已完成的任务用过它们，因此没有结果需要标记；${kept}`;
  return `${completed.completed} 个已完成的审阅任务参考过它们，会标上「${LEARNING_INFLUENCE_RESULT_MARKER}」：${namedTasks(completed.completedNamed, completed.completed)}。这些结果、发现和报告都不会改写，标记也不表示结果有错；${kept}`;
}

export const LEARNING_REMEDIATION_LEFT_OUT: Readonly<Record<LearningRemediationLeftOut, string>> = {
  changed: '在你选中之后改过',
  'not-included': '现在没有纳入学习',
  'different-scope': '纳入范围与其他所选材料不同',
  'different-kind': '类型与其他所选材料不同',
  duplicate: '重复选择',
  'not-found': '已经不在学习材料之列',
};

/** One material left out of the batch, named with why (LAUD-011): by its row's name, else its origin, else generically. */
export function learningRemediationLeftOutLine(entry: { readonly name: string | null; readonly reason: LearningRemediationLeftOut }): string {
  return `${entry.name ?? '一条学习材料'}：${LEARNING_REMEDIATION_LEFT_OUT[entry.reason]}，不在本次之列`;
}

/** The materials a preview includes, listed by name above its groups (LAUD-010). */
export const LEARNING_REMEDIATION_INCLUDED = '本次停止今后使用：';

/**
 * A material's name where many share an origin (`修改建议 · 拒绝`): its origin, when it was recorded, and its excerpt's last
 * line — often the proposed or edited text, sometimes the editor's reason or judgment — so a checkbox, a button and a
 * left-out line each say which one (J-14, LAUD-011). Two materials can still read alike; `learningAuditMaterialNames` tells
 * them apart on a page.
 */
export function learningAuditMaterialName(
  material: { readonly originLabel: string; readonly recordedAt: string; readonly excerpt: ReadonlyArray<string> },
  instant: (iso: string) => string,
): string {
  const last = material.excerpt.at(-1);
  return `${material.originLabel} · ${instant(material.recordedAt)}${last === undefined ? '' : ` · ${last}`}`;
}

/**
 * Each material's name on one page, by its key (Issue #677): `learningAuditMaterialName`, and where two or more read alike —
 * the same origin, the same minute and the same last line, often the proposed or edited text — each of them followed by its
 * ordinal among them in page order, so no two checkboxes or buttons share a name.
 */
export function learningAuditMaterialNames(
  materials: ReadonlyArray<{ readonly materialKey: string; readonly originLabel: string; readonly recordedAt: string; readonly excerpt: ReadonlyArray<string> }>,
  instant: (iso: string) => string,
): Map<string, string> {
  const bases = materials.map((material) => [material.materialKey, learningAuditMaterialName(material, instant)] as const);
  const totals = new Map<string, number>();
  for (const [, base] of bases) totals.set(base, (totals.get(base) ?? 0) + 1);
  const seen = new Map<string, number>();
  const names = new Map<string, string>();
  for (const [key, base] of bases) {
    if (totals.get(base) === 1) {
      names.set(key, base);
      continue;
    }
    const ordinal = (seen.get(base) ?? 0) + 1;
    seen.set(base, ordinal);
    names.set(key, `${base}（第 ${ordinal} 条）`);
  }
  return names;
}

export function learningRemediationOutcome(recorded: number, leftOut: number): string {
  return `已停止今后使用 ${recorded} 条学习材料${leftOut === 0 ? '' : `；另有 ${leftOut} 条未处理`}。`;
}

// ---- batch selection (LAUD-010, LAUD-011) ---------------------------------------------------------------------------------

export function learningAuditSelectLabel(name: string): string {
  return `选择：${name}`;
}

export function learningAuditOpenLabel(name: string): string {
  return `查看来源链：${name}`;
}

export function learningAuditSelected(count: number): string {
  return `已选 ${count} 条`;
}

export function learningAuditBatchStop(count: number): string {
  return `停止今后使用所选 ${count} 条…`;
}

/** Why the selection cannot go together: one Book, one kind, one scope (LAUD-010). */
export const LEARNING_AUDIT_BATCH_MISMATCH = '所选材料须来自同一本书、同一类型、同一纳入范围，才能一起停止今后使用。';
export const LEARNING_AUDIT_CLEAR_SELECTION = '清除选择';

export const LEARNING_AUDIT_STATUS = {
  loading: '正在读取学习回溯…',
  opened: '学习回溯已打开',
  unavailable: '无法读取学习回溯。',
  lineage: '正在读取学习来源链…',
  lineageOpened: '学习来源链已打开',
  lineageUnavailable: '无法读取学习来源链。',
  previewing: '正在预览停止今后使用的影响…',
  previewFailed: '无法预览停止今后使用的影响。',
  recording: '正在停止今后使用…',
  failed: '无法停止今后使用。',
  reincluding: '正在记录学习准入决定…',
  reincluded: '学习准入决定已记录。',
  reincludeFailed: '无法记录这个决定。',
  invalidDates: '请填写有效日期，截止日期不能早于起始日期。',
} as const;

/**
 * A batch recorded or refused, and the list then not read again: what happened stands, and the page says it may be out of
 * date (Issue #677: a refusal says so too).
 */
export function learningRemediationRereadFailed(outcome: string): string {
  return `${outcome}但学习回溯没能重新读取，列表可能还是之前的状态；请稍后重新打开。`;
}
