import {
  GATE_JOURNEYS,
  classifyJourneyResult,
  localOnlySkips,
  normalizePnpmArgs,
  runJourneyProcess,
} from './controller.mjs';

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
    if (result.spawnError || result.code !== 0 || result.signal !== null) {
      console.error(`GATE_COMPLETION/${journey}/fail`);
      const failure = classifyJourneyResult(result, journey);
      console.error(`GATE_COMPLETION/${journey}/fail/${failure.location}/${failure.errorClass}`);
      process.exitCode = result.code || 1;
      break;
    }
    console.log(`GATE_COMPLETION/${journey}/pass`);
    // A local-only scenario whose input is absent from the checkout (ADR 0079 §5) is disclosed as
    // skipped, never reported as passed.
    for (const scenario of localOnlySkips(result, journey)) {
      console.log(`GATE_COMPLETION/${journey}/local-only-skip/${scenario}`);
    }
  }
  if (!process.exitCode) console.log('GATE_COMPLETION/gate/pass');
}
