import './calibration.cases.js';
import './market.cases.js';
import './readers-report-exemplars.cases.js';

import { afterAll } from 'vitest';
import { evaluationSchemaTiming } from '../../../support/domain/evaluation.js';
afterAll(() => { console.info(`DOMAIN/evaluation/schema builds=${evaluationSchemaTiming.builds} ms=${evaluationSchemaTiming.milliseconds.toFixed(1)}`); });
