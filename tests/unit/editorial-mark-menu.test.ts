import { describe, expect, it } from 'vitest';
import { menuPlacement } from '../../src/renderer/editorial-marks.js';

const viewport = { width: 640, height: 400 };
const menu = { width: 260, height: 300 };

describe('where a Mark surface menu goes', () => {
  it('opens at the point it was asked for when it fits there', () => {
    expect(menuPlacement({ x: 100, y: 40 }, menu, viewport)).toEqual({ left: 100, top: 40 });
  });

  it('moves back inside the right and bottom edges', () => {
    expect(menuPlacement({ x: 636, y: 390 }, menu, viewport)).toEqual({ left: 640 - 8 - 260, top: 400 - 8 - 300 });
  });

  it('comes down into the window when the caret it speaks for was scrolled out above it', () => {
    expect(menuPlacement({ x: 120, y: -480 }, menu, viewport)).toEqual({ left: 120, top: 8 });
  });

  it('comes in from the left of the window', () => {
    expect(menuPlacement({ x: -30, y: 50 }, menu, viewport)).toEqual({ left: 8, top: 50 });
  });

  it('starts at the margin when it is larger than the window', () => {
    expect(menuPlacement({ x: 300, y: 200 }, { width: 700, height: 500 }, viewport)).toEqual({ left: 8, top: 8 });
  });
});
