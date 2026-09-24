import { describe, expect, it } from 'vitest';

// Issue #518: the readiness trace a Journey prints when it waits past its budget, read from Playwright's `browser` log
// lines exactly as the debug layer records them, and relayed by the controller only in its content-free shape.
const trace = (await import(new URL('../../e2e/readiness-trace.mjs', import.meta.url).href)) as {
  STARTUP_LOCATIONS: ReadonlyArray<string>;
  createLaunchTrace(scenario: string, startedAt?: number): Record<string, unknown>;
  observeBrowserLog(trace: Record<string, unknown>, message: string, now?: number): void;
  formatReadinessTrace(journey: string, trace: Record<string, unknown>, now?: number): string;
  readReadinessTrace(stderr: string, journey: string): string | null;
};
const controller = (await import(new URL('../../e2e/controller.mjs', import.meta.url).href)) as {
  collectReadinessTrace(result: { stderr: string }, journey: string): string | null;
};

/** A launch at t = 1000 ms, fed the given `[offset, line]` pairs. */
function launched(lines: ReadonlyArray<readonly [number, string]>) {
  const launch = trace.createLaunchTrace('empty-book-first-import', 1_000);
  for (const [offset, line] of lines) trace.observeBrowserLog(launch, line, 1_000 + offset);
  return launch;
}

describe('the readiness trace (Issue #518)', () => {
  it('reads a launch that became ready: when it launched, the last startup step, AI7_READY and the exit', () => {
    const launch = launched([
      [9, '<launched> pid=2084'],
      [22, '[pid=2084][out] '],
      [30, '[pid=2084][err] AI7_STARTUP/runtime'],
      [800, '[pid=2084][err] AI7_STARTUP/service-ready'],
      [1_400, '[pid=2084][err] AI7_STARTUP/renderer-first-paint'],
      [1_590, '[pid=2084][err] AI7_STARTUP/readiness-signal'],
      [1_620, '[pid=2084][out] AI7_READY'],
      [2_310, '[pid=2084] <process did exit: exitCode=0, signal=null>'],
    ]);
    expect(trace.formatReadinessTrace('J-01', launch, 1_000 + 2_400)).toBe(
      'READINESS/J-01/launch=empty-book-first-import;launched=9;last=readiness-signal@1590;ready=1620;failed=none;exit=0@2310;target=no;other=0;age=2400',
    );
  });

  it('says where a launch that never became ready stopped, and only counts the product\'s other words', () => {
    const launch = launched([
      [8, '<launched> pid=7'],
      [900, '[pid=7][err] AI7_STARTUP/service-ready'],
      [1_500, '[pid=7][err] AI7_STARTUP/renderer-first-paint'],
      [1_600, '[pid=7][err] [1234:ERROR:gpu_init.cc(1)] something the product said about C:\\Users\\someone'],
      [1_700, '[pid=7][out] 稿件里的一句话'],
      [1_800, '[pid=7][err] AI7_STARTUP/not-a-step'],
    ]);
    launch.target = true;
    const line = trace.formatReadinessTrace('J-01', launch, 1_000 + 60_050);
    expect(line).toBe(
      'READINESS/J-01/launch=empty-book-first-import;launched=8;last=renderer-first-paint@1500;ready=none;failed=none;exit=none@none;target=yes;other=3;age=60050',
    );
    expect(line).not.toContain('C:');
    expect(line).not.toContain('稿件');
    // A startup failure main names is kept by its location.
    trace.observeBrowserLog(launch, '[pid=7][err] AI7_STARTUP_FAILED/renderer-first-paint', 1_000 + 61_000);
    trace.observeBrowserLog(launch, '[pid=7] <process did exit: exitCode=1, signal=null>', 1_000 + 61_100);
    expect(trace.formatReadinessTrace('J-01', launch, 1_000 + 61_200)).toContain(';failed=renderer-first-paint;exit=1@61100;');
  });

  it('relays only a trace of exactly its content-free shape, and only one', () => {
    const line = trace.formatReadinessTrace('J-01', launched([[9, '<launched> pid=1']]), 1_000 + 60_000);
    const fields = line.slice('READINESS/J-01/'.length);
    expect(trace.readReadinessTrace(`J-01/renderer-ready\n${line}\n`, 'J-01')).toBe(fields);
    expect(controller.collectReadinessTrace({ stderr: `${line}\r\n` }, 'J-01')).toBe(fields);
    // Another Journey's, a longer one, a step main never names, or two of them: none.
    expect(trace.readReadinessTrace(line, 'J-02')).toBeNull();
    expect(trace.readReadinessTrace(`${line};path=C:\\data`, 'J-01')).toBeNull();
    expect(trace.readReadinessTrace(line.replace('last=none', 'last=稿件'), 'J-01')).toBeNull();
    expect(trace.readReadinessTrace(`${line}\n${line}`, 'J-01')).toBeNull();
    expect(trace.readReadinessTrace('J-01/renderer-ready', 'J-01')).toBeNull();
    // Every step main can reach is a word the relay accepts.
    for (const location of trace.STARTUP_LOCATIONS) {
      expect(trace.readReadinessTrace(line.replace('last=none', `last=${location}`), 'J-01')).not.toBeNull();
    }
  });
});
