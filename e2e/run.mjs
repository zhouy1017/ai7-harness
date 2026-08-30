import {
  isAdmittedJourney,
  journeyModuleUrl,
  normalizePnpmArgs,
  reportJourneyFailure,
} from './controller.mjs';

const args = normalizePnpmArgs(process.argv.slice(2));

if (args.length !== 2 || args[0] !== '--journey' || !isAdmittedJourney(args[1])) {
  console.error('E2E/cli');
  process.exitCode = 1;
} else {
  process.argv = [process.argv[0], process.argv[1], '--journey', args[1]];
  try {
    await import(journeyModuleUrl(args[1]));
  } catch {
    reportJourneyFailure(args[1], 'controller');
  }
}
