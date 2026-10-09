import { installNodeNetworkDenial } from '../shared/network-denial.js';

// The two steps main takes before its application runs, said on stderr under an E2E Journey (Issues #518, #675), so a
// launch that never reaches `runtime` tells a product that never ran its script from one that stopped inside it.
const journeyStartup = (location: string): void => {
  if (process.env.AI7_E2E_JOURNEY !== undefined) process.stderr.write(`AI7_STARTUP/${location}\n`);
};

journeyStartup('network-denial');
try {
  installNodeNetworkDenial();
} catch {
  process.stderr.write('AI7_STARTUP_FAILED/network-denial\n');
  process.exitCode = 1;
}

if (process.exitCode !== 1) {
  journeyStartup('application-import');
  void import('./application.js')
    .then(({ runApplication }) => runApplication())
    .catch(async () => {
      process.stderr.write('AI7_STARTUP_FAILED/application-import\n');
      const { app } = await import('electron');
      app.exit(1);
    });
}
