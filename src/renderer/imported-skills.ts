import type {
  BookSummaryCursor, BookSummaryProjection, ImportedSkillAcquisitionProjection, ImportedSkillRevisionProjection, ImportedSkillsProjection,
  ImportedSkillUpdateCandidateProjection, ImportedSkillUpdateCheckProjection, RendererApi,
} from '../shared/protocol.js';
import {
  importedSkillCeilingLines, importedSkillHistoryLine, importedSkillIdentityLine, importedSkillRuleActiveLine, importedSkillUpdateCandidateLine,
  importedSkillUpdateRelationLine, importedSkillUpdateStatusLine, IMPORTED_SKILLS_HEADING, IMPORTED_SKILLS_NO_EXECUTOR, IMPORTED_SKILL_HISTORY_HEADING,
  IMPORTED_SKILL_HISTORY_NOT_RESTORED, IMPORTED_SKILL_RULE_CREATE_LABEL, IMPORTED_SKILL_RULE_HEADING, IMPORTED_SKILL_RULE_INACTIVE,
  IMPORTED_SKILL_RULE_REVOKE_LABEL, IMPORTED_SKILL_RULE_SCOPE, IMPORTED_SKILL_UPDATE_ACCEPT_LABEL, IMPORTED_SKILL_UPDATE_BOUNDARY,
  IMPORTED_SKILL_UPDATE_CHECK_DIRECTORY_LABEL, IMPORTED_SKILL_UPDATE_CHECK_LABEL, IMPORTED_SKILL_UPDATE_CONFLICT_NOTE,
  IMPORTED_SKILL_UPDATE_DISPOSITION_LABELS, IMPORTED_SKILL_UPDATE_FILE_LABELS, IMPORTED_SKILL_UPDATE_NONE, IMPORTED_SKILL_UPDATE_NOT_ENABLED,
  IMPORTED_SKILL_UPDATE_UPSTREAM_LABEL,
} from './imported-skill-labels.js';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node;
}
interface Options {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'importSkillPackage' | 'inspectImportedSkills' | 'validateImportedSkill' | 'installImportedSkill' | 'enableImportedSkill' | 'listBooks'
    | 'checkImportedSkillUpdate' | 'inspectImportedSkillUpdate' | 'adoptImportedSkillUpdate' | 'dismissImportedSkillUpdate' | 'createImportedSkillUpdateRule'
    | 'revokeImportedSkillUpdateRule' | 'rollbackImportedSkill'>;
  setStatus(text: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
}
/**
 * ADR 0090: what was picked is disclosed before anything is kept; kept files and conversion are inspectable before separate
 * installation and scoped enablement. An update (Issue #89) is read from a local file the same way, kept as an inert candidate,
 * and adopted only by the editor's own reviewed act (or, for a clean one, the Skill's own rule).
 */
export function mountImportedSkills({ root, api, setStatus, errorMessage }: Options): { load(): Promise<void> } {
  let projection: ImportedSkillsProjection = { skills: [], revision: null, nextBefore: null, history: [], candidates: [], rule: null };
  let acquisition: ImportedSkillAcquisitionProjection | null = null;
  let updateCheck: ImportedSkillUpdateCheckProjection | null = null;
  let candidate: ImportedSkillUpdateCandidateProjection | null = null;
  let upstream = new Set<string>();
  let accepted = false;
  let ruleConfirmed = false;
  let busy = false;
  let books: BookSummaryProjection[] = [];
  let booksAfter: BookSummaryCursor | null = null;
  let selectedBook = '';
  const button = (text: string, action: string, run: () => Promise<string | null | void>): HTMLButtonElement => {
    const node = el('button', text); node.type = 'button'; node.className = 'quiet'; node.dataset['skillAction'] = action;
    node.disabled = busy; node.addEventListener('click', () => void act(run)); return node;
  };
  /** `run` answers the status line to show, or `null` when nothing changed (a cancelled picker, a page read). */
  async function act(run: () => Promise<string | null | void>): Promise<void> {
    if (busy) return;
    busy = true; render();
    try { const done = await run(); if (typeof done === 'string') setStatus(done); }
    catch (error) { setStatus(errorMessage(error, '无法处理这个 Skill。'), 'error'); }
    finally {
      busy = false;
      if (root.isConnected) { render(); root.querySelector<HTMLElement>('[data-skill-acquisition] h4, [data-skill-update-check] h4, [data-skill-candidate] h4, [data-skill-detail] h4')?.focus(); }
    }
  }
  async function inspect(revisionId: string | null, before: string | null = null): Promise<void> {
    const next = await api.inspectImportedSkills({ revisionId, before });
    if (!root.isConnected) return;
    projection = next;
    // What was open about another Skill's update does not follow the editor to this one.
    if (candidate !== null && next.revision !== null && candidate.skillId !== next.revision.skillId) { candidate = null; updateCheck = null; }
  }
  async function changed(revision: ImportedSkillRevisionProjection): Promise<string> {
    await inspect(revision.revisionId);
    return '外部 Skill 记录已更新';
  }
  async function disclose(kind: 'zip' | 'directory'): Promise<string | null> {
    const read = await api.importSkillPackage({ kind });
    if (read === null || !root.isConnected) return null;
    acquisition = read.acquisition;
    return '已读取所选 Skill，尚未保留';
  }
  async function readBooks(more = false): Promise<void> {
    const page = await api.listBooks({ after: more ? booksAfter : null });
    books = more ? [...books, ...page.items] : [...page.items]; booksAfter = page.nextCursor;
  }
  async function openCandidate(candidateId: string): Promise<null> {
    candidate = await api.inspectImportedSkillUpdate({ candidateId });
    upstream = new Set(); accepted = false;
    return null;
  }
  /** REUSE-021 for an update: the same disclosure as an import, against the Skill it would update, before anything is kept. */
  function updateCheckPanel(read: ImportedSkillUpdateCheckProjection): HTMLElement {
    const panel = el('article'); panel.className = 'imported-skill-detail'; panel.dataset['skillUpdateCheck'] = read.acquisition.acquisitionId;
    const disclosed = read.acquisition;
    const title = el('h4', `${disclosed.name} · ${disclosed.kind} · 来源 ${disclosed.sourceRevision} · 尚未保留`); title.tabIndex = -1;
    panel.append(title, el('p', importedSkillUpdateRelationLine(read.relation)), el('p', `来源：${disclosed.sourcePath}`), el('p', `许可：${disclosed.license ?? '未提供'}`),
      el('p', `内容 SHA-256 ${disclosed.contentSha256}`));
    const files = el('ul');
    for (const file of disclosed.files) files.append(el('li', `${file.path} · ${file.bytes} 字节 · SHA-256 ${file.sha256}`));
    panel.append(el('h5', '所选文件'), files);
    for (const problem of disclosed.problems) panel.append(el('p', problem));
    for (const line of importedSkillCeilingLines(disclosed.ceiling)) panel.append(el('p', line));
    const keep = button('保留此更新', 'keep-update', async () => {
      const kept = await api.checkImportedSkillUpdate({ skillId: read.skillId, keep: disclosed.acquisitionId });
      updateCheck = null;
      if (kept?.candidate == null || !root.isConnected) return null;
      candidate = kept.candidate; upstream = new Set(); accepted = false;
      await inspect(kept.candidate.adoptedRevisionId ?? projection.revision?.revisionId ?? null);
      return kept.candidate.status === 'adopted' ? '已保留更新，并由更新规则采纳为新修订（尚未验证、未启用）' : '已保留更新，等你处理；没有改动任何现有修订';
    });
    keep.disabled ||= read.relation !== 'newer' || !disclosed.keepable;
    panel.append(keep, button('不保留', 'discard-update', async () => { updateCheck = null; return '已放弃所选更新，没有保留任何内容'; }));
    return panel;
  }
  /** The three-way reconciliation of one candidate, its findings, and the editor's choices (REUSE-033). */
  function candidatePanel(read: ImportedSkillUpdateCandidateProjection, revision: ImportedSkillRevisionProjection): HTMLElement {
    const panel = el('article'); panel.className = 'imported-skill-detail'; panel.dataset['skillCandidate'] = read.candidateId;
    panel.dataset['skillDisposition'] = read.disposition; panel.dataset['skillCandidateStatus'] = read.status;
    const title = el('h4', importedSkillUpdateCandidateLine(read)); title.tabIndex = -1;
    panel.append(title);
    const summary = el('ul'); summary.className = 'imported-skill-three-way';
    summary.append(el('li', `之前的来源快照：来源 ${read.prior.sourceRevision} · SHA-256 ${read.prior.sha256}`),
      el('li', `当前工作修订：本地修订 ${read.working.ordinal} · SHA-256 ${read.working.sha256}`),
      el('li', `新的来源快照：来源 ${read.incomingSourceRevision} · SHA-256 ${read.incoming.sha256}`));
    panel.append(el('h5', '三方对照'), summary);
    const files = el('ul'); files.className = 'imported-skill-update-files';
    for (const file of read.files) {
      const item = el('li'); item.dataset['skillFile'] = file.path; item.dataset['skillFileChange'] = file.change;
      item.append(el('span', `${file.path} · ${IMPORTED_SKILL_UPDATE_FILE_LABELS[file.change]}`));
      if (file.change === 'conflict' && read.status === 'open' && !read.stale) {
        const label = el('label'); const box = el('input'); box.type = 'checkbox'; box.dataset['skillField'] = 'upstream'; box.dataset['skillPath'] = file.path;
        box.checked = upstream.has(file.path); box.disabled = busy;
        box.addEventListener('change', () => { if (box.checked) upstream.add(file.path); else upstream.delete(file.path); });
        label.append(box, document.createTextNode(` ${IMPORTED_SKILL_UPDATE_UPSTREAM_LABEL}`)); item.append(label);
      }
      files.append(item);
    }
    panel.append(el('h5', '逐个文件'), files);
    const disposition = el('p', `结论：${IMPORTED_SKILL_UPDATE_DISPOSITION_LABELS[read.disposition]}`); disposition.dataset['skillDispositionLine'] = read.disposition;
    panel.append(disposition);
    for (const [heading, lines] of [['校验', read.validator.state === 'validated' ? [] : read.validator.reasons], ['新增的要求', read.authorityChanges], ['冲突', read.conflicts]] as const) {
      if (lines.length === 0) continue;
      const list = el('ul'); for (const line of lines) list.append(el('li', line));
      panel.append(el('h5', heading), list);
    }
    if (read.conflicts.length > 0) panel.append(el('p', IMPORTED_SKILL_UPDATE_CONFLICT_NOTE));
    panel.append(el('p', importedSkillUpdateStatusLine(read)), el('p', IMPORTED_SKILL_UPDATE_NOT_ENABLED));
    if (read.status === 'open' && !read.stale) {
      let confirm: HTMLInputElement | null = null;
      if (read.acceptItems.length > 0) {
        const label = el('label'); confirm = el('input'); confirm.type = 'checkbox'; confirm.dataset['skillField'] = 'accept'; confirm.checked = accepted; confirm.disabled = busy;
        confirm.addEventListener('change', () => { accepted = confirm!.checked; render(); });
        label.append(confirm, document.createTextNode(` ${IMPORTED_SKILL_UPDATE_ACCEPT_LABEL}`)); panel.append(label);
      }
      const adopt = button('采纳', 'adopt', async () => {
        const next = await api.adoptImportedSkillUpdate({
          candidateId: read.candidateId, reviewDigest: read.reviewDigest, acceptItems: read.acceptItems, upstreamPaths: read.conflicts.filter((path) => upstream.has(path)),
        });
        candidate = next; upstream = new Set(); accepted = false;
        if (next.adoptedRevisionId !== null) await inspect(next.adoptedRevisionId);
        return '已采纳为新的待验证修订；没有安装或启用';
      });
      adopt.disabled ||= read.acceptItems.length > 0 && !accepted;
      panel.append(adopt, button('忽略', 'dismiss', async () => { candidate = await api.dismissImportedSkillUpdate({ candidateId: read.candidateId }); await inspect(revision.revisionId); return '已忽略这个更新；记录仍然保留'; }));
    }
    panel.append(button('关闭', 'close-candidate', async () => { candidate = null; return null; }));
    return panel;
  }
  /** REUSE-034: one revocable rule per Skill, created with its confirmation line. */
  function rulePanel(revision: ImportedSkillRevisionProjection): HTMLElement {
    const rule = projection.rule;
    const section = el('section'); section.dataset['skillRule'] = rule?.active === true ? 'active' : 'inactive';
    section.append(el('h5', IMPORTED_SKILL_RULE_HEADING), el('p', IMPORTED_SKILL_RULE_SCOPE));
    if (rule === null) return section;
    if (rule.active) {
      section.append(el('p', importedSkillRuleActiveLine(rule.since)),
        button(IMPORTED_SKILL_RULE_REVOKE_LABEL, 'rule-revoke', async () => { await api.revokeImportedSkillUpdateRule({ skillId: revision.skillId }); await inspect(revision.revisionId); return '已撤销自动采纳规则；记录仍然保留'; }));
      return section;
    }
    section.append(el('p', IMPORTED_SKILL_RULE_INACTIVE));
    const label = el('label'); const box = el('input'); box.type = 'checkbox'; box.dataset['skillField'] = 'rule-confirm'; box.checked = ruleConfirmed; box.disabled = busy;
    box.addEventListener('change', () => { ruleConfirmed = box.checked; render(); });
    label.append(box, document.createTextNode(` 我确认：${rule.confirmation}`)); section.append(label);
    const create = button(IMPORTED_SKILL_RULE_CREATE_LABEL, 'rule-create', async () => {
      await api.createImportedSkillUpdateRule({ skillId: revision.skillId, confirmation: rule.confirmation });
      ruleConfirmed = false; await inspect(revision.revisionId); return '已创建自动采纳规则';
    });
    create.disabled ||= !ruleConfirmed;
    section.append(create);
    return section;
  }
  /** REUSE-035: the revisions of the Skill, the current one marked, and a way back to any earlier one. */
  function historyPanel(revision: ImportedSkillRevisionProjection): HTMLElement {
    const section = el('section'); section.append(el('h5', IMPORTED_SKILL_HISTORY_HEADING));
    const list = el('ul'); list.className = 'imported-skill-history';
    for (const entry of projection.history) {
      const item = el('li'); item.dataset['skillRevision'] = entry.revisionId; item.dataset['skillCurrent'] = String(entry.current);
      item.append(el('span', importedSkillHistoryLine(entry)));
      if (entry.revisionId !== revision.revisionId) item.append(button('查看此修订', 'inspect-revision', () => inspect(entry.revisionId)));
      if (!entry.current) {
        item.append(button('回到此版本', 'rollback', async () => { const back = await api.rollbackImportedSkill({ skillId: revision.skillId, revisionId: entry.revisionId }); await inspect(back.revisionId); return '已回到所选修订；没有恢复它之前的启用'; }));
      }
      list.append(item);
    }
    section.append(list, el('p', IMPORTED_SKILL_HISTORY_NOT_RESTORED));
    return section;
  }
  /** REUSE-021: identity, kind, source revision, provenance, license and notices, digest and conversion — before keeping. */
  function acquisitionPanel(read: ImportedSkillAcquisitionProjection): HTMLElement {
    const panel = el('article'); panel.className = 'imported-skill-detail'; panel.dataset['skillAcquisition'] = read.acquisitionId;
    const title = el('h4', `${read.name} · ${read.kind} · 来源 ${read.sourceRevision} · 尚未保留`); title.tabIndex = -1;
    panel.append(title, el('p', `来源：${read.sourcePath}`), el('p', `许可：${read.license ?? '未提供'}`),
      el('p', `声明文件：${read.notices.join('、') || '未提供'}`), el('p', `内容 SHA-256 ${read.contentSha256}`));
    const files = el('ul');
    for (const file of read.files) files.append(el('li', `${file.path} · ${file.bytes} 字节 · SHA-256 ${file.sha256}`));
    panel.append(el('h5', '所选文件'), files, el('h5', '转换报告'));
    for (const [key, label] of [['preserved', '保留'], ['mapped', '确定性映射'], ['reviewRequired', '需要审查'], ['unsupported', '不支持']] as const) {
      panel.append(el('p', `${label}：${read.conversion[key].join('；') || '无'}`));
    }
    for (const line of importedSkillCeilingLines(read.ceiling)) panel.append(el('p', line));
    for (const problem of read.problems) panel.append(el('p', problem));
    panel.append(el('p', read.keptRevisionId !== null ? '这些内容已经保留过；再次保留不会新增记录。'
      : read.keepable ? '读取不运行任何内容。保留后才会存为不可更改的来源快照与待验证的工作修订；之后仍要另行验证、安装与启用。'
        : '所选内容里没有 SKILL.md，不是 Skill 包，不能保留。'));
    const keep = button('保留此 Skill', 'keep', async () => {
      const kept = await api.importSkillPackage({ keep: read.acquisitionId });
      acquisition = null;
      return kept?.revision == null ? null : changed(kept.revision);
    });
    keep.disabled ||= !read.keepable;
    panel.append(keep, button('不保留', 'discard', async () => { acquisition = null; return '已放弃所选 Skill，没有保留任何内容'; }));
    return panel;
  }
  function render(): void {
    const heading = el('h3', IMPORTED_SKILLS_HEADING);
    const importButton = button('导入 Skill…', 'import', () => disclose('zip'));
    const directoryButton = button('从目录导入 Skill…', 'import-directory', () => disclose('directory'));
    const list = el('ul'); list.className = 'imported-skill-list';
    for (const skill of projection.skills) {
      const item = el('li'); item.dataset['skillId'] = skill.skillId;
      item.dataset['skillState'] = skill.state;
      item.append(el('span', importedSkillIdentityLine(skill)), button('查看修订', 'inspect', () => inspect(skill.revisionId)));
      list.append(item);
    }
    root.replaceChildren(heading, el('p', IMPORTED_SKILLS_NO_EXECUTOR), importButton, directoryButton, list);
    if (projection.skills.length === 0) root.append(el('p', '尚未导入外部 Skill。'));
    if (projection.nextBefore !== null) root.append(button('更多 Skill', 'more', () => inspect(null, projection.nextBefore)));
    if (acquisition !== null) root.append(acquisitionPanel(acquisition));
    if (projection.revision === null) return;
    const revision = projection.revision;
    const detail = el('article'); detail.className = 'imported-skill-detail'; detail.dataset['skillDetail'] = revision.revisionId;
    detail.dataset['skillState'] = revision.state; detail.dataset['skillOwner'] = revision.skillId;
    const isCurrent = projection.history.some((entry) => entry.current && entry.revisionId === revision.revisionId);
    detail.dataset['skillCurrent'] = String(isCurrent);
    const title = el('h4', importedSkillIdentityLine(revision)); title.tabIndex = -1;
    detail.append(title, el('p', `来源：${revision.sourcePath}`), el('p', `许可：${revision.license ?? '未提供'}`), el('p', `声明文件：${revision.notices.join('、') || '未提供'}`));
    const identities = el('details'); identities.append(el('summary', '查看技术详情'));
    identities.append(el('p', `来源快照：${revision.snapshotId} · SHA-256 ${revision.snapshotSha256}`), el('p', `工作修订：${revision.revisionId} · SHA-256 ${revision.workingSha256}`));
    detail.append(identities);
    const conversion = el('section'); conversion.append(el('h5', '转换报告'));
    for (const [key, label] of [['preserved', '保留'], ['mapped', '确定性映射'], ['reviewRequired', '需要审查'], ['unsupported', '不支持']] as const) {
      const list = el('ul');
      for (const line of revision.conversion[key]) list.append(el('li', line));
      conversion.append(el('h6', label), revision.conversion[key].length === 0 ? el('p', '无') : list);
    }
    detail.append(conversion);
    // Text is assigned only with textContent: imported Markdown/HTML and script members never become active UI.
    const files = el('details'); files.append(el('summary', '来源快照与工作修订文件'));
    for (const [label, records] of [['来源快照', revision.files], ['工作修订', revision.workingFiles]] as const) {
      files.append(el('h5', label));
      for (const file of records) {
        const member = el('details'); member.append(el('summary', `${file.path} · ${file.bytes} 字节 · SHA-256 ${file.sha256}`));
        const bytes = Uint8Array.from(atob(file.base64), (value) => value.charCodeAt(0));
        member.append(el('pre', new TextDecoder().decode(bytes))); files.append(member);
      }
    }
    detail.append(files, el('h5', 'AI7 权限上限'));
    for (const line of importedSkillCeilingLines(revision.ceiling)) detail.append(el('p', line));
    for (const reason of revision.reasons) detail.append(el('p', reason));
    if (revision.previousRevisionId !== null) detail.append(button('查看上一修订', 'previous', () => inspect(revision.previousRevisionId)));
    if (!isCurrent) detail.append(el('p', '这不是当前修订：先在修订历史里「回到此版本」，才能继续验证、安装或启用。'));
    if (isCurrent && revision.state === 'pending-validation') detail.append(button('验证 Skill', 'validate', async () => changed(await api.validateImportedSkill({ revisionId: revision.revisionId }))));
    if (isCurrent && revision.state === 'validated') detail.append(button('安装（暂不启用）', 'install', async () => changed(await api.installImportedSkill({ revisionId: revision.revisionId, previewDigest: revision.previewDigest }))));
    if (revision.state === 'restricted' || revision.state === 'rejected') detail.append(el('p', '这一修订保持可查看。请在原目录修复后重新导入，生成后继修订；旧记录不改写。'));
    if (isCurrent && (revision.state === 'installed-disabled' || revision.state === 'enabled')) {
      const label = el('label', '为图书启用：');
      const select = el('select'); select.dataset['skillField'] = 'book'; select.disabled = busy;
      select.append(new Option('请选择图书', ''));
      for (const book of books) select.append(new Option(book.title, book.bookId));
      select.value = selectedBook;
      select.addEventListener('change', () => { selectedBook = select.value; render(); });
      label.append(select); detail.append(label);
      if (books.length === 0 || booksAfter !== null) detail.append(button(books.length === 0 ? '选择图书…' : '更多图书', 'books', () => readBooks(books.length > 0)));
      const enable = button('启用', 'enable', async () => changed(await api.enableImportedSkill({ revisionId: revision.revisionId, bookId: selectedBook, previewDigest: revision.previewDigest })));
      enable.disabled ||= selectedBook === '' || revision.enabledBooks.includes(selectedBook);
      detail.append(enable, el('p', `已为 ${revision.enabledBooks.length} 本图书启用；仍不运行任何内容。`));
    }
    root.append(detail);
    // 外部 Skill 的更新 (Issue #89): the check, its candidates, the rule, and the way back.
    const updates = el('section'); updates.dataset['skillUpdates'] = revision.skillId;
    updates.append(el('h5', '检查更新'), el('p', IMPORTED_SKILL_UPDATE_BOUNDARY),
      button(IMPORTED_SKILL_UPDATE_CHECK_LABEL, 'check-update', async () => {
        const read = await api.checkImportedSkillUpdate({ skillId: revision.skillId, kind: 'zip' });
        if (read === null || !root.isConnected) return null;
        updateCheck = read;
        return '已读取所选更新，尚未保留';
      }),
      button(IMPORTED_SKILL_UPDATE_CHECK_DIRECTORY_LABEL, 'check-update-directory', async () => {
        const read = await api.checkImportedSkillUpdate({ skillId: revision.skillId, kind: 'directory' });
        if (read === null || !root.isConnected) return null;
        updateCheck = read;
        return '已读取所选更新，尚未保留';
      }));
    if (projection.candidates.length === 0) updates.append(el('p', IMPORTED_SKILL_UPDATE_NONE));
    const candidates = el('ul'); candidates.className = 'imported-skill-candidates';
    for (const summary of projection.candidates) {
      const item = el('li'); item.dataset['skillCandidateId'] = summary.candidateId; item.dataset['skillDisposition'] = summary.disposition; item.dataset['skillCandidateStatus'] = summary.status;
      item.append(el('span', importedSkillUpdateCandidateLine(summary)), button('查看更新', 'open-candidate', () => openCandidate(summary.candidateId)));
      candidates.append(item);
    }
    updates.append(candidates);
    if (updateCheck !== null && updateCheck.skillId === revision.skillId) updates.append(updateCheckPanel(updateCheck));
    if (candidate !== null && candidate.skillId === revision.skillId) updates.append(candidatePanel(candidate, revision));
    updates.append(rulePanel(revision), historyPanel(revision));
    root.append(updates);
  }
  return { async load() { await inspect(null); if (root.isConnected) render(); } };
}
