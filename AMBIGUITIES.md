# Ambiguities

Every place the brief admits more than one reading, what each reading produces, and which one this build takes.

An entry is here when a competent reader could have gone the other way. Where the choice changes a number, the other number is given, so the decision can be argued rather than just accepted.

## The ones that change a headline figure

| #   | Ambiguity                                                        | Chosen                  | Alternative                          |
| --- | ---------------------------------------------------------------- | ----------------------- | ------------------------------------ |
| A2  | Is an already closed day restated when a backdated entry arrives | Yes                     | Three fees become one, dated Day 5   |
| A6  | Which closing balance does interest accrue on                    | Restated, 0.93          | As known at each close, 0.81         |
| A10 | Where does interest round                                        | Per day, then sum, 0.93 | Round the total, allocate back, 0.92 |
| A13 | What value date does a reversal carry                            | The original's, Day 2   | Current date, interest falls to 0.26 |
| A20 | How many accrual days are in the window                          | Six, 0.93               | Five, 0.77                           |

Everything else changes behaviour, an error message, or nothing at all.

---

## A1. What a day is

The brief gives no calendar, no timezone, and no cutoff time.

**Taken:** Day 1 to Day 6 are ordinals. No weekend, no public holiday, no time of day.

**Cost:** A real system needs a business day calendar, a timezone of Asia/Dubai, and a cutoff after which a posting belongs to the next day. The UAE moved its federal weekend from Friday and Saturday to Saturday and Sunday in January 2022, so even the weekend rule is not a constant. Recorded as a cut in `ARCHITECTURE.md`.

## A2. Whether an already closed day is restated

The overdraft rule defines a closing balance as "all entries with `value_date <= that day`". That says which entries to add. It does not say when you are standing while you add them.

**Taken:** Yes, restated. A day's closing balance is recomputed whenever it is asked for.

**Why:** Criterion 1 forces it. It asks for the Day 2 closing balance "evaluated at end of Day 5" and expects (370.00). That qualifier is meaningless unless the answer can differ, and it can only differ if prior days are restated.

**Consequence:** This single decision produces the two clock design, the three fees, and the restatement lines in the report. Without it, criterion 1 is unreachable.

## A3. What "the day assessed" means

> Booked with value_date equal to the day assessed.

"The day assessed" can mean the day being assessed, or the day on which the assessment runs.

**Taken:** The day being assessed. A fee covering Day 2 carries a value date of Day 2, and a booking day of whenever the run happened.

**Why:** The passive reads as "the day that is assessed". Had it meant the run day, the natural phrasing is "value date equal to the booking date". Criterion 2 also dates its fee to Day 2, not to Day 5, so the brief agrees on this even while getting the count wrong.

**Consequence:** Fees cascade. A fee value dated Day 2 lowers Days 3 to 6, which is why the walk has to be ascending.

## A4. Whether a closed day can be charged retroactively

Given A2, a day that already closed can turn out to have been overdrawn.

**Taken:** Yes. An assessment run covers every day up to the day being closed.

**Why:** A2 restates balances, and criterion 2 itself dates a fee to a day that had already closed. Restating a balance in order to charge, and then declining to charge, would be incoherent.

**Alternative:** Forward only assessment, charging only the current day. E7 would cause one fee, on Day 5. Criterion 2 is wrong under that reading too, because it names Day 2.

## A5. Whether fees cascade into each other

A fee is a value dated ledger entry, so a fee can push a later day below zero and trigger another.

**Taken:** Yes, they cascade. Days are walked ascending, and at most one fee is ever charged per account per day.

**Why:** Ascending order reaches a fixed point in one pass, because a fee for day `d` can only affect days at or after `d`. Any other order needs iterating until nothing changes and has to prove it terminates.

**Consequence:** Day 3 closes at 5.00 rather than 30.00. At a fee above AED 30.00 it would go below zero and a fourth fee would be charged. See `NUMBERS.md`.

## A6. Which closing balance interest accrues on

The rule says "0.04 percent per day on the closing ledger balance". Given A2, four of the six days have two closing balances.

**Taken:** Restated. All six are recomputed at capitalization with everything known. **AED 0.93.**

**Alternative:** Accrue each night on the balance visible at that night's close, never revisited. **AED 0.81.**

| Day | Restated | Accrual  | As known then | Accrual  |
| --- | -------- | -------- | ------------- | -------- |
| 1   | 250.00   | 0.10     | 250.00        | 0.10     |
| 2   | 225.00   | 0.09     | 250.00        | 0.10     |
| 3   | 625.00   | 0.25     | 650.00        | 0.26     |
| 4   | 415.00   | 0.17     | 465.00        | 0.19     |
| 5   | 390.00   | 0.16     | (230.00)      | 0.00     |
| 6   | 390.00   | 0.16     | 390.00        | 0.16     |
|     |          | **0.93** |               | **0.81** |

**Why restated:** Consistency with A2. Criterion 1 restates a balance in order to charge a fee. Restating to charge and refusing to restate to pay would be difficult to defend to a customer or a regulator.

**What it means:** Under restatement, E9 repairs the interest by itself, with nobody intervening. That is the half of the reversal that works. It sits beside the half that does not, which is the three fees, and the contrast is the subject of the failing test.

Both totals are asserted in `src/modules/interest/interest.spec.ts`, so the 0.12 is a stated figure rather than a claim.

## A7. The order of E9 and E10

E10 is listed tenth and booked on Day 5. E9 sits ninth and is booked on Day 6. The list is not in arrival order, or a booking date is wrong.

**Taken:** Group by booking day, and raise `OUT_OF_ORDER_BOOKING`.

**Why:** Booking day is the field that carries meaning. Arrival position in a written list is presentation.

**Consequence:** None. The two events touch different accounts and no rule in this ledger crosses accounts, so both orderings produce identical balances, fees and interest. `test/order-independence.e2e-spec.ts` proves it, and shows the two reports differ only in the warning.

The warning is raised anyway. Reordering silently would have produced an identical report and hidden a data quality problem behind a correct answer.

## A8. Whether a direct debit is gated on available balance

The brief states the availability rule for authorizations. It says nothing about debits.

**Taken:** Not gated. A debit posts and may overdraw the account.

**Why:** Two reasons, and the second is decisive. An overdraft fee only makes sense if an account can go overdrawn, and the only events that can overdraw it are debits. And gating debits would decline E7, which would make criterion 1 unreachable and the whole exercise incoherent.

## A9. Whether a settlement is gated on available balance

**Taken:** Not gated.

**Why:** The hold already reserved the funds and the bank is already committed to the payment. Declining at settlement would mean the bank told an acquirer the money was good and then refused to pay.

## A10. Where interest rounds

> The rounded daily accruals must sum exactly to the capitalized total.

Two readings satisfy that sentence.

**Taken, bottom up:** Round each day, then define the total as their sum. Accruals of 0.10, 0.09, 0.25, 0.17, 0.16, 0.16 and a total of **0.93**.

**Alternative, top down:** Round the total once to 0.92, then allocate it back across the days by largest remainder, giving 0.10, 0.09, 0.25, 0.17, 0.16, 0.15.

Both hold. They differ by 0.01.

**Why bottom up:** The sentence makes the daily accruals the primary objects and the total derived from them. Bottom up satisfies the rule by construction, so there is never a remainder to reconcile. Top down satisfies it by adding an allocation step afterwards, which is a rule you have to remember to apply.

Daily accrual is also what a bank actually books. Each day's accrual is a real entry that reconciles on its own.

**What it costs:** Bottom up inherits the upward bias of `HALF_UP`, since it rounds up on every partial fils and never down. Here that is 0.01 on 0.92. At scale it is a systematic transfer, and top down removes it. `ARCHITECTURE.md` records this as something to measure before go live.

## A11. Three equal BHD instalments

Three equal instalments of BHD 10.000 do not exist at three decimal places.

**Taken:** 3.334, 3.333, 3.333. Largest remainder, residual to the earliest part.

**Why:** Equality and conservation are in conflict and only one can hold. A ledger that can invent BHD 0.002 can invent anything. See `REJECTED.md` criterion 7.

**On the residual placement:** All three share a value date of Day 5, so the placement moves no money in time and is presentational. It is fixed anyway, because an allocation that depends on nothing visible changes the day somebody reorders a loop.

## A12. Whether the instalments share a value date

The brief gives one value date for E10.

**Taken:** All three land on Day 5.

**Alternative:** Spread across Days 5, 6 and 7. That would push part of the credit outside the window and would change the ACC-002 interest.

**Why:** The brief says "value_date Day 5", singular. Nothing suggests three dates.

## A13. What value date a reversal carries

**Taken:** The original's. E9 inherits Day 2 from E7, which the brief confirms.

**Why it matters even though the brief settles it:** The alternative is reversing at the current value date, which leaves the whole fee and interest footprint in place. Under that reading Day 2 stays at (395.00), Day 3 at 5.00, Day 4 at (205.00), and the interest total falls from 0.93 to about 0.26.

Real banks do both. An error correction reverses at the original value date. A customer initiated return often reverses at the current date, deliberately leaving the footprint because the money genuinely was gone during that period.

The brief chose the first, and that choice is what makes the fee asymmetry visible. Had E9 reversed at Day 6, the fees would obviously stand and there would be nothing to notice.

## A14. Whether a reversal also reverses the fees it caused

**Taken:** No. The fees stand.

**Why:** Interest is derived and recomputes itself. A fee is an assessed decision, recording what the system concluded on Day 5 with the facts it had. Retracting a decision needs its own event carrying its own reason.

**Why this is a gap and not just a choice:** A `REVERSAL` carries no reason code, so the system cannot tell a bank error, where the fees must be refunded under CBUAE consumer protection rules, from a legitimate customer return, where the account really was overdrawn and the fees stand. Identical events, opposite correct answers.

This is the one intentional failing test. See `test/known-gap.e2e-spec.ts`.

## A15. The rounding mode

The brief does not name one.

**Taken:** `HALF_UP`, away from zero.

**Consequence here:** None. No accrual in the window lands on a tie, so `HALF_EVEN` gives identical output.

**Consequence if the rate moves:** At 0.02 percent per day two accruals land on exact ties and the total differs by 0.02 between the modes. That is why the mode is fixed explicitly rather than discovered at the first tie. See `NUMBERS.md`.

## A16. What an overdraft costs in BHD

The brief prices the overdraft fee in AED. The system holds a BHD account.

**Taken:** A fee is charged in the currency of the account. Only AED is priced. An account in an unpriced currency that goes overdrawn raises `FEE_NOT_PRICED_FOR_CURRENCY`.

**Why not default:** Charging BHD 25.000 would be roughly ten times the intended amount at real exchange rates. Charging BHD 25.000 as if the number transferred, or defaulting to zero, are both guesses at an amount a customer gets charged.

**Consequence here:** None. ACC-002 never goes below zero. The gap is real anyway: a two currency system with a one currency fee schedule is incomplete, and it fails loudly rather than quietly.

## A17. How the opening balance is modelled

**Taken:** An explicit ledger entry value dated Day 0.

**Alternative:** A field on the account, added to every balance query.

**Why:** A balance stays a pure function of the entry list, and no caller has to remember the starting figure. Both accounts open at zero, so this changes nothing here, and it would matter immediately at any non zero opening balance.

## A18. An amount with more precision than its currency

**Taken:** Refused. `parseAmount` raises `PRECISION_EXCEEDS_CURRENCY`. `1.005` is a fault in AED and valid in BHD.

**Why:** Rounding an input silently discards what the caller meant, and nothing downstream can tell that it happened. No such amount appears in the brief, so this never fires; the guard exists because the failure it prevents is invisible.

## A19. Whether the capitalization credit feeds its own accrual

**Taken:** No. Day 6 accrues on 390.00, the balance before capitalization, not on 390.93.

**Why:** Otherwise the calculation depends on its own result.

## A20. How many accrual days the window has

**Taken:** Six. Day 1 to Day 6 inclusive.

**Alternative:** Five, if the convention excludes one end of the period, as some interest conventions do. That would lower the ACC-001 total from 0.93 to **0.77**.

**Why six:** The brief says "0.04 percent per day on the closing ledger balance" with no exclusion, and all six days have a closing balance.

## A21. Idempotency

No event carries an idempotency key, and nothing in the model prevents the same event being replayed twice.

**Taken:** Not addressed. Replaying the stream into the same ledger would double post everything.

**Why:** Out of scope for an in-memory core with a fixed input. Recorded as a known gap and named in `ARCHITECTURE.md` section one, where it matters.

## A22. How far back a value date may reach

Nothing limits back valuing. E7 reaches back three days. Nothing would stop it reaching back three years.

**Taken:** Unlimited.

**Why it matters:** This is the single largest production gap in the design. An unbounded back value window means an unbounded restatement window, which means every closed accounting period, every issued statement and every submitted regulatory return is permanently provisional.

It is also the same gap that breaks the performance of the fee engine at scale, since every day close re-walks the entire history. `ARCHITECTURE.md` names the closed period lock as the one control to add before going live, and it closes both problems with one mechanism.

---

## Two things that are not ambiguous, and were checked

**Whether a hold touches the ledger balance.** It does not. The brief is explicit, and criterion 5 restates it correctly.

**Whether E6 should be refused.** The brief says so in criterion 4, and it is implemented as written. That it diverges from how a real card issuer must behave is a production caveat, not an ambiguity in the brief. See `REJECTED.md`.
