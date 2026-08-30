import { ADMITTED_JOURNEYS, normalizePnpmArgs, runJourneyProcess } from './controller.mjs';

const args = normalizePnpmArgs(process.argv.slice(2));
if (args.length !== 0) {
  console.error('E2E_ALL/cli');
  process.exitCode = 1;
} else {
  for (const journey of ADMITTED_JOURNEYS) {
    console.log(`LOCAL_COMPLETION/${journey}/start`);
    const result = await runJourneyProcess(journey);
    if (result.spawnError || result.code !== 0 || result.signal !== null || result.controllerSignal !== null) {
      console.error(`LOCAL_COMPLETION/${journey}/fail`);
      process.exitCode = result.code || 1;
      break;
    }
    console.log(`LOCAL_COMPLETION/${journey}/pass`);
  }
  if (!process.exitCode) console.log('LOCAL_COMPLETION/all/pass');
}
