import { describe, expect, it, vi } from 'vitest';
import {
  COMMANDS,
  FIXED_COMMANDS,
  captureChord,
  checkBinding,
  chordLabel,
  configureCommandLabels,
  createCommandDispatcher,
  defaultBindings,
  effectiveSequence,
  normalizedBindings,
  parseSequence,
  refreshShortcutLabels,
  reservedReason,
  shortcutHint,
  shortcutLabel,
  withBinding,
  withoutBinding,
  validatedBindings,
  type CommandPlatform,
  type KeyEventLike,
} from '../../src/renderer/commands.js';
import { IME_DEFERRED_ANNOUNCEMENT } from '../../src/renderer/commands-labels.js';

// Unit suite for the command registry (Issue #936, plan slice 11c; V2-UX-KEY-002, KEY-003, KEY-004, KEY-006, KEY-011).

const PLATFORMS: readonly CommandPlatform[] = ['win32', 'darwin'];

function press(platform: CommandPlatform, code: string, held: { mod?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean; composing?: boolean } = {}): KeyEventLike & { preventDefault(): void; prevented: boolean } {
  const event = {
    code,
    key: code,
    ctrlKey: platform === 'darwin' ? held.ctrl === true : held.mod === true,
    metaKey: platform === 'darwin' ? held.mod === true : false,
    altKey: held.alt === true,
    shiftKey: held.shift === true,
    isComposing: held.composing === true,
    defaultPrevented: false,
    prevented: false,
    preventDefault(): void {
      event.prevented = true;
    },
  };
  return event;
}

describe('the command registry', () => {
  it('declares only navigation, search and view commands, each with a Chinese name and a default per platform', () => {
    expect(new Set(COMMANDS.map((command) => command.id)).size).toBe(COMMANDS.length);
    for (const command of COMMANDS) {
      expect(['navigation', 'search', 'view']).toContain(command.group);
      expect(command.name).toMatch(/\p{Script=Han}/u);
      for (const platform of PLATFORMS) expect(parseSequence(command.defaults[platform])).not.toBeNull();
    }
  });

  it('gives every default a binding that is neither reserved nor in conflict, on both platforms', () => {
    for (const platform of PLATFORMS) {
      for (const command of COMMANDS) {
        const check = checkBinding(command.id, command.defaults[platform], {}, platform);
        expect(check, `${platform} ${command.id}`).toEqual({ ok: true });
      }
    }
  });

  it('maps no command to an authority-bearing action (KEY-004)', () => {
    const forbidden = ['开始任务', '采纳', '设为发稿版本', '保存为里程碑版本', '删除', '批准', '授权', '应用', '放弃', '覆盖', '替换全部', '确认'];
    for (const command of COMMANDS) {
      for (const word of forbidden) expect(command.name, command.id).not.toContain(word);
      expect(command.id, command.id).toMatch(/^(?:nav|search|view)\./u);
      expect(command.id, command.id).not.toMatch(/start|run|authoriz|adopt|apply|publish|designate|delete|approve|milestone|decision/iu);
    }
    expect(FIXED_COMMANDS.map((fixed) => fixed.id)).toEqual(['edit.save', 'edit.undo', 'edit.redo', 'edit.replace', 'edit.previousWindow', 'edit.nextWindow']);
  });

  it('never dispatches an id the registry does not declare, even when a preference names one', () => {
    const ran = vi.fn();
    const dispatcher = createCommandDispatcher({ platform: 'win32', bindings: () => ({ 'task.start': 'Alt+9' }), composing: () => false, announce: () => undefined });
    dispatcher.register({ 'task.start': ran, 'nav.library': () => undefined });
    const event = press('win32', 'Digit9', { alt: true });
    dispatcher.handle(event);
    expect(ran).not.toHaveBeenCalled();
    expect(event.prevented).toBe(false);
  });
});

describe('reserved keys', () => {
  const chord = (text: string) => parseSequence(text)![0]!;

  it('refuses the keys that type, move the caret or edit the text', () => {
    for (const platform of PLATFORMS) {
      for (const text of ['A', 'Shift+A', 'Space', 'Enter', 'Escape', 'Tab', 'ArrowLeft', 'Mod+C', 'Mod+V', 'Mod+X', 'Mod+A', 'Mod+Z', 'Mod+Y', 'Mod+Shift+Y', 'Mod+ArrowLeft', 'Mod+Shift+Home', 'Mod+Backspace']) {
        expect(reservedReason(chord(text), platform), `${platform} ${text}`).toBe('editable-text');
      }
    }
    expect(reservedReason(chord('Mod+Alt+F'), 'win32')).toBe('editable-text');
    expect(reservedReason(chord('Alt+F'), 'darwin')).toBe('editable-text');
  });

  it('refuses the operating system\'s and the input method\'s keys, naming which', () => {
    expect(reservedReason(chord('Alt+F4'), 'win32')).toBe('os-reserved');
    expect(reservedReason(chord('Alt+Tab'), 'win32')).toBe('os-reserved');
    expect(reservedReason(chord('F11'), 'win32')).toBe('os-reserved');
    expect(reservedReason(chord('Mod+Q'), 'darwin')).toBe('os-reserved');
    expect(reservedReason(chord('Mod+Shift+4'), 'darwin')).toBe('os-reserved');
    expect(reservedReason(chord('Mod+Equal'), 'win32')).toBe('os-reserved');
    expect(reservedReason(chord('Mod+0'), 'darwin')).toBe('os-reserved');
    expect(reservedReason(chord('Mod+Space'), 'darwin')).toBe('ime-reserved');
    expect(reservedReason(chord('Mod+Space'), 'win32')).toBe('ime-reserved');
    expect(reservedReason(chord('Shift+Space'), 'win32')).toBe('ime-reserved');
    expect(reservedReason(chord('Mod+Period'), 'win32')).toBe('ime-reserved');
  });

  it('lets a function key or a modified letter through', () => {
    expect(reservedReason(chord('F6'), 'win32')).toBeNull();
    expect(reservedReason(chord('Shift+F6'), 'darwin')).toBeNull();
    expect(reservedReason(chord('Mod+Shift+L'), 'win32')).toBeNull();
    expect(reservedReason(chord('Alt+7'), 'win32')).toBeNull();
  });

  it('refuses a reserved key as a binding, with the named reason and the key it concerned', () => {
    const refused = checkBinding('nav.library', 'Mod+C', {}, 'win32');
    expect(refused).toMatchObject({ ok: false, reason: 'editable-text', with: null });
    expect(refused.ok ? '' : refused.message).toContain('Ctrl+C');
    expect(checkBinding('nav.library', 'Alt+F4', {}, 'win32')).toMatchObject({ ok: false, reason: 'os-reserved' });
    expect(checkBinding('nav.library', 'Mod+Space', {}, 'darwin')).toMatchObject({ ok: false, reason: 'ime-reserved' });
    // A second step is judged like the first.
    expect(checkBinding('nav.library', 'Mod+K C', {}, 'win32')).toMatchObject({ ok: false, reason: 'editable-text' });
    expect(checkBinding('nav.library', 'not a chord', {}, 'win32')).toMatchObject({ ok: false, reason: 'unsupported-key' });
  });
});

describe('conflicts', () => {
  it('refuses an exact conflict with a command, naming it and the contexts it bites in', () => {
    const check = checkBinding('nav.library', 'Mod+F', {}, 'win32');
    expect(check).toMatchObject({ ok: false, reason: 'exact-conflict', with: '查找' });
    if (!check.ok) {
      expect(check.contexts).toEqual(['整个应用', '稿件编辑']);
      expect(check.message).toContain('「查找」');
      expect(check.message).toContain('整个应用、稿件编辑');
    }
  });

  it('refuses a chord an editing command keeps (保存, 替换)', () => {
    expect(checkBinding('nav.series', 'Mod+S', {}, 'win32')).toMatchObject({ ok: false, reason: 'exact-conflict', with: '保存' });
    expect(checkBinding('nav.series', 'Mod+H', {}, 'win32')).toMatchObject({ ok: false, reason: 'exact-conflict', with: '替换' });
    expect(checkBinding('nav.series', 'PageDown', {}, 'win32')).toMatchObject({ ok: false, reason: 'editable-text' });
  });

  it('sees a conflict with a command the editor already remapped', () => {
    const bindings = withBinding({}, 'nav.knowledge', 'Mod+Shift+K', 'win32');
    expect(checkBinding('nav.series', 'Mod+Shift+K', bindings, 'win32')).toMatchObject({ ok: false, reason: 'exact-conflict', with: '知识库' });
    // The chord the remap freed is free.
    expect(checkBinding('nav.series', 'Alt+4', bindings, 'win32')).toEqual({ ok: true });
  });

  it('refuses a prefix conflict in either direction, and a sequence that does not clash is taken', () => {
    const bindings = withBinding({}, 'nav.knowledge', 'Mod+Shift+K', 'win32');
    expect(checkBinding('nav.series', 'Mod+Shift+K Mod+B', bindings, 'win32')).toMatchObject({ ok: false, reason: 'prefix-conflict', with: '知识库' });
    const sequenced = withBinding({}, 'nav.knowledge', 'Mod+Shift+K Mod+B', 'win32');
    expect(checkBinding('nav.series', 'Mod+Shift+K', sequenced, 'win32')).toMatchObject({ ok: false, reason: 'prefix-conflict', with: '知识库' });
    expect(checkBinding('nav.series', 'Mod+Shift+K Mod+D', sequenced, 'win32')).toEqual({ ok: true });
    expect(checkBinding('nav.series', 'Mod+Shift+J Mod+B', sequenced, 'win32')).toEqual({ ok: true });
    // The same sequence is an exact conflict, not a prefix one.
    expect(checkBinding('nav.series', 'Mod+Shift+K Mod+B', sequenced, 'win32')).toMatchObject({ ok: false, reason: 'exact-conflict' });
  });

  it('does not conflict a command with itself', () => {
    expect(checkBinding('search.find', 'Mod+F', {}, 'win32')).toEqual({ ok: true });
  });
});

describe('恢复默认', () => {
  it('refuses restoring a default that another remap now uses, including as a prefix', () => {
    for (const platform of PLATFORMS) {
      const original = COMMANDS.find((command) => command.id === 'nav.library')!.defaults[platform];
      const moved = withBinding({}, 'nav.library', 'Mod+Shift+L', platform);
      const stolen = withBinding(moved, 'nav.series', original, platform);
      expect(checkBinding('nav.library', original, withoutBinding(stolen, 'nav.library'), platform)).toMatchObject({ ok: false, reason: 'exact-conflict', with: '书系' });
      const prefix = withBinding(moved, 'nav.series', `${original} Mod+B`, platform);
      expect(checkBinding('nav.library', original, withoutBinding(prefix, 'nav.library'), platform)).toMatchObject({ ok: false, reason: 'prefix-conflict', with: '书系' });
    }
  });

  it('drops stored reserved, unsupported and conflicting overrides before dispatch and labelling', () => {
    expect(validatedBindings({ 'nav.library': 'Mod+C', 'nav.series': 'Alt+2', 'nav.knowledge': 'Mod+Unreal' }, 'win32')).toEqual({});
    expect(checkBinding('nav.series', 'Ctrl+K', {}, 'win32')).toMatchObject({ ok: false, reason: 'unsupported-key' });
    expect(checkBinding('nav.series', 'Ctrl+A', {}, 'darwin')).toMatchObject({ ok: false, reason: 'editable-text' });
  });
  it('restores one command, and the whole section', () => {
    let bindings = withBinding({}, 'nav.library', 'Mod+Shift+L', 'win32');
    bindings = withBinding(bindings, 'nav.series', 'Mod+Shift+U', 'win32');
    expect(bindings).toEqual({ 'nav.library': 'Mod+Shift+L', 'nav.series': 'Mod+Shift+U' });
    const one = withoutBinding(bindings, 'nav.library');
    expect(one).toEqual({ 'nav.series': 'Mod+Shift+U' });
    expect(effectiveSequence('nav.library', one, 'win32')).toBe('Alt+2');
    expect(defaultBindings()).toEqual({});
    expect(effectiveSequence('nav.series', defaultBindings(), 'win32')).toBe('Alt+3');
  });

  it('keeps only what differs from the platform default', () => {
    expect(normalizedBindings({ 'nav.library': 'Alt+2', 'nav.series': 'Mod+Shift+U', 'gone.command': 'Alt+8' }, 'win32')).toEqual({ 'nav.series': 'Mod+Shift+U' });
    expect(withBinding({ 'nav.series': 'Mod+Shift+U' }, 'nav.series', 'Alt+3', 'win32')).toEqual({});
  });
});

describe('the one label source', () => {
  it('shows each platform\'s chord and the window\'s existing 保存 hint', () => {
    expect(shortcutLabel('edit.save', 'win32', {})).toBe('Ctrl+S');
    expect(shortcutLabel('edit.save', 'darwin', {})).toBe('Command+S');
    expect(shortcutLabel('search.find', 'darwin', {})).toBe('Command+F');
    expect(shortcutLabel('nav.back', 'win32', {})).toBe('Alt+←');
    expect(shortcutLabel('nav.back', 'darwin', {})).toBe('Command+[');
    expect(shortcutLabel('nav.attention', 'darwin', {})).toBe('Command+Option+1');
    expect(shortcutLabel('no.such.command', 'win32', {})).toBeNull();
    expect(chordLabel(parseSequence('Mod+Ctrl+Shift+Q')![0]!, 'darwin')).toBe('Command+Control+Shift+Q');
  });

  it('updates every shown chord at once after a valid remap, and after 恢复默认', () => {
    const nodes = [
      { dataset: { shortcutCommand: 'edit.save', shortcutBase: '保存当前编辑' }, title: '', textContent: '' },
      { dataset: { shortcutCommand: 'search.find' }, title: '', textContent: '' },
      { dataset: { shortcutCommand: 'search.find', shortcutText: '' }, title: '', textContent: '' },
    ];
    const root = { querySelectorAll: () => nodes } as unknown as ParentNode;
    configureCommandLabels('win32', {});
    refreshShortcutLabels(root);
    expect(nodes[0]!.title).toBe('保存当前编辑（快捷键 Ctrl+S）');
    expect(nodes[1]!.title).toBe('快捷键 Ctrl+F');
    expect(nodes[2]!.textContent).toBe('Ctrl+F');
    expect(shortcutHint('edit.save')).toBe('快捷键 Ctrl+S');

    configureCommandLabels('win32', withBinding({}, 'search.find', 'Mod+Shift+F', 'win32'));
    refreshShortcutLabels(root);
    expect(nodes[1]!.title).toBe('快捷键 Ctrl+Shift+F');
    expect(nodes[2]!.textContent).toBe('Ctrl+Shift+F');
    // The editing command keeps its chord.
    expect(nodes[0]!.title).toBe('保存当前编辑（快捷键 Ctrl+S）');

    configureCommandLabels('win32', defaultBindings());
    refreshShortcutLabels(root);
    expect(nodes[1]!.title).toBe('快捷键 Ctrl+F');
    expect(nodes[2]!.textContent).toBe('Ctrl+F');
  });
});

describe('capturing a chord', () => {
  it('reads Ctrl as the modifier on Windows and Command on macOS, and ignores a modifier pressed alone', () => {
    expect(captureChord(press('win32', 'KeyL', { mod: true, shift: true }), 'win32')).toEqual({ chord: { mod: true, ctrl: false, alt: false, shift: true, key: 'L' } });
    expect(captureChord(press('darwin', 'KeyL', { mod: true, ctrl: true }), 'darwin')).toEqual({ chord: { mod: true, ctrl: true, alt: false, shift: false, key: 'L' } });
    expect(captureChord(press('win32', 'ShiftLeft', { shift: true }), 'win32')).toBeNull();
    expect(captureChord(press('darwin', 'MetaLeft', { mod: true }), 'darwin')).toBeNull();
    expect(captureChord(press('win32', 'Numpad5'), 'win32')).toEqual({ refused: 'unsupported-key' });
    expect(captureChord({ ...press('win32', 'KeyL'), metaKey: true }, 'win32')).toEqual({ refused: 'os-reserved' });
  });
});

describe('dispatch', () => {
  function dispatcherWith(bindings: { current: Record<string, string> }, composing: { current: boolean }, platform: CommandPlatform = 'win32') {
    const announce = vi.fn();
    const dispatcher = createCommandDispatcher({ platform, bindings: () => bindings.current, composing: () => composing.current, announce });
    return { dispatcher, announce };
  }

  it('runs the handler of the command a press matches, and consumes the press', () => {
    const ran = vi.fn();
    const { dispatcher } = dispatcherWith({ current: {} }, { current: false });
    dispatcher.register({ 'nav.library': ran });
    const event = press('win32', 'Digit2', { alt: true });
    dispatcher.handle(event);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(event.prevented).toBe(true);
  });

  it('leaves a press alone when no command has a handler on the screen, or none matches', () => {
    const { dispatcher } = dispatcherWith({ current: {} }, { current: false });
    const unmatched = press('win32', 'KeyQ', { alt: true });
    dispatcher.handle(unmatched);
    const unregistered = press('win32', 'Digit2', { alt: true });
    dispatcher.handle(unregistered);
    expect(unmatched.prevented).toBe(false);
    expect(unregistered.prevented).toBe(false);
  });

  it('holds every command back while an input method composes, and says so (KEY-006)', () => {
    const ran = vi.fn();
    const composing = { current: true };
    const { dispatcher, announce } = dispatcherWith({ current: {} }, composing);
    dispatcher.register({ 'nav.library': ran, 'search.find': ran });
    for (const code of ['Digit2', 'KeyF']) {
      const event = press('win32', code, code === 'KeyF' ? { mod: true } : { alt: true });
      dispatcher.handle(event);
      expect(event.prevented).toBe(true);
    }
    expect(ran).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenCalledWith(IME_DEFERRED_ANNOUNCEMENT);
    // The composition's own event flag holds the command back too, without the window's state.
    composing.current = false;
    dispatcher.handle(press('win32', 'Digit2', { alt: true, composing: true }));
    expect(ran).not.toHaveBeenCalled();
    // Once the composition ends the same press runs.
    dispatcher.handle(press('win32', 'Digit2', { alt: true }));
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it('does not act on a press another handler already consumed', () => {
    const ran = vi.fn();
    const { dispatcher } = dispatcherWith({ current: {} }, { current: false });
    dispatcher.register({ 'nav.library': ran });
    dispatcher.handle({ ...press('win32', 'Digit2', { alt: true }), defaultPrevented: true });
    expect(ran).not.toHaveBeenCalled();
  });

  it('clears a pending sequence when another handler consumes a key or the IME interrupts it', () => {
    const ran = vi.fn();
    const bindings = { current: { 'nav.series': 'Mod+Shift+K Mod+B' } };
    const composing = { current: false };
    const { dispatcher } = dispatcherWith(bindings, composing);
    dispatcher.register({ 'nav.series': ran });
    dispatcher.handle(press('win32', 'KeyK', { mod: true, shift: true }));
    dispatcher.handle({ ...press('win32', 'KeyX'), defaultPrevented: true });
    dispatcher.handle(press('win32', 'KeyB', { mod: true }));
    expect(ran).not.toHaveBeenCalled();
    dispatcher.handle(press('win32', 'KeyK', { mod: true, shift: true }));
    composing.current = true;
    dispatcher.handle(press('win32', 'KeyB', { mod: true }));
    composing.current = false;
    dispatcher.handle(press('win32', 'KeyB', { mod: true }));
    expect(ran).not.toHaveBeenCalled();
  });

  it('follows a remap at once: the old chord stops, the new one runs', () => {
    const ran = vi.fn();
    const bindings = { current: {} as Record<string, string> };
    const { dispatcher } = dispatcherWith(bindings, { current: false });
    dispatcher.register({ 'nav.library': ran });
    bindings.current = withBinding({}, 'nav.library', 'Mod+Shift+L', 'win32') as Record<string, string>;
    dispatcher.handle(press('win32', 'Digit2', { alt: true }));
    expect(ran).not.toHaveBeenCalled();
    dispatcher.handle(press('win32', 'KeyL', { mod: true, shift: true }));
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it('runs a two-step sequence only when both steps come in order', () => {
    const ran = vi.fn();
    const bindings = { current: withBinding({}, 'nav.series', 'Mod+Shift+K Mod+B', 'win32') as Record<string, string> };
    const { dispatcher } = dispatcherWith(bindings, { current: false });
    dispatcher.register({ 'nav.series': ran });
    dispatcher.handle(press('win32', 'KeyB', { mod: true }));
    expect(ran).not.toHaveBeenCalled();
    const first = press('win32', 'KeyK', { mod: true, shift: true });
    dispatcher.handle(first);
    expect(first.prevented).toBe(true);
    expect(ran).not.toHaveBeenCalled();
    dispatcher.handle(press('win32', 'KeyB', { mod: true }));
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it('is not run twice by a held key', () => {
    const ran = vi.fn();
    const { dispatcher } = dispatcherWith({ current: {} }, { current: false });
    dispatcher.register({ 'nav.library': ran });
    dispatcher.handle({ ...press('win32', 'Digit2', { alt: true }), repeat: true });
    expect(ran).not.toHaveBeenCalled();
  });
});
