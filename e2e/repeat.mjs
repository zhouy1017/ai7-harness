import { rm } from 'node:fs/promises';
import {
  classifyJourneyResult,
  debugArtifactLabel,
  isAdmittedJourney,
  localDebugRefused,
  normalizePnpmArgs,
  runJourneyProcess,
} from './controller.mjs';

// Local Verification Ladder repeat layer (ADR 0062): run one admitted Journey up to N times in local debug
// mode, stop at the first failure, and keep only that run's artifacts. Intended for intermittent failures.
const MAX_TIMES = 100;
const args = normalizePnpmArgs(process.argv.slice(2));

function parseArgs(values) {
  if (values.length !== 4) return null;
  let journey;
  let times;
  for (let index = 0; index < values.length; index += 2) {
    if (values[index] === '--journey') journey = values[index + 1];
    else if (values[index] === '--times') times = Number(values[index + 1]);
    else return null;
  }
  if (!isAdmittedJourney(journey)) return null;
  if (!Number.isInteger(times) || times < 1 || times > MAX_TIMES) return null;
  return { journey, times };
}

const parsed = parseArgs(args);

if (localDebugRefused()) {
  console.error('LOCAL_REPEAT/cli/refused-in-ci');
  process.exitCode = 1;
} else if (parsed === null) {
  console.error(`LOCAL_REPEAT/cli/usage: pnpm run e2e:repeat -- --journey <J-01|J-02|J-08|J-12|J-15|J-03> --times <1..${MAX_TIMES}>`);
  process.exitCode = 1;
} else {
  const { journey, times } = parsed;
  let passed = 0;
  for (let iteration = 1; iteration <= times; iteration += 1) {
    const started = Date.now();
    const result = await runJourneyProcess(journey, { debug: true });
    const seconds = Math.round((Date.now() - started) / 1000);
    const failed = result.spawnError || result.code !== 0 || result.signal !== null || result.controllerSignal !== null;
    if (failed) {
      const failure = classifyJourneyResult(result, journey);
      console.error(`LOCAL_REPEAT/${journey}/${iteration}/fail/${failure.location}/${failure.errorClass}/${seconds}s`);
      console.error(`LOCAL_REPEAT/${journey}/artifacts/${result.artifactRoot ? debugArtifactLabel(result.artifactRoot) : '(none)'}`);
      process.exitCode = result.controllerSignal !== null ? 130 : result.code || 1;
      break;
    }
    passed += 1;
    console.log(`LOCAL_REPEAT/${journey}/${iteration}/pass/${seconds}s`);
    if (result.artifactRoot) await rm(result.artifactRoot, { recursive: true, force: true });
  }
  if (!process.exitCode) console.log(`LOCAL_REPEAT/${journey}/all/pass/${passed}`);
}
