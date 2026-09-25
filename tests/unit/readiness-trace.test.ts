import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Issue #518: the readiness trace a Journey prints when it waits past its budget, read from Playwright's `browser` debug
// log — each line with the time it was written, as a Journey sets that log up — and relayed by the controller only in its
// content-free shape. One case reads a real launch through the installed Playwright, so a channel it never feeds fails.
const trace = (await import(new URL('../../e2e/readiness-trace.mjs', import.meta.url).href)) as {
  STARTUP_LOCATIONS: ReadonlyArray<string>;
  createLaunchTrace(scenario: string, startedAt?: number): Record<string, unknown>;
  readBrowserLog(trace: Record<string, unknown>, text: string): Record<string, unknown>;
  formatReadinessTrace(journey: string, trace: Record<string, unknown>, now?: number): string;
  readReadinessTrace(stderr: string, journey: string): string | null;
};
const controller = (await import(new URL('../../e2e/controller.mjs', import.meta.url).href)) as {
  collectReadinessTrace(result: { stderr: string }, journey: string): string | null;
};

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Playwright's `browser` log with each message at `offset` ms past t = 1000 ms, where the launch begins. */
function logOf(lines: ReadonlyArray<readonly [number, string]>): string {
  return lines.map(([offset, message]) => `${new Date(1_000 + offset).toISOString()} pw:browser ${message}`).join('\n');
}

function launched(lines: ReadonlyArray<readonly [number, string]>): Record<string, unknown> {
  return trace.readBrowserLog(trace.createLaunchTrace('empty-book-first-import', 1_000), logOf(lines));
}

describe('the readiness trace (Issue #518)', () => {
  it('reads a launch that became ready: when it launched, the last startup step, AI7_READY and the exit', () => {
    const launch = launched([
      [2, '<launching> C:\\product\\ai7.exe --remote-debugging-pipe'],
      [9, '<launched> pid=2084'],
      [22, '[pid=2084][out] '],
      [30, '[pid=2084][err] AI7_STARTUP/runtime'],
      [800, '[pid=2084][err] AI7_STARTUP/service-ready'],
      [1_400, '[pid=2084][err] AI7_STARTUP/renderer-first-paint'],
      [1_590, '[pid=2084][err] AI7_STARTUP/readiness-signal'],
      [1_620, '[pid=2084][out] AI7_READY'],
      [2_300, '[pid=2084] <gracefully close start>'],
      [2_310, '[pid=2084] <process did exit: exitCode=0, signal=null>'],
    ]);
    expect(trace.formatReadinessTrace('J-01', launch, 1_000 + 2_400)).toBe(
      'READINESS/J-01/launch=empty-book-first-import;launched=9;last=readiness-signal@1590;ready=1620;failed=none;exit=0@2310;target=no;other=0;age=2400',
    );
  });

  it('says where a launch that never became ready stopped, and only counts the product\'s other words', () => {
    const lines: Array<readonly [number, string]> = [
      [8, '<launched> pid=7'],
      [900, '[pid=7][err] AI7_STARTUP/service-ready'],
      [1_500, '[pid=7][err] AI7_STARTUP/renderer-first-paint'],
      [1_600, '[pid=7][err] [1234:ERROR:gpu_init.cc(1)] something the product said about C:\\Users\\someone'],
      [1_700, '[pid=7][out] 稿件里的一句话'],
      [1_800, '[pid=7][err] AI7_STARTUP/not-a-step'],
    ];
    const launch = launched(lines);
    launch.target = true;
    const line = trace.formatReadinessTrace('J-01', launch, 1_000 + 60_050);
    expect(line).toBe(
      'READINESS/J-01/launch=empty-book-first-import;launched=8;last=renderer-first-paint@1500;ready=none;failed=none;exit=none@none;target=yes;other=3;age=60050',
    );
    expect(line).not.toContain('C:');
    expect(line).not.toContain('稿件');
    // A startup failure main names is kept by its location.
    const failed = launched([...lines,
      [61_000, '[pid=7][err] AI7_STARTUP_FAILED/renderer-first-paint'],
      [61_100, '[pid=7] <process did exit: exitCode=1, signal=null>'],
    ]);
    expect(trace.formatReadinessTrace('J-01', failed, 1_000 + 61_200)).toContain(';failed=renderer-first-paint;exit=1@61100;');
  });

  it('reads only the launch in flight: nothing from before it began, from another process, or without its time', () => {
    const launch = launched([
      // The launch before, from its start: had lines before this launch began been read, it — the first `<launched>` in
      // the log — would be the one read, and its good start would stand in for this launch's stall (#581).
      [-900, '<launched> pid=11'],
      [-600, '[pid=11][err] AI7_STARTUP/service-ready'],
      [-300, '[pid=11][out] AI7_READY'],
      // The launch before, still closing: written before this one began, or by its own process after.
      [-5, '[pid=11][err] AI7_STARTUP/readiness-signal'],
      [3, '[pid=11] <process did exit: exitCode=0, signal=null>'],
      [9, '<launched> pid=12'],
      [40, '[pid=11][out] AI7_READY'],
      [50, '[pid=12][err] AI7_STARTUP/runtime'],
    ]) as Record<string, unknown>;
    const undated = trace.readBrowserLog(launch, 'pw:browser [pid=12][out] AI7_READY\n[pid=12][err] AI7_STARTUP/readiness-signal');
    expect(trace.formatReadinessTrace('J-01', undated, 1_000 + 60_000)).toBe(
      'READINESS/J-01/launch=empty-book-first-import;launched=9;last=runtime@50;ready=none;failed=none;exit=none@none;target=no;other=0;age=60000',
    );
  });

  it('has J-01 mark its target between attaching and waiting for readiness, so a stall there says the target existed (#581)', () => {
    // J-01 runs as it is imported, so the order is read from its source: in `attachRendererTarget`, `onTarget()` follows
    // the attach and comes before the first command the readiness wait sends.
    const source = readFileSync(join(ROOT, 'e2e', 'run-j01.mjs'), 'utf8').replace(/\r\n/gu, '\n');
    const start = source.indexOf('async function attachRendererTarget(');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\n}\n', start));
    const attach = body.indexOf("'Target.attachToTarget'");
    const marked = body.indexOf('onTarget();');
    const waits = body.indexOf("await send('Runtime.enable'");
    const ready = body.indexOf("at('renderer-ready')");
    expect([attach > -1, marked > -1, waits > -1, ready > -1]).toEqual([true, true, true, true]);
    expect(attach < marked && marked < waits && waits < ready).toBe(true);
    expect(body.indexOf('onTarget();', marked + 1)).toBe(-1);
    // Its one caller hands it the mark itself, and nothing else sets the mark (#592). A mark set once
    // `attachRendererTarget` returned would keep the order above and J-01's good launch, yet a stall in the readiness
    // wait would say `target=no` of a target that attached.
    const calls = [...source.matchAll(/(?<!function )attachRendererTarget\(/gu)].map((match) => match.index);
    expect(calls).toHaveLength(1);
    const call = source.slice(calls[0], source.indexOf(');', calls[0]) + 2);
    // Whatever the layout: arguments over several lines, other spacing, a trailing comma (#602).
    expect(call).toMatch(/^attachRendererTarget\s*\(\s*browser\s*,\s*\(\)\s*=>\s*\{\s*inFlight\.target\s*=\s*true\s*;?\s*\}\s*,?\s*\);$/u);
    // Every write of the mark, whatever its spacing or the name it goes through, is one of two: the trace's copy of it
    // and that callback (#602). The record starts without it.
    expect((source.match(/\.target\s*=(?!=)/gu) ?? []).length).toBe(2);
    expect(source.match(/\btrace\.target\s*=\s*launchInFlight\.target\s*;/gu)).toHaveLength(1);
    expect((source.match(/\btarget\s*:\s*(?:true|false)\b/gu) ?? []).map((text) => text.replace(/\s+/gu, ''))).toEqual(['target:false']);
  });

  it('keeps a Windows exit status whole, and relays it', () => {
    const launch = launched([[9, '<launched> pid=3'], [700, '[pid=3] <process did exit: exitCode=3221225477, signal=null>']]);
    const line = trace.formatReadinessTrace('J-01', launch, 1_000 + 800);
    expect(line).toContain(';exit=3221225477@700;');
    expect(trace.readReadinessTrace(line, 'J-01')).toBe(line.slice('READINESS/J-01/'.length));
    // Longer than any exit status: not read as one.
    const longer = launched([[9, '<launched> pid=3'], [700, '[pid=3] <process did exit: exitCode=32212254770, signal=null>']]);
    expect(trace.formatReadinessTrace('J-01', longer, 1_000 + 800)).toContain(';exit=none@none;');
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

  it('reads a real launch through the installed Playwright\'s browser log, set up as J-01 sets it up', () => {
    // Node stands in for the product: it says two startup steps and something else, prints AI7_READY and exits. Playwright
    // launches it as J-01 launches the product, and the launch then fails, since nothing answers on the pipe.
    const root = mkdtempSync(join(tmpdir(), 'ai7-readiness-trace-'));
    try {
      const product = join(root, 'product.mjs');
      writeFileSync(product, [
        "process.stderr.write('AI7_STARTUP/runtime\\n');",
        "process.stderr.write('something the product said\\n');",
        "process.stderr.write('AI7_STARTUP/readiness-signal\\n');",
        "process.stdout.write('AI7_READY\\n', () => setTimeout(() => process.exit(0), 100));",
      ].join('\n'));
      const launcher = join(root, 'launcher.mjs');
      writeFileSync(launcher, [
        "import { join } from 'node:path';",
        "import { pathToFileURL } from 'node:url';",
        'const [product, checkout] = process.argv.slice(2);',
        "const { chromium } = await import(pathToFileURL(join(checkout, 'node_modules', 'playwright-core', 'index.mjs')).href);",
        'await chromium.launch({ executablePath: process.execPath, ignoreDefaultArgs: true, args: [product], timeout: 30_000 }).catch(() => undefined);',
      ].join('\n'));
      const log = join(root, 'playwright-browser.log');
      const startedAt = Date.now();
      const run = spawnSync(process.execPath, [launcher, product, ROOT], {
        env: { ...process.env, DEBUG: 'pw:browser', DEBUG_FILE: log, DEBUG_COLORS: 'no' },
        encoding: 'utf8',
        timeout: 60_000,
      });
      expect(run.status).toBe(0);
      const read = trace.readBrowserLog(trace.createLaunchTrace('real-launch', startedAt), readFileSync(log, 'utf8'));
      expect(read).toMatchObject({ last: 'readiness-signal', failed: null, exitCode: '0' });
      for (const field of ['launched', 'lastAt', 'ready', 'exited']) expect(read[field]).not.toBeNull();
      expect(read.other).toBeGreaterThanOrEqual(1);
      expect(trace.formatReadinessTrace('J-01', read)).not.toContain('said');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
