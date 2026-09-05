# authorizations

## What it does

Holds the state of every authorization. Tracks how much is reserved against each account. Owns
the one comparison that decides whether a new authorization is approved.

## How it relates to the rest of the project

`modules/replay` asks `isApprovable` before creating a hold, and asks `activeHoldsMinor` to work out the available balance. `modules/report` reads the states back to print them.

Nothing here writes to the ledger. That is the point: a hold reduces the available balance and never touches the ledger balance.

## The decisions it owns

### The approval rule is one comparison, and it is `>= 0n`

```
availableBefore - hold >= 0n
```

The brief says the available balance must remain "at or above zero". Written as `> 0n` this would decline a customer emptying their account to the fils, which is an ordinary thing to do.

Applied to the two authorizations in the stream:

| Event              | Ledger balance | Live holds | Available | After the hold | Result   |
| ------------------ | -------------- | ---------- | --------- | -------------- | -------- |
| E3, Auth-A, 200.00 | 250.00         | 0.00       | 250.00    | 50.00          | Approved |
| E8, Auth-B, 90.00  | (155.00)       | 0.00       | (155.00)  | (245.00)       | Declined |

Auth-B is declined because available was already below zero before the hold was applied. No hold size would have been approved, which is why acceptance criterion 5 describes a state this replay never reaches.

### A declined authorization is still stored

The brief requires each day's authorization states in the printed output, and "Auth-B, declined" is one of them.

Storing it also lets a later settlement tell two different situations apart: an authorization that was refused, and one that was never requested. Those deserve different handling in production, even though neither appears again in this window.

### A settlement releases the whole hold

E5 settles 185.00 against a hold of 200.00, and the remaining 15.00 is freed rather than kept.

That is the single presentment reading. A product that can present more than once against one
authorization would keep the residual held. A hotel folio and a split shipment both do this.
They hold until a final authorization arrives, or until an expiry. Neither exists in this model.
See `AMBIGUITIES.md`.

### This register is a projection, not history

The event log is the source of truth. This register is what you get by replaying it.

That is why a state transition replaces a frozen record instead of appending one. Invariant 2 constrains history, and a projection is a cache of history: nothing is lost when it is overwritten, because it can be rebuilt.

### The state list is short, and that is a finding

An authorization here ends as `SETTLED` or as `DECLINED`, or it does not end at all. There is no expiry, no acquirer void, and no residual release.

Auth-B is declined, so no hold survives the window and the missing expiry never shows. It would show on day seven, as a hold that never releases against funds a customer cannot use. `ARCHITECTURE.md` section three lists every ending a production system has to handle.

## Its dependencies on other modules

`common/day` for the day type, `common/money` for exact summation.
