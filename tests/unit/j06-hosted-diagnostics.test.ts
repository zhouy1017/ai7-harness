import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Issue #745: J-06 failed twice on hosted macOS at keep-current/third-suggestion-choose, and the hosted marker could not say
// what the product showed when the menu item could not be chosen. J-06 runs as it is imported, so its choice is read from
// its source and run here against a renderer that answers as the product would.
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const controller = (await import(new URL('../../e2e/controller.mjs', import.meta.url).href)) as {
  journeyCheckFailure(journey: string, check: string, options?: object): Error;
  journeyCheckLabel(error: unknown): string | null;
  isContentFreeCheckLabel(label: unknown): boolean;
};

const source = readFileSync(resolve(ROOT, 'e2e', 'run-j06.mjs'), 'utf8').replace(/\r\n/gu, '\n');
const start = source.indexOf('function menuWord(');
const end = source.indexOf('\n}\n', source.indexOf('async function chooseFromMenu(')) + 3;
const helpers = new Function('journeyCheckFailure', `${source.slice(start, end)}\nreturn { chooseFromMenu };`)(
  controller.journeyCheckFailure,
) as { chooseFromMenu(renderer: unknown, action: string, name: string): Promise<void> };

/** A renderer whose choice never succeeds and whose state, read after it, is `seen`. */
function rendererShowing(seen: Record<string, unknown> | null) {
  let calls = 0;
  return { evaluate: async () => (calls++ === 0 ? false : seen) };
}

async function labelOf(seen: Record<string, unknown> | null, name = 'third-suggestion-choose'): Promise<string | null> {
  return helpers.chooseFromMenu(rendererShowing(seen), 'add-change-suggestion', name).then(() => null, (error: unknown) => controller.journeyCheckLabel(error));
}

describe('J-06 names what the product showed when a menu choice could not be made (#745)', () => {
  it('chooses every 修改建议 through the named choice', () => {
    expect(source).toContain("await chooseFromMenu(renderer, 'add-change-suggestion', `${name}-choose`);");
    expect(source).toContain('window.__j06.paneAtMenu = pane();');
  });

  it('returns quietly when the item was chosen', async () => {
    await expect(helpers.chooseFromMenu({ evaluate: async () => true }, 'add-change-suggestion', 'third-suggestion-choose')).resolves.toBeUndefined();
  });

  it('says the menu was gone and the pane had moved, with the card and the tone it stood beside', async () => {
    expect(await labelOf({ menu: null, item: null, card: 'applied', tone: 'success', moved: true }))
      .toBe('third-suggestion-choose-menu-none-item-absent-card-applied-success-pane-moved');
  });

  it('says the item stood on the selection menu but was unavailable', async () => {
    expect(await labelOf({ menu: 'selection', item: 'disabled', card: null, tone: 'busy', moved: false }))
      .toBe('third-suggestion-choose-menu-selection-item-disabled-card-none-busy-pane-still');
  });

  it('keeps every word to a closed set, whatever the page answered', async () => {
    expect(await labelOf({ menu: '稿件', item: 'odd', card: 'accepted-with-edit', tone: '已保存', moved: 'yes' }, 'second-suggestion-choose'))
      .toBe('second-suggestion-choose-menu-other-item-absent-card-edited-none-pane-still');
    expect(await labelOf({ menu: 'mark', item: 'enabled', card: 'unknown', tone: 'error', moved: true }))
      .toBe('third-suggestion-choose-menu-mark-item-enabled-card-other-error-pane-moved');
  });

  it('keeps its label when the renderer is gone by the time it is read', async () => {
    let calls = 0;
    const gone = { evaluate: async () => { if (calls++ === 0) return false; throw new Error('J-06/renderer-evaluate'); } };
    const label = await helpers.chooseFromMenu(gone, 'add-change-suggestion', 'third-suggestion-choose').then(() => null, (error: unknown) => controller.journeyCheckLabel(error));
    expect(label).toBe('third-suggestion-choose-menu-none-item-absent-card-none-none-pane-still');
  });

  it('fits the content-free check shape at its longest', async () => {
    const longest = await labelOf({ menu: 'selection', item: 'disabled', card: 'withdrawn', tone: 'success', moved: true }, 'second-suggestion-choose');
    expect(controller.isContentFreeCheckLabel(longest)).toBe(true);
  });
});
