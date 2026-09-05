import type { ReplayDay } from '../../common/day/day.js';
import type { MinorUnits } from '../../common/money/money.js';

/**
 * Every state an authorization can be in, in this model.
 *
 * @remarks
 * The list is deliberately short, and its shortness is a finding rather than an oversight.
 * An authorization here ends as SETTLED or as DECLINED, or it does not end at all. There is
 * no expiry, no acquirer void, and no residual release after a partial settlement.
 *
 * Auth-B is declined in this replay, so no hold survives the window and the missing expiry
 * never shows. It would show on day seven of a longer stream, as a hold that never releases
 * and funds a customer cannot use. ARCHITECTURE.md section three lists every ending a
 * production system must handle.
 *
 * @property APPROVED - The hold is live and reduces the available balance.
 * @property SETTLED - A presentment arrived and the hold was released.
 * @property DECLINED - The hold was never created, because applying it would have taken the
 *   available balance below zero.
 */
export const AUTHORIZATION_STATE = {
  APPROVED: 'APPROVED',
  SETTLED: 'SETTLED',
  DECLINED: 'DECLINED',
} as const;

/** The state of an authorization. */
export type AuthorizationState = (typeof AUTHORIZATION_STATE)[keyof typeof AUTHORIZATION_STATE];

/**
 * One authorization, as the register holds it.
 *
 * @property authId - The identifier a settlement names, such as `Auth-A`.
 * @property accountId - The account the hold sits against.
 * @property amountMinor - The amount requested. For an approved authorization this is the
 *   amount held, which is not always the amount that later settles.
 * @property requestedOnDay - The day the authorization was asked for.
 * @property state - Where the authorization is in its life.
 * @property settledOnDay - The day a presentment arrived, or null.
 * @property settledAmountMinor - The amount actually presented, or null. E5 settles 185.00
 *   against a hold of 200.00.
 * @property declineReason - Why the authorization was refused, or null.
 */
export interface IAuthorization {
  readonly authId: string;
  readonly accountId: string;
  readonly amountMinor: MinorUnits;
  readonly requestedOnDay: ReplayDay;
  readonly state: AuthorizationState;
  readonly settledOnDay: ReplayDay | null;
  readonly settledAmountMinor: MinorUnits | null;
  readonly declineReason: string | null;
}

/**
 * Decides whether an authorization can be approved.
 *
 * @remarks
 * The whole rule, in one comparison. The brief states it as: an authorization is approved
 * only if the available balance remains at or above zero after the hold is applied.
 *
 * The test is `>= 0n` and not `> 0n`. An authorization that lands the account exactly on
 * zero is approved, because zero is not below zero. Writing this as `> 0n` would decline a
 * request that empties an account to the fils, which is a normal thing for a customer to do.
 *
 * Applied to E8 on day five: the ledger balance is (155.00), no hold is active because
 * Auth-A released on day four, so available is (155.00). Applying a hold of 90.00 gives
 * (245.00), which is below zero, so Auth-B is declined. The available balance was already
 * negative before the hold, so no hold size would have been approved.
 *
 * @param availableBeforeMinor - The available balance before the hold, which is the ledger
 *   balance minus the holds already active.
 * @param holdMinor - The amount the authorization wants to hold.
 * @returns True when the hold can be applied.
 */
export function isApprovable(availableBeforeMinor: MinorUnits, holdMinor: MinorUnits): boolean {
  return availableBeforeMinor - holdMinor >= 0n;
}
