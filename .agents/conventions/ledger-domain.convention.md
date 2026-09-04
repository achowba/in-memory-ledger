# Ledger domain convention

The rules that make this a ledger rather than a list of numbers. Read this file before touching anything under `src/modules/`.

## Money is an integer count of minor units

A money value is a `bigint`. The value counts the smallest unit of its currency. AED 415.00 is `41500n` fils. BHD 10.000 is `10000n` fils.

There is no floating point anywhere, and there is no third party decimal type. The reason is not taste. A `number` cannot hold `0.1 + 0.2` exactly, and a decimal library moves the rounding decision inside somebody else's code. With integers, the only rounding in the system is rounding that somebody wrote on purpose, and every such place is visible in review.

- A currency owns its exponent. AED is 2. BHD is 3. The registry in `src/common/money/money.constants.ts` is the only place an exponent is declared.
- A money identifier ends in `Minor`, so the unit is visible at the call site: `amountMinor`, `balanceMinor`, `feeMinor`. A name without the suffix is not money.
- An amount is formatted for display only at the edge, in the report. Nothing downstream of a formatter is a money value.
- A rate is a pair of integers, a numerator and a denominator, never a decimal. `0.04 percent per day` is `4n / 10000n`.

## Two clocks

Every entry carries two independent times.

| Clock | Field | Answers |
|---|---|---|
| Value date | `valueDate` | On which day does this entry change the balance? |
| Arrival | `sequence` | In what order did the system learn of this entry? |

The two clocks normally agree. When an entry is backdated, the two clocks disagree, and a day's closing balance stops being a single number. The Day 2 closing balance is one number when asked on Day 2, and a different number when asked on Day 5.

Therefore a balance query names both clocks:

```ts
balanceMinor(accountId, { valueDateOnOrBefore, knownAsOfSequence });
```

`valueDateOnOrBefore` selects which entries count. `knownAsOfSequence` selects what the system knew. Omitting `knownAsOfSequence` means "everything known now".

Never add a balance helper that takes only one clock. A one-clock helper is a correct answer to the wrong question, and it will be called by mistake.

## Append only

- No record is changed after it is appended. Records are `readonly` and frozen.
- No record is deleted.
- A correction is a new opposite entry that references the original. The original stays exactly as it was booked.
- A rejected input is still appended to the event log, with its reason. The log records what happened, and a refusal happened.

Two collections, with different jobs:

| Collection | Holds | Affects a balance |
|---|---|---|
| Event log | Every input, accepted or rejected, plus every entry the system generates | No |
| Ledger | The balance-affecting entries only | Yes |

An authorization never produces a ledger entry. A hold reduces the available balance and never touches the ledger balance.

## Value is conserved

Nothing is created and nothing is discarded.

- A split of a total into parts sums exactly to that total. When the total does not divide evenly, the residual is allocated by largest remainder, and the allocation rule is deterministic. Never round each part independently and accept the drift.
- A rounding step that produces a residual must place that residual somewhere. Discarding it is a defect, not a simplification.
- Interest capitalizes as the sum of the rounded daily accruals. The total is defined by the parts, so the two agree by construction rather than by luck.

## The fee cascade

An overdraft fee is itself a value-dated ledger entry. So a fee booked against an earlier day lowers the closing balance of every later day, and a fee can push a later day below zero.

Two rules follow, and both are load bearing:

1. **Assess days in ascending order.** A fee for day `d` can only affect days at or after `d`. Ascending order therefore reaches a fixed point in one pass. Any other order needs iteration to convergence.
2. **At most one fee per account per day, ever.** The guard is on the pair, not on the assessment run. A later run that revisits an already charged day must not charge it again.

A backdated entry can push an already closed day below zero. So an assessment run covers every day in the window up to the day being closed, not only that day.

## Zero is not negative

A day that closes at exactly zero is not overdrawn, and it earns no interest.

- The overdraft test is `balance < 0`. A flat account is never charged.
- The interest test is `balance > 0`. A zero balance accrues nothing.

Both tests are strict. Writing either one as `<=` or `>=` changes the output of the replay.

## A fee is a decision, an accrual is a derivation

This distinction decides what a reversal repairs.

- **Interest is derived.** Interest is recomputed from the current entry set whenever it is needed. Reverse the cause and the interest corrects itself, with no extra event.
- **A fee is assessed.** A fee records a decision the system made on a given day with the facts it had on that day. Reversing the cause does not retract the decision. Retracting a decision needs its own event, carrying its own reason.

The consequence is deliberate and it is documented in `AMBIGUITIES.md`. A reversal restores the interest and leaves the fees standing. The system cannot do better, because a reversal carries no reason code and therefore cannot distinguish an error by the bank from a legitimate return by the customer. That gap is covered by the annotated failing test.
