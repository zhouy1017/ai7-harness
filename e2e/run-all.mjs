import {
  ADMITTED_JOURNEYS,
  classifyJourneyResult,
  collectJourneyDisclosures,
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
    const result = await runJourneyProcess(journey);
    if (result.controllerSignal !== null) {
      console.error(`LOCAL_COMPLETION/${journey}/interrupted`);
      process.exitCode = result.controllerSignal === 'SIGINT' ? 130 : 143;
      break;
    }
    reportDisclosures(journey, result);
    if (result.spawnError || result.code !== 0 || result.signal !== null) {
      console.error(`LOCAL_COMPLETION/${journey}/fail`);
      // The child's own stage line, reduced to the admitted-location vocabulary, so a sequenced
      // failure names where it stopped. Failure path only: a passing run's output is unchanged.
      const failure = classifyJourneyResult(result, journey);
      console.error(`LOCAL_COMPLETION/${journey}/fail/${failure.location}/${failure.errorClass}`);
      process.exitCode = result.code || 1;
      break;
    }
    console.log(`LOCAL_COMPLETION/${journey}/pass`);
  }
  if (!process.exitCode) console.log('LOCAL_COMPLETION/all/pass');
}
