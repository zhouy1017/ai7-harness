import type {
  ImportedSkillCeiling, ImportedSkillHistoryEntry, ImportedSkillRevisionProjection, ImportedSkillUpdateCandidateSummary, ImportedSkillUpdateCheckProjection,
  ImportedSkillUpdateDisposition, ImportedSkillUpdateFileChange,
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
export const IMPORTED_SKILL_UPDATE_BOUNDARY = '检查更新只读取你选的本地文件或目录：不联网，不读取任何图书内容，不运行任何内容。保留后只生成一个待你处理的更新，不改动任何现有修订。';
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
