import { renderReport } from './modules/report/day-report.js';
import { replay } from './modules/replay/replay-engine.js';
import { ACCOUNTS, EVENT_STREAM } from './modules/replay/scenario.js';

/**
 * Replays the event stream of the brief and prints the six day report.
 *
 * The whole program. There is no configuration, no input and no clock. The scenario is data.
 * The engine is a pure function of that data. Two runs produce identical output.
 */
function main(): void {
  process.stdout.write(renderReport(replay(ACCOUNTS, EVENT_STREAM)));
}

main();
