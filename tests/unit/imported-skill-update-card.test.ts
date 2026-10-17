import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ImportedSkillAcquisitionProjection, ImportedSkillHistoryEntry, ImportedSkillRevisionProjection, ImportedSkillsProjection, ImportedSkillUpdateCandidateProjection,
  ImportedSkillUpdateCheckProjection, ImportedSkillUpdateRuleProjection, RendererApi,
} from '../../src/shared/protocol.js';
import { mountImportedSkills } from '../../src/renderer/imported-skills.js';
import {
  IMPORTED_SKILL_RULE_CREATE_LABEL, IMPORTED_SKILL_UPDATE_CHECK_LABEL, IMPORTED_SKILL_UPDATE_DISPOSITION_LABELS, importedSkillHistoryLine,
} from '../../src/renderer/imported-skill-labels.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

// Unit (L1) suite for the foreign Skill update card (Issue #89; ADR 0090 §3) on a minimal DOM: what 检查更新 discloses before keeping,
// the candidate's three-way report and per-file 以上游为准 choices, an adoption of a candidate that is not clean waiting for the
// editor's confirmation, the rule waiting for its confirmation line, and 回到此版本 offered on every revision but the current one.

const SKILL = randomUUID();
const [FIRST, SECOND] = [randomUUID(), randomUUID()];
const CANDIDATE = randomUUID();
const CONFIRMATION = '自动采纳无冲突、校验通过、未扩权的更新';
const CEILING = { requestedCapabilities: [], executor: false, runSourceScope: 'none', provider: false, effect: false, credentials: false, network: false, backgroundAnalysis: false, apply: false } as const;
const REPORT = { preserved: ['SKILL.md'], mapped: [], reviewRequired: [], unsupported: [] };
const file = { path: 'SKILL.md', bytes: 4, sha256: 'a'.repeat(64), base64: Buffer.from('文本').toString('base64') };

function revision(revisionId: string, ordinal: number, state: ImportedSkillRevisionProjection['state'] = 'pending-validation'): ImportedSkillRevisionProjection {
  return {
    skillId: SKILL, revisionId, ordinal, name: 'synthetic-style-review', sourceRevision: `1.${ordinal}.0`, kind: 'DSH Skill', state, stateLabel: state === 'pending-validation' ? '待验证' : '已启用',
    snapshotId: randomUUID(), previousRevisionId: ordinal === 1 ? null : FIRST, sourcePath: '/synthetic/skill', snapshotSha256: 'b'.repeat(64), workingSha256: 'c'.repeat(64),
    files: [file], workingFiles: [file], license: null, notices: [], conversion: REPORT, reasons: [], enabledBooks: [], ceiling: CEILING, previewDigest: 'd'.repeat(64), createdAt: '2026-10-17T00:00:00.000Z',
  };
}
const history = (current: string): ImportedSkillHistoryEntry[] => [[SECOND, 2], [FIRST, 1]].map(([revisionId, ordinal]) => ({
  revisionId: revisionId as string, ordinal: ordinal as number, state: 'pending-validation', stateLabel: '待验证', sourceRevision: `1.${ordinal}.0`, previousRevisionId: ordinal === 1 ? null : FIRST,
  createdAt: '2026-10-17T00:00:00.000Z', current: revisionId === current, origin: ordinal === 1 ? 'import' : 'adopt', selectedReason: revisionId === current ? 'adopt' : null,
}));
function candidate(disposition: ImportedSkillUpdateCandidateProjection['disposition'], over: Partial<ImportedSkillUpdateCandidateProjection> = {}): ImportedSkillUpdateCandidateProjection {
  const conflict = disposition === 'conflict';
  return {
    candidateId: CANDIDATE, skillId: SKILL, disposition, status: 'open', stale: false, adoptedBy: null, adoptedRevisionId: null, incomingName: 'synthetic-style-review', incomingSourceRevision: '1.9.0',
    createdAt: '2026-10-17T00:00:00.000Z', prior: { snapshotId: randomUUID(), sha256: 'e'.repeat(64), sourceRevision: '1.0.0' }, working: { revisionId: SECOND, ordinal: 2, sha256: 'f'.repeat(64) },
    incoming: { snapshotId: randomUUID(), sha256: '9'.repeat(64), sourcePath: '/synthetic/v9' },
    files: [{ path: 'SKILL.md', change: conflict ? 'conflict' : 'upstream', priorSha256: 'a'.repeat(64), workingSha256: conflict ? 'b'.repeat(64) : 'a'.repeat(64), incomingSha256: 'c'.repeat(64) },
      { path: 'resources/note.md', change: 'unchanged', priorSha256: null, workingSha256: null, incomingSha256: null }],
    validator: { state: 'validated', reasons: [] }, authorityChanges: disposition === 'authority-change' ? ['新增资源类别：scripts/'] : [], conflicts: conflict ? ['SKILL.md'] : [],
    acceptItems: disposition === 'clean' ? [] : conflict ? ['文件冲突：SKILL.md'] : ['新增资源类别：scripts/'], reviewDigest: '8'.repeat(64), ...over,
  };
}
const rule = (active: boolean): ImportedSkillUpdateRuleProjection => ({ active, ruleId: active ? randomUUID() : null, confirmation: CONFIRMATION, since: active ? '2026-10-17T08:30:00.000Z' : null, history: active ? [{ action: 'create', recordedAt: '2026-10-17T08:30:00.000Z' }] : [] });

let uninstall: () => void;
let root: MiniElement;
beforeEach(() => { uninstall = installMiniDom(); root = miniDocument.createElement('section'); miniDocument.body.append(root); });
afterEach(() => { uninstall(); });

const flush = async (): Promise<void> => { for (let index = 0; index < 8; index += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };
const text = (selector: string): string => root.querySelector(selector)?.textContent ?? '';
const button = (action: string, within = ''): MiniElement | null => root.querySelector(`${within} [data-skill-action="${action}"]`.trim());
async function click(action: string, within = ''): Promise<void> {
  const target = button(action, within);
  expect(target, `button ${action}`).not.toBeNull();
  target!.click();
  await flush();
}
async function mount(page: Partial<ImportedSkillsProjection>, api: Record<string, unknown> = {}) {
  const current = revision(SECOND, 2);
  const projection: ImportedSkillsProjection = {
    skills: [{ skillId: SKILL, revisionId: SECOND, ordinal: 2, name: current.name, sourceRevision: current.sourceRevision, kind: 'DSH Skill', state: current.state, stateLabel: current.stateLabel }],
    nextBefore: null, revision: current, history: history(SECOND), candidates: [], rule: rule(false), ...page,
  };
  const calls: Array<[string, unknown]> = [];
  const wrapped = new Proxy({
    inspectImportedSkills: async () => projection, listBooks: async () => ({ items: [], nextCursor: null }), ...api,
  } as Record<string, unknown>, { get: (target, key: string) => typeof target[key] === 'function' ? async (input: unknown) => { calls.push([key, input]); return (target[key] as (value: unknown) => unknown)(input); } : target[key] });
  const statuses: string[] = [];
  const mounted = mountImportedSkills({ root: root as unknown as HTMLElement, api: wrapped as unknown as RendererApi, setStatus: (value) => { statuses.push(value); }, errorMessage: (error, fallback) => error instanceof Error ? error.message : fallback });
  await mounted.load();
  root.querySelector('.imported-skill-list li')!.querySelector('[data-skill-action="inspect"]')!.click();
  await flush();
  return { calls, statuses };
}

describe('the foreign Skill card: history and the way back (REUSE-035)', () => {
  it('marks the current revision, offers 回到此版本 on every other one, and says what it does not restore', async () => {
    const { calls } = await mount({});
    expect(root.querySelector('[data-skill-detail]')?.dataset['skillCurrent']).toBe('true');
    expect(root.querySelectorAll('[data-skill-revision]').map((item) => [item.dataset['skillRevision'], item.dataset['skillCurrent']])).toEqual([[SECOND, 'true'], [FIRST, 'false']]);
    expect(text(`[data-skill-revision="${SECOND}"]`)).toContain(importedSkillHistoryLine(history(SECOND)[0]!));
    expect(text(`[data-skill-revision="${SECOND}"]`)).toContain('当前');
    expect(button('rollback', `[data-skill-revision="${SECOND}"]`)).toBeNull();
    expect(text('[data-skill-updates]')).toContain('不改写历史，也不恢复它之前的启用');
    await click('rollback', `[data-skill-revision="${FIRST}"]`);
    // (a rollback answers a revision the service returns; this fake has none, so only the call is asserted)
    expect(calls.map(([name]) => name)).toContain('inspectImportedSkills');
  });

  it('calls the rollback with the Skill and the revision chosen, then reads that revision', async () => {
    const rollback = vi.fn(async (input: { skillId: string; revisionId: string }) => revision(input.revisionId, 1));
    const { calls } = await mount({}, { rollbackImportedSkill: rollback });
    await click('rollback', `[data-skill-revision="${FIRST}"]`);
    expect(rollback).toHaveBeenCalledWith({ skillId: SKILL, revisionId: FIRST });
    expect(calls.at(-1)).toEqual(['inspectImportedSkills', { revisionId: FIRST, before: null }]);
  });

  it('offers validation, installation and enablement on the current revision only', async () => {
    await mount({ revision: revision(FIRST, 1), history: history(SECOND) });
    expect(root.querySelector('[data-skill-detail]')?.dataset['skillCurrent']).toBe('false');
    expect(button('validate')).toBeNull();
    expect(text('[data-skill-detail]')).toContain('这不是当前修订');
  });
});

describe('the foreign Skill card: checking an update from a file (REUSE-032)', () => {
  const disclosure = (relation: ImportedSkillUpdateCheckProjection['relation']): ImportedSkillUpdateCheckProjection => ({
    skillId: SKILL, relation, candidate: null,
    acquisition: {
      acquisitionId: randomUUID(), name: 'synthetic-style-review', sourceRevision: '1.9.0', kind: 'DSH Skill', sourcePath: '/synthetic/v9', contentSha256: '7'.repeat(64), license: 'MIT', notices: [],
      files: [{ path: 'SKILL.md', bytes: 4, sha256: 'a'.repeat(64) }], conversion: REPORT, ceiling: CEILING, problems: [], keepable: true, keptRevisionId: null,
    } satisfies ImportedSkillAcquisitionProjection,
  });

  it('discloses the package against the Skill before keeping, and keeps it only on the editor\'s act', async () => {
    const read = disclosure('newer');
    const check = vi.fn(async (input: { skillId: string; kind?: string; keep?: string }) => 'keep' in input ? { ...read, candidate: candidate('clean') } : read);
    await mount({}, { checkImportedSkillUpdate: check });
    expect(button('check-update')?.textContent).toBe(IMPORTED_SKILL_UPDATE_CHECK_LABEL);
    expect(text('[data-skill-updates]')).toContain('不联网，不读取任何图书内容，不运行任何内容');
    await click('check-update');
    expect(check).toHaveBeenCalledWith({ skillId: SKILL, kind: 'zip' });
    const panel = text('[data-skill-update-check]');
    expect(panel).toContain('尚未保留');
    expect(panel).toContain('这是一个新的版本');
    expect(panel).toContain('内容 SHA-256 ' + '7'.repeat(64));
    expect(check).toHaveBeenCalledTimes(1);
    await click('keep-update');
    expect(check).toHaveBeenLastCalledWith({ skillId: SKILL, keep: read.acquisition.acquisitionId });
    expect(root.querySelector('[data-skill-update-check]')).toBeNull();
    expect(root.querySelector('[data-skill-candidate]')?.dataset['skillDisposition']).toBe('clean');
  });

  it.each(['same-as-current', 'already-kept'] as const)('shows %s and does not offer to keep it', async (relation) => {
    await mount({}, { checkImportedSkillUpdate: async () => disclosure(relation) });
    await click('check-update-directory');
    expect(button('keep-update')?.disabled).toBe(true);
    expect(text('[data-skill-update-check]')).not.toContain('这是一个新的版本');
  });

  it('does nothing when the picker is cancelled', async () => {
    await mount({}, { checkImportedSkillUpdate: async () => null });
    await click('check-update');
    expect(root.querySelector('[data-skill-update-check]')).toBeNull();
  });
});

describe('the foreign Skill card: a candidate and its adoption (REUSE-033)', () => {
  const summary = (read: ImportedSkillUpdateCandidateProjection) => ({
    candidateId: read.candidateId, skillId: read.skillId, disposition: read.disposition, status: read.status, stale: read.stale, adoptedBy: read.adoptedBy, adoptedRevisionId: read.adoptedRevisionId,
    incomingName: read.incomingName, incomingSourceRevision: read.incomingSourceRevision, createdAt: read.createdAt,
  });

  it('adopts a clean candidate in one act, with nothing to name back, and says the revision is neither installed nor enabled', async () => {
    const clean = candidate('clean');
    const adopted = candidate('clean', { status: 'adopted', adoptedBy: 'editor', adoptedRevisionId: randomUUID() });
    const adopt = vi.fn(async () => adopted);
    await mount({ candidates: [summary(clean)] }, { inspectImportedSkillUpdate: async () => clean, adoptImportedSkillUpdate: adopt });
    await click('open-candidate');
    expect(text('[data-skill-candidate]')).toContain('三方对照');
    expect(text('[data-skill-candidate]')).toContain('不会安装或启用');
    expect(root.querySelector('[data-skill-field="accept"]')).toBeNull();
    expect(button('adopt')?.disabled).toBe(false);
    await click('adopt');
    expect(adopt).toHaveBeenCalledWith({ candidateId: CANDIDATE, reviewDigest: '8'.repeat(64), acceptItems: [], upstreamPaths: [] });
  });

  it('lists each file with its change and waits for the editor to confirm a candidate that is not clean before 采纳', async () => {
    const risky = candidate('authority-change');
    const adopt = vi.fn(async () => ({ ...risky, status: 'adopted' as const, adoptedBy: 'editor' as const, adoptedRevisionId: randomUUID() }));
    await mount({ candidates: [summary(risky)] }, { inspectImportedSkillUpdate: async () => risky, adoptImportedSkillUpdate: adopt });
    await click('open-candidate');
    expect(text('[data-skill-candidate]')).toContain(IMPORTED_SKILL_UPDATE_DISPOSITION_LABELS['authority-change']);
    expect(text('[data-skill-candidate]')).toContain('新增资源类别：scripts/');
    expect(root.querySelectorAll('[data-skill-file]').map((item) => [item.dataset['skillFile'], item.dataset['skillFileChange']])).toEqual([['SKILL.md', 'upstream'], ['resources/note.md', 'unchanged']]);
    expect(button('adopt')?.disabled).toBe(true);
    root.querySelector('[data-skill-field="accept"]')!.checked = true;
    root.querySelector('[data-skill-field="accept"]')!.dispatchEvent({ type: 'change', bubbles: true });
    await flush();
    expect(button('adopt')?.disabled).toBe(false);
    await click('adopt');
    expect(adopt).toHaveBeenCalledWith({ candidateId: CANDIDATE, reviewDigest: '8'.repeat(64), acceptItems: ['新增资源类别：scripts/'], upstreamPaths: [] });
  });

  it('keeps the local derivation of a conflicting file unless 以上游为准 is ticked for that file', async () => {
    const conflict = candidate('conflict');
    const adopt = vi.fn(async () => ({ ...conflict, status: 'adopted' as const, adoptedBy: 'editor' as const, adoptedRevisionId: randomUUID() }));
    await mount({ candidates: [summary(conflict)] }, { inspectImportedSkillUpdate: async () => conflict, adoptImportedSkillUpdate: adopt });
    await click('open-candidate');
    expect(text('[data-skill-candidate]')).toContain('冲突的文件默认保留你本地的版本');
    const tick = (name: string): void => {
      const box = root.querySelector(`[data-skill-field="${name}"]`)!;
      box.checked = !box.checked;
      box.dispatchEvent({ type: 'change', bubbles: true });
    };
    tick('accept');
    await flush();
    await click('adopt');
    expect(adopt).toHaveBeenLastCalledWith(expect.objectContaining({ acceptItems: ['文件冲突：SKILL.md'], upstreamPaths: [] }));
    await click('open-candidate');
    tick('upstream');
    tick('accept');
    await flush();
    await click('adopt');
    expect(adopt).toHaveBeenLastCalledWith(expect.objectContaining({ acceptItems: ['文件冲突：SKILL.md'], upstreamPaths: ['SKILL.md'] }));
  });

  it('offers neither adoption nor a choice on a stale, adopted or dismissed candidate, and dismisses with a record kept', async () => {
    const stale = candidate('clean', { stale: true });
    const dismiss = vi.fn(async () => candidate('clean', { status: 'dismissed' }));
    await mount({ candidates: [summary(stale)] }, { inspectImportedSkillUpdate: async () => stale, dismissImportedSkillUpdate: dismiss });
    await click('open-candidate');
    expect(button('adopt')).toBeNull();
    expect(text('[data-skill-candidate]')).toContain('需重新检查更新');
    const open = candidate('clean');
    await mount({ candidates: [summary(open)] }, { inspectImportedSkillUpdate: async () => open, dismissImportedSkillUpdate: dismiss });
    await click('open-candidate');
    await click('dismiss');
    expect(dismiss).toHaveBeenCalledWith({ candidateId: CANDIDATE });
  });
});

describe('the foreign Skill card: the Artifact Update Rule (REUSE-034)', () => {
  it('waits for the confirmation line before creating the rule, and revokes it with 撤销', async () => {
    const create = vi.fn(async () => rule(true));
    const revoke = vi.fn(async () => rule(false));
    await mount({ rule: rule(false) }, { createImportedSkillUpdateRule: create, revokeImportedSkillUpdateRule: revoke });
    expect(root.querySelector('[data-skill-rule]')?.dataset['skillRule']).toBe('inactive');
    expect(button('rule-create')?.textContent).toBe(IMPORTED_SKILL_RULE_CREATE_LABEL);
    expect(button('rule-create')?.disabled).toBe(true);
    expect(text('[data-skill-rule]')).toContain(`我确认：${CONFIRMATION}`);
    expect(text('[data-skill-rule]')).toContain('不会安装或启用任何东西');
    root.querySelector('[data-skill-field="rule-confirm"]')!.checked = true;
    root.querySelector('[data-skill-field="rule-confirm"]')!.dispatchEvent({ type: 'change', bubbles: true });
    await flush();
    await click('rule-create');
    expect(create).toHaveBeenCalledWith({ skillId: SKILL, confirmation: CONFIRMATION });
    await mount({ rule: rule(true) }, { createImportedSkillUpdateRule: create, revokeImportedSkillUpdateRule: revoke });
    expect(root.querySelector('[data-skill-rule]')?.dataset['skillRule']).toBe('active');
    expect(button('rule-create')).toBeNull();
    await click('rule-revoke');
    expect(revoke).toHaveBeenCalledWith({ skillId: SKILL });
  });
});
