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
});
