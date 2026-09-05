# Rejected

Acceptance criteria refused, and approaches abandoned during the build.

Every refusal here is executable. `test/rejected-criteria.e2e-spec.ts` runs the arithmetic that makes each criterion false. A passing test in that file means the criterion is refuted, not satisfied.

## The verdicts

| # | Criterion, in short | Verdict |
|---|---|---|
| 1 | Day 2 closing at end of Day 5, before fees, is (370.00) | Accepted |
| 2 | E7 causes exactly one overdraft fee, on Day 2 | **Refused** |
| 3 | The Day 4 settlement of Auth-A must be accepted | Accepted |
| 4 | A settlement naming an unknown authorization is rejected, funds stay | Accepted, with a caveat |
| 5 | If Auth-B is approved, its hold cuts available but not ledger balance | **Refused as a criterion** |
| 6 | After E9, all balances and fees return to their pre-E7 values | **Refused** |
| 7 | The three BHD instalments must each be BHD 3.334 | **Refused** |
| 8 | An interest remainder that does not sum is discarded | **Refused** |

---

## Criterion 2, refused

> E7 causes exactly one overdraft fee to be assessed, on Day 2.

E7 is value dated Day 2, so it does not lower Day 2 alone. It lowers every day from Day 2 onward. Three of them close below zero.

```
Day 2:  1200 - 950 - 620                 = (370.00)   below zero
Day 3:  1200 - 950 + 400 - 620           =    30.00   above zero
Day 4:  1200 - 950 + 400 - 185 - 620     = (155.00)   below zero
Day 5:  same as Day 4                    = (155.00)   below zero
```

Three fees, value dated Day 2, Day 4 and Day 5. AED 75.00, not AED 25.00.

Day 3 survives, but only just. The Day 2 fee is itself value dated Day 2, so it lowers Day 3 as well, from 30.00 to **5.00**. That margin of 5.00 is the reason the answer is three and not four.

### The criterion also contradicts criterion 1

Criterion 1 asks for the Day 2 closing balance "evaluated at end of Day 5" and expects (370.00). That is restatement: recomputing an already closed day with information that arrived later.

You cannot restate Day 2 in order to charge a fee and then decline to restate Day 4 and Day 5 in the same pass. The two criteria cannot both hold.

### It fails under the other reading too

Suppose the rule were forward only, so a closed day is never reassessed and only the current day can be charged. Then E7 causes exactly one fee, but that fee falls on **Day 5**, not on Day 2.

So the criterion is wrong under restatement, where the count is three, and wrong under forward only assessment, where the day is five. There is no reading that makes it right.

---

## Criterion 5, refused as a criterion

> If Auth-B is approved, its hold reduces available balance but not ledger balance.

**The statement inside it is true**, and it is an invariant of this build. A hold reduces the available balance and never touches the ledger balance. Auth-A demonstrates it on Day 2: the ledger closes at 250.00 with 200.00 held, and available is 50.00.

**The premise is false.** Auth-B is declined.

```
Ledger balance, Day 5, after E7   (155.00)
Active holds                         0.00   Auth-A released on Day 4
Available                         (155.00)
After a hold of 90.00             (245.00)   below zero, so declined
```

Available was already below zero before the hold was applied. No hold size would have been approved, including a hold of zero. The test asserts exactly that.

This is not refused as false. It is refused as an **acceptance criterion**, because an acceptance criterion has to be testable against the replay and this one describes a state the replay never reaches. Calling it wrong would be as dishonest as accepting it.

The conditional phrasing, "if Auth-B is approved", suggests the author knew.

---

## Criterion 6, refused

> After E9, all balances and fees return to their pre-E7 values.

Nothing returns. The ledger is append only, so the three fees cannot be un-booked.

| Day | Before E7 | After E9 |
|---|---|---|
| 2 | 250.00 | 225.00 |
| 4 | 465.00 | 415.00 |
| 6 | 465.00 | 390.00 |

E7 itself is still in the ledger. E9 sits beside it as an opposite entry that names it through `reversesEntryId`. Neither record was edited.

### The deeper reason, which is the point of the exercise

The reversal repairs one consequence of E7 and not the other, and that asymmetry is deliberate.

**Interest is a derived quantity.** It is recomputed from the entries whenever it is needed. Reverse the cause and the interest corrects itself, with nobody intervening.

**A fee is an assessed decision.** It records what the system concluded on Day 5 with the facts it had on Day 5. Reversing the cause does not retract the decision. Retracting a decision needs its own event, carrying its own reason.

The account ends AED 75.10 short of where it would have been had E7 never posted: 75.00 of fees, plus 0.10 of interest those fees cost by holding every later balance down.

Whether that is correct depends on something the brief does not supply. If E7 was a bank error, the fees must be refunded. If the customer's payment was legitimately returned, the account really was overdrawn and the fees stand. A `REVERSAL` carries no reason code, so this design cannot tell the two apart. That is the subject of `test/known-gap.e2e-spec.ts`, the one intentional failure.

---

## Criterion 7, refused

> The three BHD instalments in E10 must each be BHD 3.334.

```
3.334 x 3 = 10.002
```

The criterion creates BHD 0.002 that nobody deposited. A ledger that can invent 0.002 can invent anything, and the invented amount reaches a customer statement as money from nowhere.

Three genuinely equal instalments do not exist at three decimal places. 10000 fils over three parts is 3333 each with 1 left over. Two invariants are in conflict and only one can hold:

| Invariant | Result |
|---|---|
| The parts are equal | 3.334, 3.334, 3.334, totalling 10.002 |
| The parts sum to the total | 3.334, 3.333, 3.333, totalling 10.000 |

Conservation wins. The split is **3.334, 3.333, 3.333**, with the residual allocated to the earliest part by largest remainder.

The instalments share one value date, so the placement of the residual moves no money in time. It is fixed anyway, because an allocation that depends on nothing visible changes the day somebody reorders a loop.

---

## Criterion 8, refused

> If the rounded daily interest accruals do not sum to the capitalized total, the remainder is discarded.

This contradicts the non-negotiable rule printed beside it in the same brief:

> The rounded daily accruals must sum exactly to the capitalized total.

Discarding a remainder guarantees that they do not sum. The two statements cannot both be followed.

The remainder in question is one fils:

```
Six rounded accruals summed                    0.93
The rate applied to the summed balances        0.0004 x 2295.00 = 0.918, rounds to 0.92
Difference                                     0.01
```

Discarding it also destroys a customer's money. A ledger must never leak.

The correct approach makes the rule true by construction: **the capitalized total is defined as the sum of the rounded daily accruals**. There is then no remainder to discard, because the total is the sum rather than an independent calculation that has to be reconciled against it.

A second approach also satisfies the brief and was considered. Round the total once to 0.92, then allocate it back across the days by largest remainder, giving 0.10, 0.09, 0.25, 0.17, 0.16, 0.15. Both readings hold, and they differ by 0.01. The bottom up reading was chosen because the brief makes the daily accruals the primary objects and the total derived. See `AMBIGUITIES.md` A10.

---

## Criterion 4, accepted with a caveat

> Any settlement referencing an authorization ID not present in the ledger must be rejected and the funds must not leave the account.

Implemented as written. E6 is refused, no ledger entry is booked, the 180.00 stays in the account, and the refusal is recorded with a reason so it appears in the printed report.

The caveat belongs on the record.

**A real card issuer cannot behave this way.** A settlement with no matching authorization is a routine event, not a fault. It happens through offline and floor limit transactions, chip fallback, stand-in processing during an issuer outage, and late presentment after an authorization has expired. Under scheme rules the issuer is generally obliged to honour the presentment.

Production would post such a settlement to a suspense account and raise an exception for investigation, then pursue chargeback rights if the authorization is genuinely absent. It would never silently decline and leave the acquirer unpaid.

The brief states the rule, so the brief is implemented and the divergence is documented rather than quietly corrected. `ARCHITECTURE.md` section three covers it.

---

## Approaches abandoned during the build

Recorded as they happened, not reconstructed afterwards.

### TypeScript 7.0.2, dropped to 6.0.3

TypeScript 7.0.2 was current and was pinned first. `typescript-eslint` 8.69.0 declares a peer range of `>=4.8.4 <6.1.0`, so installing it against TypeScript 7 fails outright.

The choice was a newer compiler with no linter at all, or a supported toolchain. Without the linter there is no `tsdoc/syntax` rule, and the documentation standard becomes something a reviewer has to remember rather than something the build enforces.

Dropped to 6.0.3, which also matches the `tsc` already on this machine. No language feature in this project needs TypeScript 7.

### A cast that made a guard into dead code

The fee schedule was first written as a `const` object with an index cast:

```ts
const fee: MinorUnits | undefined =
  OVERDRAFT_FEE_MINOR_BY_CURRENCY[currency as keyof typeof OVERDRAFT_FEE_MINOR_BY_CURRENCY];

if (fee === undefined) { /* raise FEE_NOT_PRICED_FOR_CURRENCY */ }
```

The linter rejected the comparison: "the types have no overlap". It was right. The cast asserted that every currency has an entry, which made the `undefined` branch unreachable. The BHD gap that the code carefully documented would have returned `undefined` at runtime with the guard skipped.

Replaced with `Partial<Record<CurrencyCode, MinorUnits>>`, which makes the absence honest and the guard live. A cast that lies about a lookup is worse than the missing entry it hides.

### A test glob that silently matched nothing

The first test script used `node --test "dist/**/*.spec.js"`. It ran, it reported passes, and it never executed a single end to end spec.

The reference repository names those files `*.e2e-spec.ts`, so they compile to names ending `-spec.js` with a hyphen, not `.spec.js` with a dot. The glob matched the unit tests and skipped the replay entirely.

Corrected to `dist/**/*spec.js`. This was caught by probing the runner against a fixture with one file of each kind before writing any real test, rather than by noticing later that a number looked wrong.

### Three failing tests, reduced to one

`known-gap.e2e-spec.ts` first asserted three things: that the fees were reversed, that the interest matched the counterfactual, and that the final balance matched. All three failed.

The brief asks for **one** failing test. Three failures read as three separate problems rather than as one finding stated three ways. Consolidated into a single assertion on the final balance, with the breakdown in the failure message.

Two figures in the original annotation were also wrong, and were corrected once recomputed: the counterfactual is 466.03, not 465.19, and the shortfall is 75.10, not 74.26.

### Leaving the fee loop unwritten, abandoned

The plan was to leave the body of `assessOverdraftFees` as a marked gap. That would have blocked interest, the replay engine, the report and every end to end test behind a function that does not return, and would have made it impossible to verify that the replay produces 390.93.

Written in full instead, with `fees.spec.ts` pinning the behaviour in 22 tests. Deleting the body and re-deriving it against that spec is a better exercise than a blank file, and it does not hold up the rest of the build.

### Husky and commitlint, considered and not taken

The reference repository enforces the commit format with a Husky hook and `commitlint`. That is two more dependencies on a project whose whole argument is that it has almost none.

The `.gitmessage` template is kept and wired up with `git config commit.template`. The enforcement is manual. This is a deliberate omission rather than an oversight, which is why it appears here.

### A column width derived from the currency

The report first sized its balance column from the currency exponent, twelve characters for AED and thirteen for BHD. That is locally correct and globally wrong: the two accounts print in the same column, one under the other, so a per currency width leaves them misaligned by exactly one space.

One width for every currency. A slightly wider column is easier to scan than a ragged one.

### Repeating an optional chain after an assertion

This happened four times before the pattern was recognised, and it is worth recording because the cause is not obvious.

`assert.equal` from `node:assert/strict` carries an assertion signature. So `assert.equal(found?.state, ...)` narrows `found` to non-null, and every optional chain after it becomes dead. The linter flags the second one, not the first, which makes the diagnosis read like a false positive.

The fix is to narrow once with `assert.ok(found !== undefined)` and then read plain properties, or to assert the whole object with `deepEqual`. Both are clearer than chaining, and both fail with a better message.
