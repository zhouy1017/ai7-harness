import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function preloadMembers(): string[] {
  const preload = readFileSync(new URL('../../src/main/preload.ts', import.meta.url), 'utf8');
  const api = preload.slice(preload.indexOf('const api: RendererApi & PreferencesRendererApi & AppearanceRendererApi & NotificationsRendererApi = Object.freeze({'), preload.lastIndexOf('contextBridge.exposeInMainWorld'));
  return [...api.matchAll(/^  ([A-Za-z][A-Za-z0-9]*):/gmu)].map((match) => match[1]!).sort();
}

describe('J-01 renderer isolation assertion', () => {
  it('retains Node isolation and pins the exact sorted preload API, including new Skill and recommendation operations', () => {
    const runner = readFileSync(new URL('../../e2e/run-j01.mjs', import.meta.url), 'utf8');
    const marker = "Object.keys(window.ai7).sort().join(',') === '";
    const line = runner.split(/\r?\n/u).find((line) => line.includes(marker))!;
    expect(line).toContain("typeof globalThis.process === 'undefined'");
    expect(line).toContain("typeof globalThis.require === 'undefined'");
    const list = line.slice(line.indexOf(marker) + marker.length).split("'")[0]!.split(',');
    expect(list).toEqual(preloadMembers());
    expect(new Set(list).size).toBe(list.length);
  });

  it('keeps the J-04 and J-07 export guard exceptions synchronized with the declared API (#936)', () => {
    const actual = preloadMembers().filter((member) => /export|publish|send/iu.test(member));
    expect(actual).toContain('exportUsageCsv');
    for (const journey of ['j04', 'j07']) {
      const runner = readFileSync(new URL(`../../e2e/run-${journey}.mjs`, import.meta.url), 'utf8');
      const literal = /const EXPORT_MEMBERS = (?:Object\.freeze\()?\[([\s\S]*?)\]/u.exec(runner);
      expect(literal, journey).not.toBeNull();
      const declared = [...literal![1]!.matchAll(/'([A-Za-z][A-Za-z0-9]*)'/gu)].map((match) => match[1]!);
      expect([...declared].sort(), journey).toEqual(actual);
      expect(new Set(declared).size, journey).toBe(declared.length);
      if (journey === 'j07') expect(declared).toEqual(actual);
    }
  });
});
