import './house-review-preference.cases.js';
import './editorial-learning-adoption.cases.js';
import './schema.cases.js';
import './eligibility.cases.js';
import './governance.cases.js';

import { afterAll } from 'vitest';
import { memorySchemaTiming } from '../../../support/domain/editorial-memory.js';
afterAll(() => { console.info(`DOMAIN/editorial-memory/schema builds=${memorySchemaTiming.builds} ms=${memorySchemaTiming.milliseconds.toFixed(1)}`); });
