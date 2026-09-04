import {
  classifyJourneyResult,
  debugArtifactLabel,
  isAdmittedJourney,
  localDebugRefused,
  normalizePnpmArgs,
  runJourneyProcess,
} from './controller.mjs';

// Local Verification Ladder debug layer (ADR 0062). Runs one admitted Journey with the controller-only
// AI7_E2E_LOCAL_DEBUG switch so full-fidelity artifacts land under ignored test-results/. Never a hosted gate.
const args = normalizePnpmArgs(process.argv.slice(2));

if (localDebugRefused()) {
  console.error('LOCAL_DEBUG/cli/refused-in-ci');
  process.exitCode = 1;
} else if (args.length !== 2 || args[0] !== '--journey' || !isAdmittedJourney(args[1])) {
  console.error('LOCAL_DEBUG/cli/usage: pnpm run e2e:debug -- --journey <J-01|J-02|J-08|J-12|J-15|J-03>');
  process.exitCode = 1;
} else {
  const journey = args[1];
  const started = Date.now();
  const result = await runJourneyProcess(journey, { debug: true });
  const seconds = Math.round((Date.now() - started) / 1000);
  const artifacts = result.artifactRoot ? debugArtifactLabel(result.artifactRoot) : '(none)';
  if (result.spawnError || result.code !== 0 || result.signal !== null || result.controllerSignal !== null) {
    const failure = classifyJourneyResult(result, journey);
    console.error(`LOCAL_DEBUG/${journey}/fail/${failure.location}/${failure.errorClass}/${seconds}s`);
    console.error(`LOCAL_DEBUG/${journey}/artifacts/${artifacts}`);
    process.exitCode = result.code || 1;
  } else {
    console.log(`LOCAL_DEBUG/${journey}/pass/${seconds}s`);
    console.log(`LOCAL_DEBUG/${journey}/artifacts/${artifacts}`);
  }
}
