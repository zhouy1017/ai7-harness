import type { ImportedSkillCeiling, ImportedSkillRevisionProjection } from '../shared/protocol.js';

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
