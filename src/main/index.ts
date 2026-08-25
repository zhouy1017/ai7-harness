import { installNodeNetworkDenial } from '../shared/network-denial.js';

try {
  installNodeNetworkDenial();
} catch {
  process.stderr.write('AI7_STARTUP_FAILED/network-denial\n');
  process.exitCode = 1;
}

if (process.exitCode !== 1) {
  void import('./application.js')
    .then(({ runApplication }) => runApplication())
    .catch(async () => {
      process.stderr.write('AI7_STARTUP_FAILED/application-import\n');
      const { app } = await import('electron');
      app.exit(1);
    });
}
