import { taskDispatchSuite } from '../support/task-dispatch-suite.js';

// Launch lifecycle across kinds: legacy labels, restart, development-ci routing and previews (#1621; the cases and their helpers are tests/support/task-dispatch-suite.ts, the former task-dispatch-launch.test.ts).
taskDispatchSuite('lifecycle');
