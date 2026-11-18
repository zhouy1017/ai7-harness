import './production-documents.cases.js';

import { afterAll } from 'vitest';
import { evaluationSchemaTiming } from '../../../support/domain/evaluation.js';
afterAll(() => { console.info(`DOMAIN/production-documents/schema builds=${evaluationSchemaTiming.builds} ms=${evaluationSchemaTiming.milliseconds.toFixed(1)}`); });
