import { parseAmount } from '../../common/money/money.js';
import type { LedgerEvent } from '../events/event.types.js';
import type { IAccount } from './replay.types.js';

/**
 * The two accounts of the brief.
 *
 * Both open at zero. The pairing of a two decimal currency with a three decimal one is the
 * point. A single global precision would pass every AED assertion and silently corrupt every
 * BHD amount.
 */
export const ACCOUNTS: readonly IAccount[] = [
  { accountId: 'ACC-001', currency: 'AED', openingBalanceMinor: parseAmount('AED', '0.00') },
  { accountId: 'ACC-002', currency: 'BHD', openingBalanceMinor: parseAmount('BHD', '0.000') },
];

/**
 * The event stream of the brief, transcribed in the order the brief lists it.
 *
 * Amounts are written as text in the same notation the brief uses, then parsed. So a reviewer
 * can compare this file against the brief line by line. Writing `120000n` here would be faster
 * to execute and impossible to check.
 *
 * Two entries in this list deserve a second look.
 *
 * E7 is booked on day five and value dated day two. That single mismatch is what forces the
 * two clock design, restates three already closed days, and triggers three overdraft fees.
 *
 * E10 is booked on day five but is listed tenth, after E9 which is booked on day six. The
 * brief says to replay in this order, and the booking days say otherwise. The engine groups
 * by booking day and raises OUT_OF_ORDER_BOOKING. The two accounts are independent, so both
 * readings produce identical balances, and a test proves it. See AMBIGUITIES.md.
 */
export const EVENT_STREAM: readonly LedgerEvent[] = [
  {
    eventId: 'E1',
    type: 'CREDIT',
    accountId: 'ACC-001',
    bookingDay: 1,
    valueDate: 1,
    amountMinor: parseAmount('AED', '1200.00'),
    instalmentCount: 1,
  },
  {
    eventId: 'E2',
    type: 'DEBIT',
    accountId: 'ACC-001',
    bookingDay: 1,
    valueDate: 1,
    amountMinor: parseAmount('AED', '950.00'),
  },
  {
    eventId: 'E3',
    type: 'AUTHORIZATION',
    accountId: 'ACC-001',
    bookingDay: 2,
    valueDate: 2,
    authId: 'Auth-A',
    amountMinor: parseAmount('AED', '200.00'),
  },
  {
    eventId: 'E4',
    type: 'CREDIT',
    accountId: 'ACC-001',
    bookingDay: 3,
    valueDate: 3,
    amountMinor: parseAmount('AED', '400.00'),
    instalmentCount: 1,
  },
  {
    eventId: 'E5',
    type: 'SETTLEMENT',
    accountId: 'ACC-001',
    bookingDay: 4,
    valueDate: 4,
    authId: 'Auth-A',
    amountMinor: parseAmount('AED', '185.00'),
  },
  {
    // Auth-Z has no preceding authorization event. Refused, and the funds stay put.
    eventId: 'E6',
    type: 'SETTLEMENT',
    accountId: 'ACC-001',
    bookingDay: 4,
    valueDate: 4,
    authId: 'Auth-Z',
    amountMinor: parseAmount('AED', '180.00'),
  },
  {
    // Booked day five, value dated day two. The event the whole exercise turns on.
    eventId: 'E7',
    type: 'DEBIT',
    accountId: 'ACC-001',
    bookingDay: 5,
    valueDate: 2,
    amountMinor: parseAmount('AED', '620.00'),
  },
  {
    eventId: 'E8',
    type: 'AUTHORIZATION',
    accountId: 'ACC-001',
    bookingDay: 5,
    valueDate: 5,
    authId: 'Auth-B',
    amountMinor: parseAmount('AED', '90.00'),
  },
  {
    eventId: 'E9',
    type: 'REVERSAL',
    accountId: 'ACC-001',
    bookingDay: 6,
    valueDate: 2,
    reversesEventId: 'E7',
  },
  {
    // Listed tenth, booked fifth. See the note above.
    eventId: 'E10',
    type: 'CREDIT',
    accountId: 'ACC-002',
    bookingDay: 5,
    valueDate: 5,
    amountMinor: parseAmount('BHD', '10.000'),
    instalmentCount: 3,
  },
];
