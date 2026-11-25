import { taskDispatchSuite } from '../support/task-dispatch-suite.js';

// One-step launch of the baseline, custom-analysis and writing tasks (#1621; the cases and their helpers are tests/support/task-dispatch-suite.ts, the former task-dispatch-launch.test.ts).
taskDispatchSuite('one-step-analysis');
