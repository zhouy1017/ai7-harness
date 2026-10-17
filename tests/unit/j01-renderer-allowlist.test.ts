import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('J-01 renderer isolation assertion', () => {
  it('retains Node isolation and pins the exact sorted preload API, including new Skill and recommendation operations', () => {
    const runner = readFileSync(new URL('../../e2e/run-j01.mjs', import.meta.url), 'utf8');
    const preload = readFileSync(new URL('../../src/main/preload.ts', import.meta.url), 'utf8');
    const marker = "Object.keys(window.ai7).sort().join(',') === '";
    const line = runner.split(/\r?\n/u).find((line) => line.includes(marker))!;
    expect(line).toContain("typeof globalThis.process === 'undefined'");
    expect(line).toContain("typeof globalThis.require === 'undefined'");
    const list = line.slice(line.indexOf(marker) + marker.length).split("'")[0]!.split(',');
    const api = preload.slice(preload.indexOf('const api: RendererApi = Object.freeze({'), preload.lastIndexOf('contextBridge.exposeInMainWorld'));
    const actual = [...api.matchAll(/^  ([A-Za-z][A-Za-z0-9]*):/gmu)].map((match) => match[1]!).sort();
    expect(list).toEqual(actual);
    expect(new Set(list).size).toBe(list.length);
  });
});
