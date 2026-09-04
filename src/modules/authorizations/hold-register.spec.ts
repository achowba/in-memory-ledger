import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AUTHORIZATION_STATE, isApprovable } from './authorization.types.js';
import { HoldRegister } from './hold-register.js';

const ACCOUNT = 'ACC-001';

describe('isApprovable, the approval rule', () => {
  // E3 on day two. Ledger 250.00, no holds live, so available is 250.00. A hold of 200.00
  // leaves 50.00, which is at or above zero.
  it('approves Auth-A, which leaves 50.00 available', () => {
    assert.equal(isApprovable(25000n, 20000n), true);
  });

  // E8 on day five. E7 has already posted, so the ledger balance is (155.00) and Auth-A
  // released its hold on day four. Available is (155.00) before the hold is even applied.
  it('declines Auth-B, which would leave (245.00) available', () => {
    assert.equal(isApprovable(-15500n, 9000n), false);
  });

  // The available balance was already negative, so no hold size would have been approved.
  it('declines any hold once available is already below zero', () => {
    assert.equal(isApprovable(-15500n, 0n), false);
    assert.equal(isApprovable(-1n, 1n), false);
  });

  // The rule is "remains at or above zero", so exactly zero is approved. Written as > 0n it
  // would decline a customer emptying their account to the fils, which is normal.
  it('approves a hold that lands exactly on zero', () => {
    assert.equal(isApprovable(20000n, 20000n), true);
  });

  it('declines a hold one fils larger than the available balance', () => {
    assert.equal(isApprovable(20000n, 20001n), false);
  });
});

describe('HoldRegister, an approved authorization', () => {
  it('stores the authorization as approved', () => {
    const register = new HoldRegister();
    const authorization = register.approve('Auth-A', ACCOUNT, 20000n, 2);

    assert.equal(authorization.state, AUTHORIZATION_STATE.APPROVED);
    assert.equal(authorization.amountMinor, 20000n);
  });

  it('puts the hold live against the account', () => {
    const register = new HoldRegister();
    register.approve('Auth-A', ACCOUNT, 20000n, 2);

    assert.equal(register.activeHoldsMinor(ACCOUNT), 20000n);
  });

  it('holds nothing against a different account', () => {
    const register = new HoldRegister();
    register.approve('Auth-A', ACCOUNT, 20000n, 2);

    assert.equal(register.activeHoldsMinor('ACC-002'), 0n);
  });

  it('totals several live holds', () => {
    const register = new HoldRegister();
    register.approve('Auth-A', ACCOUNT, 20000n, 2);
    register.approve('Auth-C', ACCOUNT, 5000n, 3);

    assert.equal(register.activeHoldsMinor(ACCOUNT), 25000n);
  });
});

describe('HoldRegister, settlement', () => {
  // E5 settles 185.00 against a hold of 200.00. The whole hold is released, not just the
  // settled part, on the single presentment reading. See AMBIGUITIES.md.
  it('releases the whole hold even when the settlement is smaller', () => {
    const register = new HoldRegister();
    register.approve('Auth-A', ACCOUNT, 20000n, 2);
    register.settle('Auth-A', 4, 18500n);

    assert.equal(register.activeHoldsMinor(ACCOUNT), 0n);
  });

  it('records what was actually presented, and when', () => {
    const register = new HoldRegister();
    register.approve('Auth-A', ACCOUNT, 20000n, 2);
    const settled = register.settle('Auth-A', 4, 18500n);

    assert.equal(settled.state, AUTHORIZATION_STATE.SETTLED);
    assert.equal(settled.settledAmountMinor, 18500n);
    assert.equal(settled.settledOnDay, 4);
  });

  it('keeps the originally held amount alongside the settled amount', () => {
    const register = new HoldRegister();
    register.approve('Auth-A', ACCOUNT, 20000n, 2);
    const settled = register.settle('Auth-A', 4, 18500n);

    assert.equal(settled.amountMinor, 20000n, 'the hold was 200.00');
    assert.equal(settled.settledAmountMinor, 18500n, 'the presentment was 185.00');
  });

  // The caller checks first and refuses the settlement, so reaching this is a fault.
  it('throws when asked to settle an authorization that was never requested', () => {
    const register = new HoldRegister();

    assert.throws(() => register.settle('Auth-Z', 4, 18000n), RangeError);
  });
});

describe('HoldRegister, a declined authorization', () => {
  it('creates no hold', () => {
    const register = new HoldRegister();
    register.decline('Auth-B', ACCOUNT, 9000n, 5, 'available would fall to (245.00)');

    assert.equal(register.activeHoldsMinor(ACCOUNT), 0n);
  });

  // The brief requires the authorization states of each day to be printed, and a decline is
  // one of them. Storing it also lets a later settlement tell a refused authorization apart
  // from one that never existed.
  it('is still stored, with its reason', () => {
    const register = new HoldRegister();
    register.decline('Auth-B', ACCOUNT, 9000n, 5, 'available would fall to (245.00)');

    const found = register.find('Auth-B');
    assert.equal(found?.state, AUTHORIZATION_STATE.DECLINED);
    assert.equal(found?.declineReason, 'available would fall to (245.00)');
  });

  it('is distinguishable from an authorization that was never requested', () => {
    const register = new HoldRegister();
    register.decline('Auth-B', ACCOUNT, 9000n, 5, 'declined');

    assert.notEqual(register.find('Auth-B'), undefined);
    assert.equal(register.find('Auth-Z'), undefined);
  });
});

describe('HoldRegister, immutability of a stored record', () => {
  it('freezes an authorization', () => {
    const register = new HoldRegister();
    const authorization = register.approve('Auth-A', ACCOUNT, 20000n, 2);

    assert.throws(() => {
      (authorization as { amountMinor: bigint }).amountMinor = 1n;
    }, TypeError);
  });

  // The register is a projection rebuildable from the log, so a transition replaces the
  // record rather than appending. The previously returned handle keeps its old values.
  it('leaves an earlier handle unchanged when the state moves on', () => {
    const register = new HoldRegister();
    const approved = register.approve('Auth-A', ACCOUNT, 20000n, 2);
    register.settle('Auth-A', 4, 18500n);

    assert.equal(approved.state, AUTHORIZATION_STATE.APPROVED);
    assert.equal(register.find('Auth-A')?.state, AUTHORIZATION_STATE.SETTLED);
  });
});
