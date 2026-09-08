import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// `e2e/*.mjs` is runner infrastructure outside the typed program (`allowJs: false`), so it is loaded
// through a runtime specifier the compiler does not resolve and typed at this boundary.
type JourneyLocations = Readonly<Record<string, readonly string[]>>;

const controller = (await import(new URL('../../e2e/controller.mjs', import.meta.url).href)) as {
  ADMITTED_JOURNEYS: readonly string[];
  JOURNEY_LOCATIONS: JourneyLocations;
  createJ01CompletionLocation: (scenario: string) => (phase: string) => string;
};
const { ADMITTED_JOURNEYS, JOURNEY_LOCATIONS, createJ01CompletionLocation } = controller;

const E2E_ROOT = fileURLToPath(new URL('../../e2e/', import.meta.url));

const RUNNER_FILES: Readonly<Record<string, string>> = Object.freeze({
  'J-01': 'run-j01.mjs',
  'J-02': 'run-j02.mjs',
  'J-08': 'run-j08.mjs',
  'J-12': 'run-j12.mjs',
  'J-15': 'run-j15.mjs',
  'J-03': 'run-j03.mjs',
  'J-04': 'run-j04.mjs',
});

/*
 * Every one of the seven runners shares one failure-reporting mechanism, confirmed by reading each
 * runner's terminal `main().catch(...)` handler: it always calls `reportJourneyFailure(journey,
 * <the module-level variable at() last set>, error)`. `requireJourney`, `assertRenderer`, `waitFor`
 * and `clickExactButton` only build the thrown `Error`'s message from their own `name`/`location`
 * argument; none of them calls `at()`, so that argument never reaches `reportJourneyFailure` and is
 * not a candidate location. Only `at(...)` arguments are ever reportable, in three source forms:
 *   - a string literal, taken as is;
 *   - a template literal, taken as its literal prefix before the first `${` (the controller matches
 *     `isAdmittedLocation` on the exact final string, so the prefix is asserted as a prefix of some
 *     listed location rather than reconstructed);
 *   - a variable, ternary, or small local factory, traced to the finite set of literals assigned to
 *     it in the same runner file.
 * A form this file cannot trace is collected and reported by name — the subset assertion below fails
 * loudly on it rather than skipping it.
 */

const AT_CALL = /(?<!function )(?<![.\w])at\((.+)\);/gu;

function extractAtCallArguments(source: string): string[] {
  return [...source.matchAll(AT_CALL)].map((match) => match[1]?.trim() ?? '');
}

type AtArgument =
  | { kind: 'literal'; value: string }
  | { kind: 'template'; prefix: string }
  | { kind: 'ternary'; values: readonly [string, string] }
  | { kind: 'identifier'; name: string }
  | { kind: 'call'; expression: string };

function classifyAtArgument(argument: string): AtArgument {
  const literal = /^'([^']*)'$/u.exec(argument);
  if (literal !== null && literal[1] !== undefined) return { kind: 'literal', value: literal[1] };
  const template = /^`([^`$]*)\$\{/u.exec(argument);
  if (template !== null && template[1] !== undefined) return { kind: 'template', prefix: template[1] };
  const ternary = /^.+?\?\s*'([^']*)'\s*:\s*'([^']*)'$/u.exec(argument);
  if (ternary !== null && ternary[1] !== undefined && ternary[2] !== undefined) {
    return { kind: 'ternary', values: [ternary[1], ternary[2]] };
  }
  const identifier = /^[A-Za-z_$][\w$]*$/u.exec(argument);
  if (identifier !== null) return { kind: 'identifier', name: identifier[0] };
  return { kind: 'call', expression: argument };
}

function escapeForRegExp(identifier: string): string {
  return identifier.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

// A bare `at(x)` where `x` is assigned a literal or a `cond ? 'a' : 'b'` ternary directly, anywhere
// in the same file — covers `run-j01.mjs`'s `diagnosticReviewLocation` option and `run-j02.mjs`'s
// `waitForRendererReady` ternary-assigned `location`.
function traceDirectAssignment(source: string, identifier: string): string[] {
  const escaped = escapeForRegExp(identifier);
  const literals = new Set<string>();
  const ternary = new RegExp(`${escaped}\\s*[:=]\\s*[^;,]*?\\?\\s*'([^']*)'\\s*:\\s*'([^']*)'`, 'gu');
  for (const match of source.matchAll(ternary)) {
    if (match[1] !== undefined) literals.add(match[1]);
    if (match[2] !== undefined) literals.add(match[2]);
  }
  const direct = new RegExp(`${escaped}\\s*[:=]\\s*'([^']*)'`, 'gu');
  for (const match of source.matchAll(direct)) {
    if (match[1] !== undefined) literals.add(match[1]);
  }
  return [...literals];
}

// A bare `at(x)` where `x` is the sole parameter of a local single-parameter wrapper that forwards
// to `at(x)` itself — covers `run-j01.mjs`'s `atPrimaryReviewStage`, which gates a handful of
// `at()` calls behind `usePrimaryReviewDiagnostics` without changing the argument shape.
function traceForwarderWrapper(source: string, parameter: string): string[] | null {
  const escaped = escapeForRegExp(parameter);
  const definition = new RegExp(
    `const (\\w+) = \\(${escaped}\\) => \\{[^}]*\\bat\\(${escaped}\\)[^}]*\\};`,
    'u',
  ).exec(source);
  if (definition === null || definition[1] === undefined) return null;
  const wrapperName = definition[1];
  const calls = new RegExp(`\\b${wrapperName}\\('([^']+)'\\)`, 'gu');
  return [...source.matchAll(calls)].map((match) => match[1] ?? '');
}

// `at(x)` where `x` only ever restores a previously-set, already-validated location — covers
// `run-j01.mjs`'s `duringCompletionPhase`, which saves `diagnosticLocation` into `previousLocation`
// before a nested `at()` call and restores it afterwards. Contributes no new candidate location.
function isRestoreOfTrackedLocation(source: string, identifier: string): boolean {
  const escaped = escapeForRegExp(identifier);
  return new RegExp(`const ${escaped}\\s*=\\s*(?:diagnosticLocation|location)\\s*;`, 'u').test(source);
}

// `run-j02.mjs` maps a startup-failure token to one of ten fixed locations; `at()` reports whichever
// one the child process's own failure message named. Read the finite set straight out of the same
// frozen array the runner filters at runtime, rather than re-typing it here.
function traceStartupFailureMarkers(source: string): string[] {
  const block = /STARTUP_FAILURE_MARKERS = Object\.freeze\(\[([\s\S]*?)\]\);/u.exec(source);
  if (block === null || block[1] === undefined) return [];
  return [...block[1].matchAll(/'AI7_STARTUP_FAILED\/[^']+',\s*'([^']+)'/gu)].map(
    (match) => match[1] ?? '',
  );
}

interface Extraction {
  literals: string[];
  templatePrefixes: string[];
  tracedLiterals: string[];
  untraced: string[];
}

function extractReportableLocations(source: string): Extraction {
  const literals: string[] = [];
  const templatePrefixes: string[] = [];
  const tracedLiterals: string[] = [];
  const untraced: string[] = [];

  for (const raw of extractAtCallArguments(source)) {
    const classified = classifyAtArgument(raw);
    switch (classified.kind) {
      case 'literal':
        literals.push(classified.value);
        break;
      case 'template':
        templatePrefixes.push(classified.prefix);
        break;
      case 'ternary':
        tracedLiterals.push(...classified.values);
        break;
      case 'identifier': {
        const forwarded = traceForwarderWrapper(source, classified.name);
        if (forwarded !== null && forwarded.length > 0) {
          tracedLiterals.push(...forwarded);
          break;
        }
        const assigned = traceDirectAssignment(source, classified.name);
        if (assigned.length > 0) {
          tracedLiterals.push(...assigned);
          break;
        }
        if (isRestoreOfTrackedLocation(source, classified.name)) break;
        untraced.push(`identifier '${classified.name}' (no traceable assignment found)`);
        break;
      }
      case 'call': {
        if (classified.expression.startsWith('createJ01CompletionLocation(')) {
          // Exempt: `createJ01CompletionLocation` is imported from this same controller module and
          // throws unless `scenario`/`phase` are already admitted J-01 completion phases, so its
          // output is a member of `JOURNEY_LOCATIONS['J-01']` by the factory's own contract — proven
          // separately below rather than re-derived here from source text.
          break;
        }
        if (classified.expression === 'startupLocations.values().next().value') {
          tracedLiterals.push(...traceStartupFailureMarkers(source));
          break;
        }
        untraced.push(`call expression '${classified.expression}' (no traced form recognised)`);
        break;
      }
      default: {
        const exhaustive: never = classified;
        untraced.push(`unrecognised at() argument shape: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  return { literals, templatePrefixes, tracedLiterals, untraced };
}

function subsetViolations(source: string, admitted: readonly string[]): string[] {
  const { literals, templatePrefixes, tracedLiterals, untraced } = extractReportableLocations(source);
  const violations: string[] = [];
  for (const name of [...literals, ...tracedLiterals]) {
    if (!admitted.includes(name)) violations.push(`'${name}' is not listed`);
  }
  for (const prefix of templatePrefixes) {
    if (!admitted.some((location) => location.startsWith(prefix))) {
      violations.push(`no listed location starts with the template prefix '${prefix}'`);
    }
  }
  for (const reason of untraced) violations.push(`untraceable at() argument: ${reason}`);
  return violations;
}

describe('every admitted Journey lists every stage its runner can report', () => {
  for (const journey of ADMITTED_JOURNEYS) {
    it(`${journey}: every at() location, literal, template-prefix, and traced-variable, is admitted`, () => {
      const runnerFile = RUNNER_FILES[journey];
      expect(runnerFile, `no runner file mapped for ${journey}`).toBeDefined();
      const admitted = JOURNEY_LOCATIONS[journey];
      expect(admitted, `JOURNEY_LOCATIONS has no entry for ${journey}`).toBeDefined();
      const source = readFileSync(resolve(E2E_ROOT, runnerFile as string), 'utf8');
      const violations = subsetViolations(source, admitted as readonly string[]);
      expect(violations, `${journey} (${runnerFile}):\n${violations.join('\n')}`).toEqual([]);
    });
  }
});

describe('J-01: createJ01CompletionLocation is self-admitting, so at(createJ01CompletionLocation(...)(...)) needs no source-text trace', () => {
  it('produces a location JOURNEY_LOCATIONS[J-01] already lists', () => {
    const location = createJ01CompletionLocation('reimport')('imported-transition');
    expect(JOURNEY_LOCATIONS['J-01']).toContain(location);
  });

  it('refuses a scenario or phase that is not admitted, before any at() call could report it', () => {
    expect(() => createJ01CompletionLocation('not-a-real-scenario')).toThrow(TypeError);
    expect(() => createJ01CompletionLocation('reimport')('not-a-real-phase')).toThrow(TypeError);
  });
});

describe('extraction catches an unlisted at() location, one fixture per form', () => {
  const admitted = ['entry', 'known-stage'];

  it('a string literal', () => {
    const violations = subsetViolations(`at('unlisted-literal-stage');`, admitted);
    expect(violations).toEqual([`'unlisted-literal-stage' is not listed`]);
  });

  it('a template literal, checked by its fixed prefix', () => {
    const violations = subsetViolations('at(`unlisted-prefix-${scenario}-suffix`);', admitted);
    expect(violations).toEqual([`no listed location starts with the template prefix 'unlisted-prefix-'`]);
  });

  it('a traced variable, assigned by a ternary in the same file', () => {
    const source = `
      const outcome = flag ? 'known-stage' : 'unlisted-branch-stage';
      at(outcome);
    `;
    const violations = subsetViolations(source, admitted);
    expect(violations).toEqual([`'unlisted-branch-stage' is not listed`]);
  });
});
