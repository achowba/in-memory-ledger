import { formatAmount } from '../../common/money/money.js';
import { exponentOf } from '../../common/money/money.js';
import type { IRecordedEvent } from '../events/event.types.js';
import type { IAccountDaySnapshot, IDayResult } from '../replay/replay.types.js';
import type { IReplayResult } from '../replay/replay-engine.js';

/** Width of the rules that separate sections, chosen to fit a standard terminal. */
const RULE_WIDTH = 78;

/** A heavy rule, used above a section heading. */
const HEAVY_RULE = '='.repeat(RULE_WIDTH);

/** Where the accrual column starts, so the rule and the total line up under it. */
const ACCRUAL_COLUMN = 31;

/** Width of the accrual column. */
const ACCRUAL_WIDTH = 10;

/** A light rule, used between days. */
const LIGHT_RULE = '.'.repeat(RULE_WIDTH);

/**
 * Renders one event as a single line, including whether it was accepted.
 *
 * @remarks
 * The value date is always printed, not only when it differs from the booking day. A reader
 * checking a backdated entry should not have to work out that the absence of a note means
 * the two dates agree.
 *
 * @param record - The event and its outcome.
 * @param currencyOf - Resolves an account to its currency, for formatting.
 * @returns One line of text.
 */
function renderEvent(
  record: IRecordedEvent,
  currencyOf: (accountId: string) => 'AED' | 'BHD',
): string {
  const { event } = record;
  const currency = currencyOf(event.accountId);
  const amount =
    'amountMinor' in event
      ? formatAmount(currency, event.amountMinor).padStart(12)
      : ''.padStart(12);
  const reference =
    'authId' in event
      ? event.authId
      : 'reversesEventId' in event
        ? `reverses ${event.reversesEventId}`
        : '';

  const outcome = record.outcome === 'ACCEPTED' ? 'accepted' : 'REFUSED';

  return (
    `    ${event.eventId.padEnd(4)} ${event.type.padEnd(14)} ${event.accountId}  ${amount}  ` +
    `vd D${event.valueDate}  ${outcome.padEnd(8)} ${reference}`
  ).trimEnd();
}

/**
 * Renders one account's position at the close of a day.
 *
 * @param snapshot - The account snapshot.
 * @returns One line of text.
 */
function renderBalance(snapshot: IAccountDaySnapshot): string {
  // One width for every currency. AED prints two decimals and BHD three, so a width
  // derived from the currency would leave the two accounts misaligned in the same column.
  const width = 13;

  return (
    `    ${snapshot.accountId}  ${snapshot.currency}  ` +
    `closing ${formatAmount(snapshot.currency, snapshot.closingBalanceMinor).padStart(width)}   ` +
    `holds ${formatAmount(snapshot.currency, snapshot.activeHoldsMinor).padStart(width)}   ` +
    `available ${formatAmount(snapshot.currency, snapshot.availableBalanceMinor).padStart(width)}`
  );
}

/**
 * Renders one day of the replay.
 *
 * @remarks
 * The section order answers the brief's four requirements in turn: what happened, what the
 * day closed at, what it cost, and what went wrong. Restatements sit next to the balances
 * because a restated earlier day is a balance, not an error.
 *
 * @param result - The day to render.
 * @param currencyOf - Resolves an account to its currency.
 * @returns The rendered block.
 */
function renderDay(result: IDayResult, currencyOf: (accountId: string) => 'AED' | 'BHD'): string {
  const lines: string[] = [LIGHT_RULE, `DAY ${result.day}`, LIGHT_RULE, ''];

  lines.push('  EVENTS');
  lines.push(
    ...(result.events.length > 0
      ? result.events.map((record) => renderEvent(record, currencyOf))
      : ['    none']),
  );

  lines.push('', '  CLOSING LEDGER BALANCE');
  lines.push(...result.accounts.map(renderBalance));

  const restated = result.accounts.flatMap((snapshot) =>
    snapshot.restatements.map(
      (restatement) =>
        `    ${snapshot.accountId}  day ${restatement.day} restated  ` +
        `${formatAmount(snapshot.currency, restatement.wasMinor)} ` +
        `becomes ${formatAmount(snapshot.currency, restatement.nowMinor)}`,
    ),
  );
  if (restated.length > 0) {
    lines.push('', '  RESTATED EARLIER DAYS');
    lines.push(...restated);
  }

  lines.push('', '  FEE ASSESSMENTS');
  lines.push(
    ...(result.feesBooked.length > 0
      ? result.feesBooked.map(
          (fee) =>
            `    ${fee.accountId}  overdraft fee ` +
            `${formatAmount(currencyOf(fee.accountId), -fee.amountMinor)}  ` +
            `value dated day ${fee.valueDate}, booked day ${fee.bookedOnDay}`,
        )
      : ['    none']),
  );

  lines.push('', '  AUTHORIZATION STATES');
  lines.push(
    ...(result.authorizations.length > 0
      ? result.authorizations.map((authorization) => {
          const currency = currencyOf(authorization.accountId);
          const settled =
            authorization.settledAmountMinor === null
              ? ''
              : `, settled ${formatAmount(currency, authorization.settledAmountMinor)} on day ${authorization.settledOnDay ?? '?'}`;
          const reason =
            authorization.declineReason === null ? '' : `, ${authorization.declineReason}`;

          return (
            `    ${authorization.authId.padEnd(8)} ${authorization.state.padEnd(9)} ` +
            `${authorization.accountId}  held ${formatAmount(currency, authorization.amountMinor)}` +
            `${settled}${reason}`
          );
        })
      : ['    none']),
  );

  const problems = result.events.flatMap((record) => [
    ...(record.refusal === null
      ? []
      : [
          `    ${record.event.eventId.padEnd(4)} ERROR  ${record.refusal.code}: ${record.refusal.detail}`,
        ]),
    ...record.warnings.map(
      (warning) =>
        `    ${record.event.eventId.padEnd(4)} WARN   ${warning.code}: ${warning.detail}`,
    ),
  ]);

  lines.push('', '  ERRORS AND WARNINGS');
  lines.push(...(problems.length > 0 ? problems : ['    none']));
  lines.push('');

  return lines.join('\n');
}

/**
 * Renders the whole replay as text.
 *
 * @remarks
 * The interest schedule is printed with its working rather than as a single figure. The brief
 * requires the rounded daily accruals to sum exactly to the capitalized total. A reader should
 * be able to check that by adding up a column.
 *
 * @param result - Everything the replay produced.
 * @returns The report, ready to print.
 */
export function renderReport(result: IReplayResult): string {
  // Defaulting here would mis-format rather than stop. AED has two decimal places and BHD
  // three, so a BHD amount rendered as AED is out by a factor of ten and still looks like a
  // plausible balance. A report that cannot name a currency has been handed a broken result.
  const currencyOf = (accountId: string): 'AED' | 'BHD' => {
    const account = result.accounts.find((candidate) => candidate.accountId === accountId);
    if (account === undefined) {
      throw new RangeError(
        `The replay result has no account ${accountId} to take a currency from.`,
      );
    }
    return account.currency;
  };

  const lines: string[] = [
    HEAVY_RULE,
    '  IN MEMORY ACCOUNT LEDGER: SIX DAY REPLAY',
    HEAVY_RULE,
    '',
    '  ACCOUNTS',
    ...result.accounts.map(
      (account) =>
        `    ${account.accountId}  ${account.currency}  ${exponentOf(account.currency)} decimal places  ` +
        `opening ${formatAmount(account.currency, account.openingBalanceMinor)}`,
    ),
    '',
  ];

  for (const day of result.days) {
    lines.push(renderDay(day, currencyOf));
  }

  lines.push(HEAVY_RULE, '  INTEREST, CAPITALIZED AT THE END OF DAY 6', HEAVY_RULE, '');

  for (const account of result.interest) {
    lines.push(`  ${account.accountId}  ${account.currency}`);
    lines.push('    day   closing balance      accrual at 0.04 percent');

    for (const accrual of account.accruals) {
      lines.push(
        (
          `     ${accrual.day}    ` +
          formatAmount(account.currency, accrual.closingBalanceMinor).padStart(14)
        ).padEnd(ACCRUAL_COLUMN) +
          formatAmount(account.currency, accrual.accrualMinor).padStart(ACCRUAL_WIDTH),
      );
    }

    // The rule and the total sit under the accrual column, so a reader can add the
    // column up and check it against the total. That check is the brief's sum rule.
    lines.push(
      `${' '.repeat(ACCRUAL_COLUMN)}${'='.repeat(ACCRUAL_WIDTH)}`,
      `    capitalized total`.padEnd(ACCRUAL_COLUMN) +
        formatAmount(account.currency, account.totalMinor).padStart(ACCRUAL_WIDTH),
      '',
    );
  }

  lines.push(HEAVY_RULE, '  FINAL BALANCES', HEAVY_RULE, '');
  for (const account of result.accounts) {
    const finalMinor = result.ledger.balanceMinor(account.accountId, { valueDateOnOrBefore: 6 });
    lines.push(
      `    ${account.accountId}  ${account.currency}  ${formatAmount(account.currency, finalMinor)}`,
    );
  }
  lines.push('');

  return lines.join('\n');
}
