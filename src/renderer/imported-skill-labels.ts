import type {
  ImportedSkillAcquisitionProjection, ImportedSkillCeiling, ImportedSkillHistoryEntry, ImportedSkillRevisionProjection, ImportedSkillUpdateCandidateProjection, ImportedSkillUpdateCandidateSummary,
  ImportedSkillUpdateCheckProjection, ImportedSkillUpdateDisposition, ImportedSkillUpdateFileChange,
} from '../shared/protocol.js';

export const IMPORTED_SKILLS_HEADING = '外部 Skill';
export const IMPORTED_SKILLS_NO_EXECUTOR = '外部 Skill 在此版本没有执行器，不参与工序推荐。';
export const IMPORTED_SKILL_NO_AUTHORITY = '安装或启用不会发起任务，也不授予稿件访问、模型调用、凭据、联网、外部操作、后台分析或应用修改的权限。';
export function importedSkillIdentityLine(skill: Pick<ImportedSkillRevisionProjection, 'name' | 'sourceRevision' | 'ordinal' | 'stateLabel'>): string {
  return `${skill.name} · DSH Skill · 来源 ${skill.sourceRevision} · 本地修订 ${skill.ordinal} · ${skill.stateLabel}`;
}
export function importedSkillCeilingLines(ceiling: ImportedSkillCeiling): string[] {
  return [
    `请求的能力：${ceiling.requestedCapabilities.length === 0 ? '未声明' : ceiling.requestedCapabilities.join('；')}`,
    '此版本不提供执行器；Run 可读范围：无；模型服务：无；外部操作：无',
    '凭据：无；联网：无；后台分析：无；应用修改：无',
    IMPORTED_SKILL_NO_AUTHORITY,
  ];
}

// 外部 Skill 的更新 (Issue #89; ADR 0090 §3): a local file, an inert candidate, an explicit adoption.
export const IMPORTED_SKILL_UPDATE_CHECK_LABEL = '检查更新（从文件）…';
export const IMPORTED_SKILL_UPDATE_CHECK_DIRECTORY_LABEL = '从目录检查更新…';
export const IMPORTED_SKILL_UPDATE_BOUNDARY = '检查更新只读取你选的本地文件或目录：不联网，不读取任何图书内容，不运行任何内容。保留后生成更新候选；只有你亲自采纳，或此 Skill 的自动采纳规则接受无冲突、校验通过、未扩权的更新，才生成新修订，不会安装或启用。';
export const IMPORTED_SKILL_UPDATE_NOT_ENABLED = '采纳只生成一个待验证的新修订，不会安装或启用；启用仍要另行逐本图书确认。';
export const IMPORTED_SKILL_UPDATE_NONE = '还没有检查过更新。';
export function importedSkillUpdateRelationLine(relation: ImportedSkillUpdateCheckProjection['relation']): string {
  return relation === 'newer' ? '这是一个新的版本：保留后生成一个更新，待你处理。'
    : relation === 'same-as-current' ? '这就是此 Skill 保留的来源版本，没有新的更新。'
      : '这个版本已经在此 Skill 的版本历史里；请用「回到此版本」，不会再生成更新。';
}
export const IMPORTED_SKILL_UPDATE_DISPOSITION_LABELS: Readonly<Record<ImportedSkillUpdateDisposition, string>> = {
  clean: '无冲突、校验通过、未扩权',
  conflict: '有文件冲突，需要你逐项决定',
  'validator-failed': '没有通过校验',
  'authority-change': '要求了更多的脚本、资源或声明',
};
export const IMPORTED_SKILL_UPDATE_FILE_LABELS: Readonly<Record<ImportedSkillUpdateFileChange, string>> = {
  unchanged: '未变化', upstream: '上游已更改', local: '本地已更改', conflict: '两边都改了（冲突）',
};
export function importedSkillUpdateStatusLine(candidate: Pick<ImportedSkillUpdateCandidateSummary, 'status' | 'stale' | 'adoptedBy'>): string {
  return candidate.status === 'adopted' ? `已采纳（${candidate.adoptedBy === 'rule' ? '由更新规则自动采纳' : '你亲自采纳'}）`
    : candidate.status === 'dismissed' ? '已忽略' : candidate.stale ? '待处理，但这个 Skill 已换了修订，需重新检查更新' : '待处理';
}
export function importedSkillUpdateCandidateLine(candidate: ImportedSkillUpdateCandidateSummary): string {
  return `${candidate.incomingName} · 来源 ${candidate.incomingSourceRevision} · ${IMPORTED_SKILL_UPDATE_DISPOSITION_LABELS[candidate.disposition]} · ${importedSkillUpdateStatusLine(candidate)}`;
}
export const IMPORTED_SKILL_UPDATE_ACCEPT_LABEL = '我已逐项查看并接受以上事项';
export const IMPORTED_SKILL_UPDATE_UPSTREAM_LABEL = '以上游为准';
export const IMPORTED_SKILL_UPDATE_CONFLICT_NOTE = '冲突的文件默认保留你本地的版本；勾选「以上游为准」才改用上游的。不会自动合并。';

export const IMPORTED_SKILL_RULE_HEADING = '自动采纳规则';
export const IMPORTED_SKILL_RULE_SCOPE = '这条规则只管这一个外部 Skill。它只自动采纳无冲突、校验通过、未扩权的更新，其余仍回到你面前；它不会安装或启用任何东西。';
export const IMPORTED_SKILL_RULE_CREATE_LABEL = '创建自动采纳规则';
export const IMPORTED_SKILL_RULE_REVOKE_LABEL = '撤销';
export function importedSkillRuleActiveLine(since: string | null): string {
  return `规则已生效${since === null ? '' : `（自 ${since.slice(0, 16).replace('T', ' ')} 起）`}：无冲突、校验通过、未扩权的更新会自动采纳；撤销后恢复逐项审阅。`;
}
export const IMPORTED_SKILL_RULE_INACTIVE = '没有生效的规则：每个更新都由你逐项审阅。';

export const IMPORTED_SKILL_HISTORY_HEADING = '修订历史';
export const IMPORTED_SKILL_HISTORY_NOT_RESTORED = '回到此版本只把它设为当前修订；不改写历史，也不恢复它之前的启用，需要时请重新启用。';
export function importedSkillHistoryLine(entry: ImportedSkillHistoryEntry): string {
  const origin = entry.origin === 'rule' ? '由更新规则采纳' : entry.origin === 'adopt' ? '由你采纳' : '导入';
  return `本地修订 ${entry.ordinal} · 来源 ${entry.sourceRevision} · ${entry.stateLabel} · ${origin}${entry.current ? ' · 当前' : ''}`;
}

// The update card's own words: actions, headings, the status line each act answers, and the sentences built from a candidate.
export const IMPORTED_SKILL_UPDATE_HEADING = '检查更新';
export const IMPORTED_SKILL_UPDATE_ACTIONS = {
  keep: '保留此更新', discard: '不保留', open: '查看更新', adopt: '采纳', dismiss: '忽略', close: '关闭', inspectRevision: '查看此修订', rollback: '回到此版本',
} as const;
export const IMPORTED_SKILL_UPDATE_HEADINGS = {
  files: '所选文件', conversion: '转换报告', threeWay: '三方对照', perFile: '逐个文件', validation: '校验', authority: '新增的要求', conflicts: '冲突',
} as const;
export function importedSkillDisclosureLines(read: ImportedSkillAcquisitionProjection): string[] {
  return [
    `声明文件：${read.notices.join('、') || '未提供'}`,
    ...([['preserved', '保留'], ['mapped', '确定性映射'], ['reviewRequired', '需要审查'], ['unsupported', '不支持']] as const)
      .map(([key, label]) => `${label}：${read.conversion[key].join('；') || '无'}`),
  ];
}
export function importedSkillUpdateValidatorLine(state: ImportedSkillUpdateCandidateProjection['validator']['state']): string {
  return `校验结果：${state === 'validated' ? '通过' : state === 'restricted' ? '受限' : '未通过'}`;
}
export const IMPORTED_SKILL_UPDATE_STATUS = {
  disclosed: '已读取所选更新，尚未保留',
  keptOpen: '已保留更新，等你处理；没有改动任何现有修订',
  keptAdopted: '已保留更新，并由更新规则采纳为新修订（尚未验证、未启用）',
  discarded: '已放弃所选更新，没有保留任何内容',
  adopted: '已采纳为新的待验证修订；没有安装或启用',
  dismissed: '已忽略这个更新；记录仍然保留',
  ruleCreated: '已创建自动采纳规则',
  ruleRevoked: '已撤销自动采纳规则；记录仍然保留',
  rolledBack: '已回到所选修订；没有恢复它之前的启用',
} as const;
export const IMPORTED_SKILL_NOT_CURRENT_NOTE = '这不是当前修订：先在修订历史里「回到此版本」，才能继续验证、安装或启用。';
export const IMPORTED_SKILL_REPAIR_NOTE = '这一修订保持可查看。修复后请用「检查更新（从文件）…」；若原包未声明 Skill 名称，请在原目录修复后重新导入。旧记录不改写。';
export function importedSkillUpdateSourceLines(read: ImportedSkillAcquisitionProjection): string[] {
  return [`来源：${read.sourcePath}`, `许可：${read.license ?? '未提供'}`, `内容 SHA-256 ${read.contentSha256}`];
}
export function importedSkillUpdateSourceFileLine(file: ImportedSkillAcquisitionProjection['files'][number]): string {
  return `${file.path} · ${file.bytes} 字节 · SHA-256 ${file.sha256}`;
}
export function importedSkillUpdateCheckTitle(read: ImportedSkillUpdateCheckProjection): string {
  return `${read.acquisition.name} · ${read.acquisition.kind} · 来源 ${read.acquisition.sourceRevision} · 尚未保留`;
}
export function importedSkillThreeWayLines(read: ImportedSkillUpdateCandidateProjection): string[] {
  return [
    `之前的来源快照：来源 ${read.prior.sourceRevision} · SHA-256 ${read.prior.sha256}`,
    `当前工作修订：本地修订 ${read.working.ordinal} · SHA-256 ${read.working.sha256}`,
    `新的来源快照：来源 ${read.incomingSourceRevision} · SHA-256 ${read.incoming.sha256}`,
  ];
}
export function importedSkillUpdateFileLine(path: string, change: ImportedSkillUpdateFileChange): string {
  return `${path} · ${IMPORTED_SKILL_UPDATE_FILE_LABELS[change]}`;
}
export function importedSkillUpdateDispositionLine(disposition: ImportedSkillUpdateDisposition): string {
  return `结论：${IMPORTED_SKILL_UPDATE_DISPOSITION_LABELS[disposition]}`;
}
export function importedSkillRuleConfirmLine(confirmation: string): string {
  return ` 我确认：${confirmation}`;
}
