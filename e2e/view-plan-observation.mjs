import { journeyCheckLabel, labelViewPlanInputFailure } from './controller.mjs';

function observePlan(expectedRun) {
  const button = () => document.querySelector('.review-run [data-review-action="view-plan"]');
  const run = () => document.querySelector('.review-workspace-card');
  const drawer = () => document.querySelector('#task-drawer');
  const open = () => drawer()?.dataset.taskDrawer === 'open';
  const expected = () => drawer()?.dataset.taskPlanRef === expectedRun;
  const first = button(), initialState = run()?.dataset.reviewState;
  let previous = first, state = initialState, opened = open(), bound = expected(), down = null, point = null;
  const rows = [];
  const sample = (phase, event) => {
    const node = button(), rect = node?.getBoundingClientRect();
    const hit = point && document.elementFromPoint(...point);
    const role = element => !element ? 'none' : node?.contains(element) ? 'plan' : 'other';
    const row = { phase, rect: rect ? [rect.x, rect.y, rect.width, rect.height] : null, point,
      hit: role(hit), target: role(event?.target), trusted: event?.isTrusted === true,
      original: !!node && node === first, downNode: !!node && node === down, disabled: node?.disabled === true,
      sameRun: run()?.dataset.reviewRunId === expectedRun, sameState: run()?.dataset.reviewState === initialState,
      opened: open(), expected: expected() };
    if (rows.length >= 64) rows.splice(1, 1);
    rows.push(row);
  };
  const change = () => {
    const node = button(), nextState = run()?.dataset.reviewState;
    if (previous !== node || state !== nextState || opened !== open() || bound !== expected()) {
      previous = node; state = nextState; opened = open(); bound = expected();
      sample('redraw-or-state');
    }
  };
  const input = event => {
    point = [event.clientX, event.clientY];
    if (event.type === 'pointerdown') down = button();
    sample(event.type, event);
  };
  const types = ['pointermove', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
  const observer = new MutationObserver(change);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-review-state', 'data-task-plan-ref', 'data-task-drawer'] });
  for (const type of types) window.addEventListener(type, input, { capture: true, passive: true });
  sample('initial');
  window.__endViewPlanObservation = () => {
    observer.disconnect();
    for (const type of types) window.removeEventListener(type, input, true);
    sample('final');
    delete window.__endViewPlanObservation;
    return { viewport: [innerWidth, innerHeight], rows };
  };
}

export async function observeViewPlan(renderer, runId, press, awaitPlan) {
  await renderer.evaluate(`(${observePlan.toString()})(${JSON.stringify(runId)})`);
  let outcome = 'input-error';
  try {
    await press();
    outcome = 'plan-response';
    await awaitPlan();
    outcome = 'complete';
  } catch (error) {
    if (outcome === 'input-error') labelViewPlanInputFailure(error);
    for (const stage of ['target-moved-before-press', 'pointer-rest', 'target-moved-after-press']) {
      if (error.message === `review-sheet-view-plan-${stage}`) outcome = stage;
    }
    if (journeyCheckLabel(error) === 'review-sheet-view-plan-pointer-target') outcome = 'pointer-target';
    throw error;
  } finally {
    const observation = await renderer.evaluate('window.__endViewPlanObservation()').catch(() => null);
    process.stderr.write(`VIEW_PLAN_PHASE/${JSON.stringify({ outcome, observation })}\n`);
  }
}
