// Local view/input configuration messages, shared by main and the renderer (Issue #934).
export const PREFERENCE_ERRORS = Object.freeze({
  unknownKey: { code: 'AI7_PREFERENCE_KEY_UNKNOWN', message: '这项本机设置不存在，未保存。' },
  invalidValue: { code: 'AI7_PREFERENCE_VALUE_INVALID', message: '这项本机设置的值无效，未保存。' },
  writeFailed: { code: 'AI7_PREFERENCE_WRITE_FAILED', message: '本机界面设置未能写入，界面仍按原来的设置显示。' },
});

export const PREFERENCES_NOTICES = Object.freeze({
  unreadable: '本机界面设置文件无法读取，已按默认设置显示；下次更改设置时会重新写入。',
  partlyInvalid: '本机界面设置中有几项无法读取，这几项已按默认设置显示；下次更改设置时会重新写入。',
});
