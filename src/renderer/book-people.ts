import {
  MAX_BOOK_AUTHORS,
  MAX_BOOK_EDITORS,
  MAX_BOOK_PERSON_NAME_CHARACTERS,
  MAX_BOOK_RELATED_PEOPLE,
  publicationText,
  type BookPeopleProjection,
  type RendererApi,
} from '../shared/protocol.js';
import {
  BOOK_PEOPLE_ACTION_LABELS,
  BOOK_PEOPLE_BLOCKERS,
  BOOK_PEOPLE_FIELD_LABELS,
  BOOK_PEOPLE_HEADING,
  BOOK_PEOPLE_NAME_LABEL,
  BOOK_PEOPLE_NAMES_HINT,
  BOOK_PEOPLE_NOTE,
  BOOK_PEOPLE_RELATED_NONE,
  BOOK_PEOPLE_ROLE_LABEL,
  BOOK_PEOPLE_STATUS_LINES,
  bookPeopleNamesLine,
  bookPeopleNamesOf,
  bookPeopleRecordedLine,
  bookPeopleRelatedLine,
  type BookPeopleAction,
} from './book-people-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';

/**
 * 人员 on a Book's 工作概览 (Issue #431, plan slice S83; V2-UX-BOOK-006): its 作者, 责编 and 相关人, and `编辑人员…` with
 * the whole set in one form — names typed with 「、」 between them, each 相关人 a role of the house's list and a name.
 * `保存人员` records the Book's next version against the one the editor read; the same set again records nothing.
 */
export interface MountBookPeopleOptions {
  root: HTMLElement;
  bookId: string;
  people: BookPeopleProjection;
  api: Pick<RendererApi, 'updateBookPeople'>;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
}

interface Draft {
  authors: string;
  editors: string;
  related: Array<{ roleId: string; name: string }>;
  problem: string | null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let identities = 0;
function uid(prefix: string): string {
  identities += 1;
  return `book-people-${prefix}-${identities}`;
}

/** A name the service will take: 1–40 characters once NFC-normalized and trimmed, with no separator inside. */
function nameValid(name: string): boolean {
  const read = publicationText(name, MAX_BOOK_PERSON_NAME_CHARACTERS);
  return read !== null && !/[、,，;；\r\n]/u.test(read);
}

function listValid(names: ReadonlyArray<string>, limit: number): boolean {
  return names.length <= limit && names.every(nameValid) && new Set(names.map((name) => name.normalize('NFC'))).size === names.length;
}

export function mountBookPeople(options: MountBookPeopleOptions): { destroy(): void } {
  const { api, bookId } = options;
  let people = options.people;
  let draft: Draft | null = null;
  let working = false;
  let destroyed = false;
  let section: HTMLElement | undefined;

  function actionButton(action: BookPeopleAction, className: string, onClick: () => void): HTMLButtonElement {
    const button = el('button', className, BOOK_PEOPLE_ACTION_LABELS[action]);
    button.type = 'button';
    button.dataset['peopleAction'] = action;
    button.addEventListener('click', onClick);
    return button;
  }

  function blocker(current: Draft): string | null {
    const authors = bookPeopleNamesOf(current.authors);
    const editors = bookPeopleNamesOf(current.editors);
    if (!listValid(authors, MAX_BOOK_AUTHORS) || !listValid(editors, MAX_BOOK_EDITORS)) return BOOK_PEOPLE_BLOCKERS.names;
    if (current.related.length > MAX_BOOK_RELATED_PEOPLE || current.related.some((person) => person.roleId === '' || !nameValid(person.name))) {
      return BOOK_PEOPLE_BLOCKERS.related;
    }
    return null;
  }

  function draw(focus: string | null): void {
    if (destroyed) return;
    const view = el('section', 'source-card book-people');
    view.dataset['peopleVersion'] = String(people.version);
    const heading = el('h3', undefined, BOOK_PEOPLE_HEADING);
    heading.id = uid('heading');
    view.setAttribute('aria-labelledby', heading.id);
    const values = el('dl');
    const value = (field: 'authors' | 'editors' | 'related', text: string): HTMLElement => {
      const dd = el('dd', undefined, text);
      dd.dataset['peopleField'] = field;
      return dd;
    };
    values.append(
      el('dt', undefined, BOOK_PEOPLE_FIELD_LABELS.authors), value('authors', bookPeopleNamesLine(people.authors)),
      el('dt', undefined, BOOK_PEOPLE_FIELD_LABELS.editors), value('editors', bookPeopleNamesLine(people.editors)),
      el('dt', undefined, BOOK_PEOPLE_FIELD_LABELS.related), value('related', bookPeopleRelatedLine(people.related)),
    );
    view.append(
      heading,
      values,
      el('p', 'field-note book-people-recorded', bookPeopleRecordedLine(people, people.recordedAt === null ? null : localInstantLabel(people.recordedAt))),
      el('p', 'field-note book-people-note', BOOK_PEOPLE_NOTE),
    );
    if (draft === null) {
      const row = el('div', 'button-row compact-actions');
      const edit = actionButton('edit', 'secondary', () => openForm());
      edit.disabled = working;
      row.append(edit);
      view.append(row);
    } else {
      view.append(renderForm(draft));
    }
    if (section?.isConnected === true) section.replaceWith(view);
    else options.root.replaceChildren(view);
    section = view;
    if (focus !== null) view.querySelector<HTMLElement>(focus)?.focus();
  }

  function renderForm(current: Draft): HTMLElement {
    const form = el('form', 'book-people-form');
    form.noValidate = true;
    form.addEventListener('submit', (event) => event.preventDefault());
    const hint = el('small', 'field-note', BOOK_PEOPLE_NAMES_HINT);
    hint.id = uid('names-hint');
    const field = (key: 'authors' | 'editors'): HTMLElement => {
      const label = el('label', 'book-people-field');
      const input = el('input');
      input.type = 'text';
      input.value = current[key];
      input.disabled = working;
      input.dataset['peopleField'] = key;
      input.setAttribute('aria-describedby', hint.id);
      input.addEventListener('input', () => { current[key] = input.value; current.problem = null; sync(); });
      label.append(el('span', undefined, BOOK_PEOPLE_FIELD_LABELS[key]), input);
      return label;
    };
    form.append(field('authors'), field('editors'), hint);
    const related = el('fieldset', 'book-people-related');
    related.append(el('legend', undefined, BOOK_PEOPLE_FIELD_LABELS.related));
    if (current.related.length === 0) related.append(el('p', 'field-note', BOOK_PEOPLE_RELATED_NONE));
    current.related.forEach((person, index) => {
      const row = el('div', 'book-people-related-row');
      row.dataset['relatedIndex'] = String(index);
      const roleLabel = el('label');
      const select = el('select');
      select.dataset['peopleField'] = 'related-role';
      select.disabled = working;
      const placeholder = el('option', undefined, '选择角色');
      placeholder.value = '';
      select.append(placeholder);
      for (const role of people.roles) {
        const option = el('option', undefined, role.label);
        option.value = role.roleId;
        select.append(option);
      }
      select.value = person.roleId;
      select.addEventListener('change', () => { person.roleId = select.value; current.problem = null; sync(); });
      roleLabel.append(el('span', undefined, BOOK_PEOPLE_ROLE_LABEL), select);
      const nameLabel = el('label');
      const name = el('input');
      name.type = 'text';
      name.value = person.name;
      name.disabled = working;
      name.dataset['peopleField'] = 'related-name';
      name.addEventListener('input', () => { person.name = name.value; current.problem = null; sync(); });
      nameLabel.append(el('span', undefined, BOOK_PEOPLE_NAME_LABEL), name);
      const remove = actionButton('removeRelated', 'quiet', () => {
        if (working || draft !== current) return;
        current.related.splice(index, 1);
        draw(`[data-people-action="addRelated"]`);
      });
      remove.disabled = working;
      row.append(roleLabel, nameLabel, remove);
      related.append(row);
    });
    const add = actionButton('addRelated', 'secondary', () => {
      if (working || draft !== current || current.related.length >= MAX_BOOK_RELATED_PEOPLE) return;
      current.related.push({ roleId: '', name: '' });
      draw(`.book-people-related-row[data-related-index="${current.related.length - 1}"] select`);
    });
    add.disabled = working || current.related.length >= MAX_BOOK_RELATED_PEOPLE;
    related.append(add);
    form.append(related);
    if (current.problem !== null) {
      const alert = el('p', 'export-problem', current.problem);
      alert.setAttribute('role', 'alert');
      form.append(alert);
    }
    const row = el('div', 'button-row');
    const save = actionButton('save', 'primary', () => void saveDraft());
    const why = el('p', 'field-note book-people-reason');
    why.id = uid('reason');
    save.setAttribute('aria-describedby', why.id);
    const cancel = actionButton('cancel', 'quiet', () => closeForm());
    cancel.disabled = working;
    row.append(save, cancel, why);
    form.append(row);
    form.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || working) return;
      event.preventDefault();
      closeForm();
    });
    function sync(): void {
      const reason = blocker(current);
      why.textContent = reason ?? '';
      why.hidden = reason === null;
      save.disabled = working || reason !== null;
    }
    sync();
    return form;
  }

  function openForm(): void {
    if (working || destroyed) return;
    draft = {
      authors: people.authors.join('、'),
      editors: people.editors.join('、'),
      related: people.related.map((person) => ({ roleId: person.roleId, name: person.name })),
      problem: null,
    };
    // The values stay listed above the form under the same field names, so the focus names the input.
    draw('input[data-people-field="authors"]');
  }

  function closeForm(): void {
    if (working || draft === null) return;
    draft = null;
    draw('[data-people-action="edit"]');
  }

  async function saveDraft(): Promise<void> {
    const current = draft;
    if (destroyed || working || current === null || blocker(current) !== null) return;
    working = true;
    current.problem = null;
    draw(null);
    options.setStatus(BOOK_PEOPLE_STATUS_LINES.saving, 'busy');
    try {
      const result = await api.updateBookPeople({
        bookId,
        expectedVersion: people.version,
        authors: bookPeopleNamesOf(current.authors),
        editors: bookPeopleNamesOf(current.editors),
        related: current.related.map((person) => ({ roleId: person.roleId, name: person.name.trim() })),
      });
      if (destroyed) return;
      working = false;
      if (result.bookId !== bookId) throw new Error(BOOK_PEOPLE_STATUS_LINES.saveFailed);
      people = result.people;
      draft = null;
      draw('[data-people-action="edit"]');
      options.setStatus(result.completionLabel, 'success');
    } catch (error) {
      working = false;
      if (destroyed) return;
      current.problem = options.errorMessage(error, BOOK_PEOPLE_STATUS_LINES.saveFailed);
      draw('[data-people-action="save"]');
      options.setStatus(current.problem, 'error');
    }
  }

  draw(null);
  return {
    destroy() {
      destroyed = true;
    },
  };
}
