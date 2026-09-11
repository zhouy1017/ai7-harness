import {
  GATE_JOURNEYS,
  classifyJourneyResult,
  collectJourneyDisclosures,
  normalizePnpmArgs,
  runJourneyProcess,
} from './controller.mjs';

// The same disclosure rule the nightly applies: a scenario skipped for absent local-only material
// is named beside the Journey's result rather than left invisible (ADR 0079 §5).
const reportDisclosures = (journey, result) => {
  for (const disclosure of collectJourneyDisclosures(result, journey)) {
    console.log(`GATE_COMPLETION/${journey}/disclosed-skip/${disclosure}`);
  }
};

// The bounded pull-request Gate sequence under ADR 0075. It is `run-all.mjs` over GATE_JOURNEYS
// rather than ADMITTED_JOURNEYS, with its own marker vocabulary so a Gate result can never be read
// as, or reported as, Local completion over the full admitted set.
const args = normalizePnpmArgs(process.argv.slice(2));
if (args.length !== 0) {
  console.error('E2E_GATE/cli');
  process.exitCode = 1;
} else {
  for (const journey of GATE_JOURNEYS) {
    console.log(`GATE_COMPLETION/${journey}/start`);
    const result = await runJourneyProcess(journey);
    if (result.controllerSignal !== null) {
      console.error(`GATE_COMPLETION/${journey}/interrupted`);
      process.exitCode = result.controllerSignal === 'SIGINT' ? 130 : 143;
      break;
    }
    reportDisclosures(journey, result);
    if (result.spawnError || result.code !== 0 || result.signal !== null) {
      console.error(`GATE_COMPLETION/${journey}/fail`);
      const failure = classifyJourneyResult(result, journey);
      console.error(`GATE_COMPLETION/${journey}/fail/${failure.location}/${failure.errorClass}`);
      process.exitCode = result.code || 1;
      break;
    }
    console.log(`GATE_COMPLETION/${journey}/pass`);
  }
  if (!process.exitCode) console.log('GATE_COMPLETION/gate/pass');
}
