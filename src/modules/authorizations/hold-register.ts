import { sumMinor, type MinorUnits } from '../../common/money/money.js';
import type { ReplayDay } from '../../common/day/day.js';
import {
  AUTHORIZATION_STATE,
  type IAuthorization,
} from './authorization.types.js';

/**
 * The state of every authorization, and the total currently held against each account.
 *
 * @remarks
 * This is a projection, not a source of truth. The event log is the source of truth, and
 * this register is what you get by replaying it. That is why a state transition here
 * replaces a frozen record rather than appending a new one: rebuilding the register from
 * the log at any time produces exactly the same content.
 *
 * The distinction matters for the append only invariant. Invariant 2 constrains the log and
 * the ledger, which are history. A projection is a cache of history and is allowed to be
 * overwritten, because nothing is lost when it is.
 *
 * A hold never touches the ledger balance. A hold reduces the available balance only, which
 * is the ledger balance minus the holds still live.
 */
export class HoldRegister {
  private readonly authorizations = new Map<string, IAuthorization>();

  /**
   * Records an approved authorization and puts its hold live.
   *
   * @param authId - The identifier a settlement will name.
   * @param accountId - The account the hold sits against.
   * @param amountMinor - The amount to hold.
   * @param requestedOnDay - The day the authorization was asked for.
   * @returns The stored authorization.
   */
  public approve(
    authId: string,
    accountId: string,
    amountMinor: MinorUnits,
    requestedOnDay: ReplayDay,
  ): IAuthorization {
    return this.store({
      authId,
      accountId,
      amountMinor,
      requestedOnDay,
      state: AUTHORIZATION_STATE.APPROVED,
      settledOnDay: null,
      settledAmountMinor: null,
      declineReason: null,
    });
  }

  /**
   * Records a declined authorization.
   *
   * @remarks
   * A declined authorization is still stored. The brief requires the authorization states of
   * each day to be printed, and "Auth-B, declined" is one of them. Storing it also means a
   * later settlement naming Auth-B can be told the difference between an authorization that
   * was refused and one that never existed.
   *
   * No hold is created, so the available balance is untouched.
   *
   * @param authId - The identifier that was requested.
   * @param accountId - The account the hold would have sat against.
   * @param amountMinor - The amount that was requested.
   * @param requestedOnDay - The day the authorization was asked for.
   * @param reason - A sentence naming the balances involved, for the printed report.
   * @returns The stored authorization.
   */
  public decline(
    authId: string,
    accountId: string,
    amountMinor: MinorUnits,
    requestedOnDay: ReplayDay,
    reason: string,
  ): IAuthorization {
    return this.store({
      authId,
      accountId,
      amountMinor,
      requestedOnDay,
      state: AUTHORIZATION_STATE.DECLINED,
      settledOnDay: null,
      settledAmountMinor: null,
      declineReason: reason,
    });
  }

  /**
   * Marks an authorization settled and releases its hold in full.
   *
   * @remarks
   * The whole hold is released even when the settled amount is smaller. E5 settles 185.00
   * against a hold of 200.00, and the remaining 15.00 is freed rather than kept.
   *
   * That is the single presentment reading. A product that can present more than once
   * against one authorization, such as a hotel folio or a split shipment, would keep the
   * residual held until a final authorization or an expiry. Neither exists in this model.
   * See AMBIGUITIES.md.
   *
   * @param authId - The authorization being settled.
   * @param settledOnDay - The day the presentment arrived.
   * @param settledAmountMinor - The amount actually presented.
   * @returns The updated authorization.
   * @throws RangeError When no authorization carries that identifier. The caller checks
   *   first and refuses the settlement, so reaching this is a programming fault.
   */
  public settle(
    authId: string,
    settledOnDay: ReplayDay,
    settledAmountMinor: MinorUnits,
  ): IAuthorization {
    const existing = this.authorizations.get(authId);
    if (existing === undefined) {
      throw new RangeError(`Cannot settle ${authId}: no such authorization in the register.`);
    }

    return this.store({
      ...existing,
      state: AUTHORIZATION_STATE.SETTLED,
      settledOnDay,
      settledAmountMinor,
    });
  }

  /**
   * Finds an authorization by identifier, whatever its state.
   *
   * @param authId - The identifier to look for.
   * @returns The authorization, or undefined when none was ever requested under that name.
   */
  public find(authId: string): IAuthorization | undefined {
    return this.authorizations.get(authId);
  }

  /**
   * Totals the holds still live against an account.
   *
   * @remarks
   * Only an approved authorization holds anything. A settled one released its hold, and a
   * declined one never created one. This total is what the available balance subtracts.
   *
   * @param accountId - The account to total.
   * @returns The held amount in minor units. Zero when nothing is live.
   */
  public activeHoldsMinor(accountId: string): MinorUnits {
    return sumMinor(
      [...this.authorizations.values()]
        .filter(
          (authorization) =>
            authorization.accountId === accountId &&
            authorization.state === AUTHORIZATION_STATE.APPROVED,
        )
        .map((authorization) => authorization.amountMinor),
    );
  }

  /**
   * Lists the authorizations of an account, in the order they were requested.
   *
   * @param accountId - The account to filter by.
   * @returns The authorizations, including declined and settled ones.
   */
  public forAccount(accountId: string): readonly IAuthorization[] {
    return [...this.authorizations.values()].filter(
      (authorization) => authorization.accountId === accountId,
    );
  }

  /**
   * Freezes an authorization and stores it under its identifier.
   *
   * @param authorization - The record to store.
   * @returns The same record, frozen.
   */
  private store(authorization: IAuthorization): IAuthorization {
    const frozen = Object.freeze(authorization);
    this.authorizations.set(authorization.authId, frozen);
    return frozen;
  }
}
