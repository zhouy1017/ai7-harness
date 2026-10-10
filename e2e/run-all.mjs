import {
  ADMITTED_JOURNEYS,
  classifyJourneyResult,
  collectJourneyCheck,
  collectReadinessTrace,
  collectJourneyDisclosures,
  journeyElapsedSegment,
  normalizePnpmArgs,
  runJourneyProcess,
} from './controller.mjs';

// A scenario a Journey skipped because its local-only material is absent is named here rather than
// left invisible, so a completion result always says what it did not cover (ADR 0079 §5).
const reportDisclosures = (journey, result) => {
  for (const disclosure of collectJourneyDisclosures(result, journey)) {
    console.log(`LOCAL_COMPLETION/${journey}/disclosed-skip/${disclosure}`);
  }
};

const args = normalizePnpmArgs(process.argv.slice(2));
if (args.length !== 0) {
  console.error('E2E_ALL/cli');
  process.exitCode = 1;
} else {
  for (const journey of ADMITTED_JOURNEYS) {
    console.log(`LOCAL_COMPLETION/${journey}/start`);
    const startedAt = performance.now();
    const result = await runJourneyProcess(journey);
    // Issue #746: each Journey's wall time rides on its pass or fail line, so one Journey's time is
    // measurable from a guest report rather than only the whole `e2e:all` layer's.
    const elapsed = journeyElapsedSegment(performance.now() - startedAt);
    if (result.controllerSignal !== null) {
      console.error(`LOCAL_COMPLETION/${journey}/interrupted`);
      process.exitCode = result.controllerSignal === 'SIGINT' ? 130 : 143;
      break;
    }
    reportDisclosures(journey, result);
    if (result.spawnError || result.code !== 0 || result.signal !== null) {
      console.error(`LOCAL_COMPLETION/${journey}/fail/${elapsed}`);
      // The child's own stage line, reduced to the admitted-location vocabulary, so a sequenced
      // failure names where it stopped. Failure path only: a passing run prints none of these.
      const failure = classifyJourneyResult(result, journey);
      console.error(`LOCAL_COMPLETION/${journey}/fail/${failure.location}/${failure.errorClass}`);
      // Issue #652: which check in that stage failed, as the child named it: a content-free label, never page text.
      const check = collectJourneyCheck(result, journey, failure);
      if (check !== null) console.error(`LOCAL_COMPLETION/${journey}/fail/${failure.location}/check/${check}`);
      const readiness = collectReadinessTrace(result, journey);
      if (readiness !== null) console.error(`LOCAL_COMPLETION/${journey}/readiness/${readiness}`);
      process.exitCode = result.code || 1;
      break;
    }
    console.log(`LOCAL_COMPLETION/${journey}/pass/${elapsed}`);
  }
  if (!process.exitCode) console.log('LOCAL_COMPLETION/all/pass');
}
