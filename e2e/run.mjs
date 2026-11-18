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
  // A run asked for an E2E-only window size says so (only a size the product accepts), so its output cannot be read as a native-size run.
  if (/^[1-9]\d*x[1-9]\d*$/u.test(process.env.AI7_E2E_WINDOW ?? '')) console.log(`E2E_WINDOW/${args[1]}/${process.env.AI7_E2E_WINDOW}`);
  try {
    await import(journeyModuleUrl(args[1]));
  } catch {
    reportJourneyFailure(args[1], 'controller');
  }
}
