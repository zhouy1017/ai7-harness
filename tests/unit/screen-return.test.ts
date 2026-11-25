import { describe, expect, it, vi } from 'vitest';
import { RETURN_SCREENS, ScreenReturnHistory } from '../../src/renderer/screen-return.js';

describe('screen origins', () => {
  it.each([...RETURN_SCREENS])('returns %s to its source through redraws', async (screen) => {
    const history = new ScreenReturnHistory();
    const origin = vi.fn(); const redraw = vi.fn(); const fallback = vi.fn();
    history.enter('book-review', fallback);
    history.enter(screen, origin);
    history.enter(screen, redraw);
    await history.back(screen, fallback);
    expect(origin).toHaveBeenCalledOnce();
    expect(redraw).not.toHaveBeenCalled(); expect(fallback).not.toHaveBeenCalled();
  });

  it('keeps both origins for nested destinations and falls back for an unknown origin', async () => {
    const history = new ScreenReturnHistory(); const library = vi.fn(); const settings = vi.fn(() => history.enter('settings', library));
    history.enter('settings', library); history.enter('data-storage', settings);
    const data = vi.fn(() => history.enter('data-storage', settings));
    history.enter('model-service', data);
    await history.back('model-service', library); await history.back('data-storage', library);
    expect(data).toHaveBeenCalledOnce(); expect(settings).toHaveBeenCalledOnce();
    await history.back('unknown', library); expect(library).toHaveBeenCalledOnce();
  });

  it('reaches the page the editor came from after settings pages were visited back and forth, and 帮助 from a page its step opened (0.7.9 review, BUG-18)', async () => {
    const history = new ScreenReturnHistory(); const manuscript = vi.fn(); const fallback = vi.fn();
    const page = (screen: string) => vi.fn(() => history.enter(screen, fallback));
    history.enter('editor', fallback); history.enter('model-service', manuscript);
    history.enter('appearance', page('model-service')); history.enter('model-service', page('appearance'));
    await history.back('model-service', fallback);
    expect(manuscript).toHaveBeenCalledOnce();
    // F1 from the manuscript, then a step of 帮助 opens 模型服务: 返回 is 帮助 first, the manuscript after it.
    const help = page('help');
    history.enter('editor', fallback); history.enter('help', manuscript); history.enter('model-service', help);
    await history.back('model-service', fallback); expect(help).toHaveBeenCalledOnce();
    await history.back('help', fallback); expect(manuscript).toHaveBeenCalledTimes(2);
    // Another page opened since is no way back: 设置 from there returns there.
    const review = vi.fn();
    history.enter('book-review', fallback); history.enter('keyboard', review);
    await history.back('keyboard', fallback); expect(review).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
  });
});
