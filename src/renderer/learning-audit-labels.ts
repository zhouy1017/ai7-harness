import type {
  LearningAuditStanding,
  LearningLineageDecisionProjection,
  LearningMaterialKind,
  LearningRemediationLeftOut,
} from '../shared/protocol.js';
import { learningChoiceLabel } from './quality-learning-labels.js';

/**
 * 质量与学习 › 学习回溯's words (Issue #62, plan slice S27a; V2-UX-LAUD-001 to LAUD-012): the Book-grouped audit list and its
 * filters, the Learning Lineage Explorer in its fixed order, and 停止今后使用's 学习补救影响预览. Nothing in AI7 yet makes a
 * Learning Signal, Memory Candidate or memory of learning material, or reads it in a Task, so those stages say they are
 * empty and why, rather than hiding. Pure, so the unit suite pins every one.
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
/** The filters LAUD-002 names that have nothing to filter yet, and why. */
/** A filter that lists only the first of the house's Books or Series by title (Issue #677). */
export function learningAuditChoicesCut(filter: 'book' | 'series', listed: number): string {
  return filter === 'book'
    ? `图书筛选只列出按书名排序的前 ${listed} 本图书。`
    : `书系筛选只列出按名称排序的前 ${listed} 个书系。`;
}

export const LEARNING_AUDIT_FILTERS_LATER =
  '记忆候选、已启用记忆、后续使用和历史影响暂不能筛选：AI7 还没有从学习材料生成学习信号或记忆，也没有任务读取学习材料，这几项目前都是空的。';
export const LEARNING_AUDIT_EMPTY = '还没有学习材料。你在修改建议、分析结果和审阅里写下的原因与改动，会在这里留下来源链。';
export const LEARNING_AUDIT_NONE_MATCH = '没有符合的学习材料。';
export const LEARNING_AUDIT_OPEN = '查看来源链…';
export const LEARNING_AUDIT_MORE = '更多学习材料…';
export const LEARNING_AUDIT_FIRST = '回到首批学习材料';
export const LEARNING_AUDIT_SEARCH = '查找';

export const LEARNING_AUDIT_KIND_LABELS: Readonly<Record<LearningMaterialKind, string>> = {
  'proposal-decision': '修改建议',
  'analysis-feedback': '分析反馈',
  'review-disposition': '审阅',
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

/** A row's downstream-use summary (LAUD-001): nothing reads learning material yet. */
export const LEARNING_AUDIT_UNUSED = '尚未被任何任务使用';

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
/** Why the forward stages are empty: said once, so an empty stage never reads as a hidden one. */
export const LEARNING_LINEAGE_WHY_EMPTY =
  'AI7 目前还没有从学习材料生成学习信号、记忆候选或记忆的功能，也没有任务读取学习材料；这几步因此都是空的，并非被隐藏。';
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
export const LEARNING_REMEDIATION_RUNNING = '没有正在运行的任务使用它们：AI7 现在还没有读取学习材料的任务。';
export const LEARNING_REMEDIATION_MEMORY = '没有由它们生成的记忆候选或已启用记忆：AI7 还没有生成这些。';

export function learningRemediationFuture(count: number, scope: 'book' | 'house' | null, bookTitle: string): string {
  if (count === 0 || scope === null) return '所选材料中没有可以停止今后使用的。';
  const was = scope === 'book' ? `仅纳入《${bookTitle}》` : '纳入出版社经验';
  return `${count} 条学习材料今后不再可用于学习（原来是${was}）；它们会显示为明确排除。`;
}

export function learningRemediationCompleted(decisionsKept: number): string {
  return `没有已完成的任务用过它们，因此没有结果需要标记；它们来自的反馈与改动，以及此前的 ${decisionsKept} 个准入决定，都原样保留。`;
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
 * the same origin, the same minute, the same preset reason — each of them followed by its ordinal among them in page order,
 * so no two checkboxes or buttons share a name.
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
