import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// Issue #652: a failed Journey names the check that failed beside its stage, as a content-free label the runner wrote,
// and the orchestrations repeat it as one extra marker line next to the unchanged one. `e2e/*.mjs` and `tools/*.mjs`
// are runner infrastructure outside the typed program, so they are loaded through runtime specifiers and typed here.
type Failure = { location: string; errorClass: string };
type JourneyResult = {
  stdout: string;
  stderr: string;
  spawnError: boolean;
  controllerSignal: string | null;
  signal: string | null;
  outputOverflow: boolean;
};

const controller = (await import(new URL('../../e2e/controller.mjs', import.meta.url).href)) as {
  JOURNEY_LOCATIONS: Readonly<Record<string, readonly string[]>>;
  isContentFreeCheckLabel(label: unknown): boolean;
  journeyCheckFailure(journey: string, check: unknown, options?: { cause?: unknown; failed?: readonly string[] }): Error;
  journeyCheckLabel(error: unknown): string | null;
  formatJourneyCheckLine(journey: string, location: string, error: unknown): string | null;
  classifyJourneyResult(result: JourneyResult, journey: string): Failure;
  collectJourneyCheck(result: JourneyResult, journey: string, failure: Failure): string | null;
};
const queue = (await import(new URL('../../tools/nightly-queue.mjs', import.meta.url).href)) as {
  parseGateLog(text: string): { failed: readonly Record<string, unknown>[]; unclassified: number };
};

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const E2E = resolve(ROOT, 'e2e');
const J07_LOCATION = controller.JOURNEY_LOCATIONS['J-07']?.[0] as string;

function childResult(stderr: string): JourneyResult {
  return { stdout: '', stderr, spawnError: false, controllerSignal: null, signal: null, outputOverflow: false };
}

describe('a check label is printed only when it is a content-free code identifier', () => {
  it('accepts the labels runners write', () => {
    for (const label of [
      'dirty-saving-undo-drained-and-unlocked',
      'exclusion-select-3',
      'renderer-cdp-timeout',
      'a',
      '0',
      `a${'-'.repeat(95)}`,
    ]) {
      expect(controller.isContentFreeCheckLabel(label), label).toBe(true);
    }
  });

  it('refuses text, punctuation, upper case, a leading hyphen and anything longer than 96', () => {
    for (const label of [
      '',
      'has space',
      '本地业务服务已停止',
      'check-稿件',
      'package-export-docx-document:news-release',
      'a/b',
      'a.b',
      'a_b',
      'Upper-case',
      '-leading',
      'line\nbreak',
      'trailing\n',
      `a${'b'.repeat(96)}`,
    ]) {
      expect(controller.isContentFreeCheckLabel(label), JSON.stringify(label)).toBe(false);
    }
    for (const value of [undefined, null, 7, ['a'], { label: 'a' }]) {
      expect(controller.isContentFreeCheckLabel(value)).toBe(false);
    }
  });
});

describe('the error a failed check throws', () => {
  it('keeps the message the runners always wrote and carries the label', () => {
    const error = controller.journeyCheckFailure('J-02', 'dirty-saving-undo-drained-and-unlocked');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('J-02/dirty-saving-undo-drained-and-unlocked');
    expect('cause' in error).toBe(false);
    expect(controller.journeyCheckLabel(error)).toBe('dirty-saving-undo-drained-and-unlocked');
  });

  it('names the members of a multi-check wait in the message only, and keeps a cause', () => {
    const cause = new Error('renderer said something');
    const error = controller.journeyCheckFailure('J-02', 'authoritative-mutation-drain', { failed: ['drained', 'unlocked'], cause });
    expect(error.message).toBe('J-02/authoritative-mutation-drain:drained,unlocked');
    expect(error.cause).toBe(cause);
    expect(controller.journeyCheckLabel(error)).toBe('authoritative-mutation-drain');
  });

  it('adds nothing a serialised or enumerated error would show', () => {
    const error = controller.journeyCheckFailure('J-07', 'package-export-remaining-open');
    expect(Object.keys(error)).toEqual([]);
    expect(JSON.stringify(error)).toBe('{}');
    expect(error).toEqual(new Error('J-07/package-export-remaining-open'));
  });

  it('names no check for an error it did not build, or for a label that is not content-free', () => {
    expect(controller.journeyCheckLabel(new Error('J-07/package-export-remaining-open'))).toBeNull();
    expect(controller.journeyCheckLabel(controller.journeyCheckFailure('J-07', '稿件 text'))).toBeNull();
    for (const value of [undefined, null, 'J-07/x', 7]) expect(controller.journeyCheckLabel(value)).toBeNull();
    expect(controller.formatJourneyCheckLine('J-07', J07_LOCATION, new Error('x'))).toBeNull();
  });
});

/**
 * What a Journey child prints when `reportJourneyFailure` reports `error` (a JavaScript expression over the controller
 * module `c`) at `location`. It runs in its own process: the report closes the process's controller channel and sets its
 * exit code, which a test worker must not do to itself.
 */
function reported(location: string, error: string): { status: number | null; stderr: string } {
  const script = [
    `const c = await import(${JSON.stringify(pathToFileURL(resolve(E2E, 'controller.mjs')).href)});`,
    `c.reportJourneyFailure('J-07', ${JSON.stringify(location)}, ${error});`,
  ].join('\n');
  const env = { ...process.env };
  delete env.AI7_E2E_LOCAL_DEBUG;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', env });
  return { status: child.status, stderr: child.stderr };
}

function printed(location: string, error: string): string[] {
  return reported(location, error).stderr.split(/\r?\n/u).filter((line) => line.length > 0);
}

describe('reportJourneyFailure prints the check beside the location line', () => {
  it('prints the location line, then the check line', () => {
    expect(printed(J07_LOCATION, `c.journeyCheckFailure('J-07', 'publication-saved')`)).toEqual([
      `J-07/${J07_LOCATION}`,
      `J-07/${J07_LOCATION}/check/publication-saved`,
    ]);
  });

  it('prints only the location line when the error carries no content-free label', () => {
    expect(printed(J07_LOCATION, `new Error('J-07/publication-saved')`)).toEqual([`J-07/${J07_LOCATION}`]);
    expect(printed(J07_LOCATION, `c.journeyCheckFailure('J-07', '已保存 · publication')`)).toEqual([`J-07/${J07_LOCATION}`]);
    expect(printed(J07_LOCATION, 'undefined')).toEqual([`J-07/${J07_LOCATION}`]);
  });

  it('places the check under the admitted location the failure was reduced to', () => {
    expect(printed('not-an-admitted-location', `c.journeyCheckFailure('J-07', 'publication-saved')`)).toEqual([
      'J-07/controller',
      'J-07/controller/check/publication-saved',
    ]);
  });
});

describe('the controller reads the check a failed child named', () => {
  it('reads it from a real child, and the classification still finds exactly one location line', () => {
    const child = reported(J07_LOCATION, `c.journeyCheckFailure('J-07', 'exclusion-select-3')`);
    expect(child.status).toBe(1);
    const result = childResult(child.stderr);
    const failure = controller.classifyJourneyResult(result, 'J-07');
    expect(failure).toEqual({ location: J07_LOCATION, errorClass: 'journey-failure' });
    expect(controller.collectJourneyCheck(result, 'J-07', failure)).toBe('exclusion-select-3');
  });

  it('names no check unless exactly one content-free line stands at the classified location', () => {
    const location = `J-07/${J07_LOCATION}`;
    const failure = { location: J07_LOCATION, errorClass: 'journey-failure' };
    const read = (...lines: string[]) => controller.collectJourneyCheck(childResult(lines.join('\n')), 'J-07', failure);
    expect(read(location, `${location}/check/publication-saved`)).toBe('publication-saved');
    expect(read(location)).toBeNull();
    expect(read(location, `${location}/check/one`, `${location}/check/two`)).toBeNull();
    expect(read(location, `${location}/check/本地 text`)).toBeNull();
    expect(read(location, `${location}/check/`)).toBeNull();
    expect(read(location, 'J-07/controller/check/publication-saved')).toBeNull();
    expect(read(location, `J-02/${J07_LOCATION}/check/publication-saved`)).toBeNull();
    const other = { location: 'controller', errorClass: 'controller-output-ambiguous' };
    expect(controller.collectJourneyCheck(childResult('J-07/controller/check/x'), 'J-07', other)).toBeNull();
  });

  it('each orchestration repeats it as one extra line beside its unchanged failure marker', () => {
    for (const [file, prefix] of [
      ['run-all.mjs', 'LOCAL_COMPLETION/${journey}'],
      ['run-gate.mjs', 'GATE_COMPLETION/${journey}'],
      ['debug.mjs', 'LOCAL_DEBUG/${journey}'],
      ['repeat.mjs', 'LOCAL_REPEAT/${journey}/${iteration}'],
    ] as const) {
      const source = readFileSync(resolve(E2E, file), 'utf8');
      const marker = source.indexOf(`console.error(\`${prefix}/fail/\${failure.location}/\${failure.errorClass}`);
      const check = source.indexOf(`console.error(\`${prefix}/fail/\${failure.location}/check/\${check}\`)`);
      expect(marker, file).toBeGreaterThan(0);
      expect(check, file).toBeGreaterThan(marker);
      expect(source.match(/collectJourneyCheck\(result, journey, failure\)/gu), file).toHaveLength(1);
    }
  });

  it('leaves the nightly queue reading the failure it always read, and counts the new line without quoting it', () => {
    const before = ['LOCAL_COMPLETION/J-07/start', 'LOCAL_COMPLETION/J-07/fail', `LOCAL_COMPLETION/J-07/fail/${J07_LOCATION}/journey-failure`];
    const after = [...before, `LOCAL_COMPLETION/J-07/fail/${J07_LOCATION}/check/publication-saved`];
    const read = queue.parseGateLog(before.join('\n'));
    const withCheck = queue.parseGateLog(after.join('\n'));
    expect(withCheck.failed).toEqual(read.failed);
    expect(withCheck.unclassified).toBe(read.unclassified + 1);
  });
});

describe('every runner builds its failures the one shared way', () => {
  const runners = [...readdirSync(E2E).filter((file) => /^run-j\d\d\.mjs$/u.test(file)), 'package-export-readiness.mjs'];

  it('no runner builds a Journey failure by hand', () => {
    for (const file of runners) {
      const source = readFileSync(resolve(E2E, file), 'utf8');
      expect(source.match(/new Error\(\s*['`]J-\d\d\//gu), file).toBeNull();
    }
  });

  it('every literal label a runner passes is content-free', () => {
    for (const file of runners) {
      const source = readFileSync(resolve(E2E, file), 'utf8');
      for (const match of source.matchAll(/journeyCheckFailure\('J-\d\d', '([^']*)'/gu)) {
        expect(controller.isContentFreeCheckLabel(match[1]), `${file}: ${match[1]}`).toBe(true);
      }
    }
  });
});
