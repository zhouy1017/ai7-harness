import { windowStep } from './components/controls.js';
import { graphemesOf } from '../shared/mark-anchor.js';
import {
  MAX_DIALOGUE_QUESTION_CHARACTERS,
  type AgentWorkspaceProjection,
  type AgentWorkspacePromotionProjection,
  type AgentWorkspaceProposalProjection,
  type DialogueSelectionInput,
  type ManuscriptWindowProjection,
  type RendererApi,
} from '../shared/protocol.js';
import { AGENT_WORKSPACE_WORDS } from './agent-workspace-labels.js';

/**
 * The Book-bound Agent 工作区 screen (Issue #90, wave 13 slice 13a; UI ADR 0015; V2-UX-AGENT-001 to 004): the central slot of
 * the AI7 shell, for the current Book only, with the exact Book name, the visible safety state the capability declaration
 * states and a 返回 to where the editor came from. Entering reads and writes nothing of the Book.
 *
 * Pick words in one or more paragraphs of the primary manuscript, write a 修改要求, and 提出变更集 — one structured
 * turn the service sends. The answer is listed here as proposals anchored on exact words, not marks. 提交为修改建议 makes
 * them 修改建议 the editor decides on the existing Mark Cards; 放弃这组提议 forgets them. The screen has no apply, export or
 * send of its own.
 */
export type AgentWorkspaceApi = Pick<RendererApi,
  'inspectAgentWorkspace' | 'proposeAgentWorkspaceChangeSet' | 'promoteAgentWorkspaceProposals' | 'discardAgentWorkspaceProposals' |
  'getBookOverview' | 'getManuscriptWindow' | 'getManuscriptWindowAt'>;

export interface MountAgentWorkspaceOptions {
  readonly root: HTMLElement;
  readonly bookId: string;
  readonly bookTitle: string;
  readonly api: AgentWorkspaceApi;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  /** 返回: back to the work the editor left for the workspace. */
  back(): void;
  /** The manuscript with the first 修改建议 the promotion made open on its card. */
  openMarks(promotion: AgentWorkspacePromotionProjection): void;
}

/** How often a round still being answered is read again. */
const PROPOSING_POLL_MS = 300;
const readingPlaces = new Map<string, { blockId: string; entryBlockId: string | null; selection: DialogueSelectionInput | null; instruction: string }>();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (tag === 'button') node.className = `${node.className} btn`.trim();
  return node;
}

function actionButton(label: string, action: string, tone: 'primary' | 'secondary' | 'quiet', run: () => void): HTMLButtonElement {
  const node = el('button', tone, label);
  node.type = 'button';
  node.dataset['agentWorkspaceAction'] = action;
  node.addEventListener('click', run);
  return node;
}

/** The exact paragraph range or contiguous span the editor selected. */
function selectionIn(page: ManuscriptWindowProjection, blockId: string, from: number, to: number, endBlockId = blockId): DialogueSelectionInput | null {
  const block = page.blocks.find((entry) => entry.blockId === blockId);
  if (block === undefined || page.blocks.length === 0) return null;
  const parts = graphemesOf(block.text);
  const start = page.blocks.indexOf(block);
  const end = page.blocks.findIndex((entry) => entry.blockId === endBlockId);
  if (end < start || from < 0 || from >= parts.length) return null;
  const blocks = page.blocks.slice(start, end + 1);
  const last = blocks.at(-1)!;
  if (to < 0 || to > graphemesOf(last.text).length || (start === end && to <= from)) return null;
  const span = blocks.map((entry, index) => ({ blockId: entry.blockId, blockDigest: entry.digest,
    fromGrapheme: index === 0 ? from : 0, toGrapheme: index === blocks.length - 1 ? to : graphemesOf(entry.text).length }));
  return {
    manuscriptId: page.manuscriptId,
    branchId: page.branchId,
    windowStartBlockId: page.blocks[0]!.blockId,
    baseRevisionId: page.revisionId,
    expectedJournalSequence: page.journalSequence,
    blockId,
    baseBlockDigest: block.digest,
    fromGrapheme: from,
    toGrapheme: span[0]!.toGrapheme,
    selectedText: blocks.map((entry, index) => graphemesOf(entry.text).slice(span[index]!.fromGrapheme, span[index]!.toGrapheme).join('')).join('\n'),
    ...(blocks.length === 1 ? {} : { span }),
  };
}

export function mountAgentWorkspace(options: MountAgentWorkspaceOptions): { destroy(): void } {
  const { root, api, bookId } = options;
  const words = AGENT_WORKSPACE_WORDS;
  let destroyed = false;
  let busy = false;
  let poll: number | undefined;
  let workspace: AgentWorkspaceProjection | null = null;
  let page: ManuscriptWindowProjection | null = null;
  let selection: DialogueSelectionInput | null = null;
  let promoted: AgentWorkspacePromotionProjection | null = null;
  // The round this surface asked for, made 修改建议 by itself once ready (Issue #1431 item 34).
  let autoPromote: string | null = null;
  const remembered = readingPlaces.get(bookId);
  let entryBlockId: string | null = null;

  root.classList.add('agent-workspace');
  root.dataset['bookId'] = bookId;
  root.dataset['agentWorkspaceState'] = 'loading';
  const header = el('header', 'agent-workspace-header');
  const back = actionButton(words.back, 'back', 'quiet', () => options.back());
  header.append(el('h2', undefined, words.heading), back);
  const safety = el('p', 'agent-workspace-safety');
  safety.dataset['agentWorkspaceSafety'] = '';
  const body = el('div', 'agent-workspace-body');
  root.replaceChildren(header, safety, body);

  const stopPolling = (): void => {
    if (poll !== undefined) window.clearTimeout(poll);
    poll = undefined;
  };

  // ---- the range: primary manuscript words chosen in place ------------------------------------------------------------
  const pick = el('section', 'agent-workspace-pick');
  const pages = el('div', 'agent-workspace-blocks');
  pages.setAttribute('role', 'group');
  pages.setAttribute('aria-label', words.pick);
  const pageControls = el('div', 'button-row');
  const previous = windowStep(actionButton(words.previousPage, 'previous-page', 'quiet', () => void loadPage(page?.previousCursor ?? null)), 'before', "向前浏览");
  const next = windowStep(actionButton(words.nextPage, 'next-page', 'quiet', () => void loadPage(page?.nextCursor ?? null)), 'after', "向后浏览");
  pageControls.append(previous, next);
  const chosen = el('p', 'agent-workspace-selection', words.noSelection);
  chosen.dataset['agentWorkspaceSelection'] = 'none';
  const pickHeading = el('h3', undefined, words.pick);
  const noManuscript = el('span', undefined, ` · ${words.noManuscript}`);
  noManuscript.hidden = true;
  pickHeading.append(noManuscript);
  pick.append(pickHeading, pages, pageControls, chosen);

  const form = el('section', 'agent-workspace-instruction');
  const instructionId = `agent-workspace-instruction-${bookId}`;
  const label = el('label', undefined, `${words.instruction} · ${words.instructionNote}`);
  label.htmlFor = instructionId;
  const instruction = el('textarea');
  instruction.id = instructionId;
  instruction.rows = 3;
  instruction.maxLength = MAX_DIALOGUE_QUESTION_CHARACTERS;
  instruction.dataset['agentWorkspaceField'] = 'instruction';
  instruction.value = remembered?.instruction ?? '';
  const propose = actionButton(words.propose, 'propose', 'primary', () => void runPropose());
  form.append(label, instruction, propose);

  const proposalHost = el('section', 'agent-workspace-proposal');
  proposalHost.hidden = true;

  const paintSelection = (): void => {
    for (const node of pages.querySelectorAll<HTMLElement>('[data-agent-workspace-block]')) {
      node.toggleAttribute('data-agent-workspace-chosen', selection !== null && (selection.span?.some((pin) => pin.blockId === node.dataset['agentWorkspaceBlock']) ?? node.dataset['agentWorkspaceBlock'] === selection.blockId));
    }
    chosen.replaceChildren();
    if (selection === null) {
      chosen.textContent = words.noSelection;
      chosen.dataset['agentWorkspaceSelection'] = 'none';
    } else {
      chosen.dataset['agentWorkspaceSelection'] = `${selection.blockId}:${selection.fromGrapheme}-${selection.toGrapheme}`;
      const quote = el('q', 'agent-workspace-quote', selection.selectedText);
      chosen.append(`${words.selected}：`, quote);
    }
    paintControls();
  };

  /** Read a contiguous selection, or the whole paragraph a click lands in. */
  const capture = (): void => {
    if (page === null) return;
    const current = window.getSelection();
    if (current === null || current.rangeCount === 0) return;
    const range = current.getRangeAt(0);
    const blockOf = (node: Node | null): HTMLElement | null => {
      const element = node instanceof Element ? node : node?.parentElement ?? null;
      const block = element?.closest<HTMLElement>('[data-agent-workspace-block]') ?? null;
      return block !== null && pages.contains(block) ? block : null;
    };
    const start = blockOf(range.startContainer);
    const end = blockOf(range.endContainer);
    if (start === null || end === null) return;
    const blockId = start.dataset['agentWorkspaceBlock']!;
    let from = 0;
    let to = graphemesOf(start.textContent ?? '').length;
    if (!range.collapsed) {
      const before = document.createRange();
      before.selectNodeContents(start);
      before.setEnd(range.startContainer, range.startOffset);
      from = graphemesOf(before.toString()).length;
      const ending = document.createRange();
      ending.selectNodeContents(end);
      ending.setEnd(range.endContainer, range.endOffset);
      to = graphemesOf(ending.toString()).length;
    }
    const picked = selectionIn(page, blockId, from, to, end.dataset['agentWorkspaceBlock']!);
    if (picked === null) return;
    selection = picked;
    paintSelection();
  };
  pages.addEventListener('mouseup', capture);
  pages.addEventListener('keyup', capture);

  const loadPage = async (cursor: string | null, restore = false): Promise<void> => {
    try {
      const anchor = (await api.getBookOverview({ bookId, historyCursor: null })).manuscriptAnchor;
      if (destroyed) return;
      if (anchor === null) {
        pages.replaceChildren();
        noManuscript.hidden = false;
        pageControls.hidden = true;
        return;
      }
      noManuscript.hidden = true;
      pageControls.hidden = false;
      entryBlockId = anchor.entry?.blockId ?? null;
      const sameEntry = remembered?.entryBlockId === entryBlockId;
      const blockId = restore ? (sameEntry ? remembered?.blockId : undefined) ?? anchor.entry?.blockId : undefined;
      const read = blockId === undefined
        ? await api.getManuscriptWindow({ manuscriptId: anchor.manuscriptId, branchId: anchor.branchId, cursor })
        : await api.getManuscriptWindowAt({ manuscriptId: anchor.manuscriptId, branchId: anchor.branchId, target: { kind: 'block', blockId } });
      if (destroyed) return;
      page = read;
      if (restore && sameEntry && remembered?.selection?.baseRevisionId === read.revisionId && remembered.selection.expectedJournalSequence === read.journalSequence) selection = remembered.selection;
      pages.dataset['agentWorkspaceRevision'] = read.revisionId;
      pages.replaceChildren(...read.blocks.map((block) => {
        const node = el(block.kind === 'paragraph' || block.kind === 'note' ? 'p' : 'h4', 'agent-workspace-block', block.text);
        node.dataset['agentWorkspaceBlock'] = block.blockId;
        node.tabIndex = 0;
        return node;
      }));
      previous.disabled = read.previousCursor === null;
      next.disabled = read.nextCursor === null;
      // A selection on another page stays chosen; one on this page is painted where it stands.
      paintSelection();
    } catch (error) {
      if (!destroyed) options.setStatus(options.errorMessage(error, words.manuscriptFailed), 'error');
    }
  };

  // ---- the round the workspace holds -------------------------------------------------------------------------------
  const paintProposal = (proposal: AgentWorkspaceProposalProjection | null): void => {
    proposalHost.replaceChildren();
    if (promoted !== null) {
      proposalHost.hidden = false;
      proposalHost.dataset['agentWorkspaceProposal'] = 'promoted';
      const done = el('p', 'success-note', promoted.label);
      done.dataset['agentWorkspacePromoted'] = String(promoted.markIds.length);
      const finished = promoted;
      proposalHost.append(el('h3', undefined, words.proposal), done, actionButton(words.openMarks, 'open-marks', 'secondary', () => options.openMarks(finished)));
      return;
    }
    if (proposal === null) {
      proposalHost.hidden = true;
      delete proposalHost.dataset['agentWorkspaceProposal'];
      return;
    }
    proposalHost.hidden = false;
    proposalHost.dataset['agentWorkspaceProposal'] = proposal.state;
    proposalHost.dataset['proposalSetId'] = proposal.proposalSetId;
    const state = el('span', proposal.state === 'failed' ? 'attention-note' : undefined, proposal.label);
    state.dataset['agentWorkspaceLabel'] = '';
    state.setAttribute('role', 'status');
    const heading = el('h3', undefined, words.proposal);
    heading.append(' · ', state);
    proposalHost.append(heading, el('p', 'muted', `${words.instruction}：${proposal.instruction}`));
    if (proposal.candidates.length > 0) {
      const list = el('ol', 'agent-workspace-candidates');
      for (const candidate of proposal.candidates) {
        const item = el('li', 'agent-workspace-candidate');
        item.dataset['agentWorkspaceCandidate'] = String(candidate.ordinal);
        item.dataset['anchorBlock'] = candidate.anchor.blockId;
        item.dataset['anchorFrom'] = String(candidate.anchor.fromGrapheme);
        item.dataset['anchorTo'] = String(candidate.anchor.toGrapheme);
        const terms = el('dl');
        const original = el('dd', 'agent-workspace-anchor', candidate.anchor.text);
        const position = words.position(candidate.anchor.fromGrapheme, candidate.anchor.toGrapheme);
        if (position !== '') original.title = position;
        terms.append(
          el('dt', undefined, words.original), original,
          el('dt', undefined, words.proposed), el('dd', 'agent-workspace-proposed', candidate.proposedText),
          el('dt', undefined, words.rationale), el('dd', undefined, candidate.rationale),
        );
        item.append(terms);
        list.append(item);
      }
      proposalHost.append(list);
    }
    if (proposal.dropped.length > 0) {
      const dropped = el('ul', 'agent-workspace-dropped');
      for (const entry of proposal.dropped) {
        const line = el('li', undefined, words.droppedLine(entry.ordinal, entry.reason));
        line.dataset['agentWorkspaceDropped'] = String(entry.ordinal);
        dropped.append(line);
      }
      proposalHost.append(el('h4', undefined, words.dropped), dropped);
    }
    const actions = el('div', 'button-row');
    const promote = actionButton(words.promote, 'promote', 'primary', () => void runPromote(proposal.proposalSetId));
    promote.disabled = busy || proposal.state !== 'ready' || proposal.candidates.length === 0;
    const discard = actionButton(words.discard, 'discard', 'secondary', () => void runDiscard(proposal.proposalSetId));
    discard.disabled = busy;
    actions.append(promote, discard);
    proposalHost.append(actions);
  };

  const paintControls = (): void => {
    const held = workspace?.proposal ?? null;
    const open = workspace?.available === true && held?.state !== 'proposing';
    propose.disabled = busy || !open || selection === null;
    instruction.disabled = busy || !open;
  };

  const paint = (projection: AgentWorkspaceProjection): void => {
    workspace = projection;
    safety.textContent = `${words.safety}：${projection.capabilities.safetyLabel}`;
    root.dataset['agentWorkspaceState'] = projection.available ? 'available' : 'unavailable';
    if (!projection.available) {
      stopPolling();
      const prerequisite = el('p', 'attention-note', projection.unavailableReason ?? '');
      prerequisite.dataset['agentWorkspacePrerequisite'] = '';
      body.replaceChildren(prerequisite);
      return;
    }
    if (!body.contains(pick)) {
      body.replaceChildren(el('p', 'lede', words.lede), pick, form, proposalHost);
      void loadPage(null, true);
    }
    paintProposal(projection.proposal);
    paintControls();
    stopPolling();
    if (projection.proposal?.state === 'proposing') poll = window.setTimeout(() => void refresh(), PROPOSING_POLL_MS);
    // One action (Issue #1431 item 34): a round asked for here becomes 修改建议 on the manuscript as soon as it is ready, with no
    // separate 提交 step; decisions stay on the Mark Cards. A round left from before keeps its 提交 and 放弃 buttons.
    const held = projection.proposal;
    if (held !== null && held.proposalSetId === autoPromote && held.state !== 'proposing' && !busy) {
      autoPromote = null;
      if (held.state === 'ready' && held.candidates.length > 0) void runPromote(held.proposalSetId);
    }
  };

  const refresh = async (): Promise<void> => {
    try {
      const projection = await api.inspectAgentWorkspace();
      if (!destroyed && projection.bookId === bookId) paint(projection);
    } catch (error) {
      if (!destroyed) options.setStatus(options.errorMessage(error, words.failed), 'error');
    }
  };

  const act = async (run: () => Promise<void>, failure: string): Promise<void> => {
    if (busy) return;
    busy = true;
    root.setAttribute('aria-busy', 'true');
    paintControls();
    try {
      await run();
    } catch (error) {
      if (!destroyed) options.setStatus(options.errorMessage(error, failure), 'error');
    } finally {
      busy = false;
      root.setAttribute('aria-busy', 'false');
      if (!destroyed && workspace !== null) paint(workspace);
    }
  };

  const runPropose = (): Promise<void> => act(async () => {
    if (selection === null) return;
    promoted = null;
    const projection = await api.proposeAgentWorkspaceChangeSet({ selection, instruction: instruction.value });
    autoPromote = projection.proposal?.proposalSetId ?? null;
    if (!destroyed) paint(projection);
  }, words.proposeFailed);

  const runPromote = (proposalSetId: string): Promise<void> => act(async () => {
    const promotion = await api.promoteAgentWorkspaceProposals({ proposalSetId });
    if (destroyed) return;
    promoted = promotion;
    instruction.value = '';
    options.setStatus(promotion.label, 'success');
    paint(promotion.workspace);
    // Submitting opens the new 修改建议 in the manuscript in the same step (Issue #1410 item 9); 在稿件中查看 stays if it is left.
    options.openMarks(promotion);
  }, words.promoteFailed);

  const runDiscard = (proposalSetId: string): Promise<void> => act(async () => {
    const projection = await api.discardAgentWorkspaceProposals({ proposalSetId });
    if (destroyed) return;
    options.setStatus(words.discarded, 'success');
    paint(projection);
  }, words.discardFailed);

  void api.inspectAgentWorkspace().then((projection) => {
    if (destroyed || projection.bookId !== bookId) return;
    paint(projection);
    options.setStatus(projection.available ? words.opened : words.unavailable);
  }, (error: unknown) => {
    if (!destroyed) options.setStatus(options.errorMessage(error, words.failed), 'error');
  });

  return {
    destroy: () => {
      const blockId = selection?.blockId ?? page?.blocks[0]?.blockId;
      if (blockId !== undefined) readingPlaces.set(bookId, { blockId, entryBlockId, selection, instruction: instruction.value });
      destroyed = true;
      stopPolling();
    },
  };
}
