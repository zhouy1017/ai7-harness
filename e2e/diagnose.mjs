import {
  isAdmittedJourney,
  isAdmittedLocation,
  normalizePnpmArgs,
  runJourneyProcess,
} from './controller.mjs';

function safeFailure(result, journey) {
  if (result.spawnError) return { location: 'controller', errorClass: 'controller-spawn' };
  if (result.controllerSignal !== null) {
    return { location: 'controller', errorClass: 'controller-signal' };
  }
  if (result.signal !== null) return { location: 'controller', errorClass: 'controller-child-signal' };
  if (result.outputOverflow) return { location: 'controller', errorClass: 'controller-output-ambiguous' };

  const locations = result.stderr
    .split(/\r?\n/u)
    .map((line) => {
      const prefix = `${journey}/`;
      if (!line.startsWith(prefix)) return null;
      const location = line.slice(prefix.length);
      return isAdmittedLocation(journey, location) ? location : null;
    })
    .filter((location) => location !== null);

  if (locations.length === 1) return { location: locations[0], errorClass: 'journey-failure' };
  if (result.stdout.length === 0 && result.stderr.length === 0) {
    return { location: 'controller', errorClass: 'controller-exit' };
  }
  return { location: 'controller', errorClass: 'controller-output-ambiguous' };
}

const args = normalizePnpmArgs(process.argv.slice(2));
if (args.length !== 2 || args[0] !== '--journey' || !isAdmittedJourney(args[1])) {
  console.error('LOCAL_DIAGNOSTIC_ONLY/cli/not-completion');
  process.exitCode = 1;
} else {
  const journey = args[1];
  console.log(`LOCAL_DIAGNOSTIC_ONLY/${journey}/start/not-completion`);
  const result = await runJourneyProcess(journey);
  if (result.spawnError || result.code !== 0 || result.signal !== null || result.controllerSignal !== null) {
    const failure = safeFailure(result, journey);
    console.error(
      `LOCAL_DIAGNOSTIC_ONLY/${journey}/${failure.location}/${failure.errorClass}/not-completion`,
    );
    process.exitCode = result.code || 1;
  } else {
    console.log(`LOCAL_DIAGNOSTIC_ONLY/${journey}/pass/not-completion`);
  }
}
