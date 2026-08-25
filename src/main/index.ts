import { installNodeNetworkDenial } from '../shared/network-denial.js';

installNodeNetworkDenial();

void import('./application.js')
  .then(({ runApplication }) => runApplication())
  .catch(async () => {
    const { app } = await import('electron');
    app.exit(1);
  });
