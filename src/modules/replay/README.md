# replay

## What it does

Holds the event stream of the brief as data, and runs it across the six day window.

## How it relates to the rest of the project

The only module that knows about all the others. It appends to `modules/ledger`, records in `modules/events`, asks `modules/authorizations` about holds, calls `modules/fees` at each day close and `modules/interest` once at the end. `modules/report` renders what it returns.

## The decisions it owns

### The scenario is data, written in the notation of the brief

`scenario.ts` writes amounts as text and parses them, so `parseAmount('AED', '1200.00')` sits where the brief says `AED 1,200.00`. The file can be diffed against the brief line by line during review.

Writing `120000n` would execute faster and be impossible to check.

### Each day runs the same three steps

1. Apply the events booked on that day, in arrival order.
2. Assess overdraft fees for each account, walking the window from the start.
3. Snapshot each account, recording any earlier day whose closing balance moved.

Fees run after the day's events rather than before, so a backdated entry arriving today is already in the ledger when the window is reassessed. Interest runs once after the last day, because an accrual is worked out from the balances as they finally stand.

### Only an authorization is gated on available balance

| Event | Gated | Why |
|---|---|---|
| `AUTHORIZATION` | Yes | The brief states the rule, and it is the only place it states it. |
| `DEBIT` | No | A direct debit posts and may overdraw. That is the reason an overdraft fee exists. Gating it would decline E7 and make acceptance criterion 1 unreachable. |
| `SETTLEMENT` | No | The hold already reserved the funds and the bank is committed to the payment. |

### A reversal never edits the original

E9 appends an opposite entry for each entry E7 produced, inheriting the original value date. E7 itself is untouched, and the pair can be read together through `reversesEntryId`.

Inheriting the value date is what makes the correction land on the day the money was supposed to have moved, rather than on the day the mistake was noticed. Reversing at the current value date instead would leave the whole fee and interest footprint in place and produce a very different answer. See `AMBIGUITIES.md`.

Three guards: the target must exist, must have been accepted, and must not already carry a reversal. Reversing twice would credit the account for money that only ever left it once.

### Restatements are computed and reported, not inferred

The engine remembers the closing balance it last reported for each account and day. At each day close it recomputes the window and reports any earlier day that moved.

That turns the central idea of the exercise into visible output. Day five prints day two moving from 250.00 to (395.00), day three from 650.00 to 5.00, and day four from 465.00 to (205.00). Day six prints all four moving back.

### E10 arrives out of order, and the engine says so

The brief lists E10 tenth and books it on day five, while E9 sits ninth and is booked on day six. The list is not in arrival order, or a booking date is wrong.

The engine groups by booking day and raises `OUT_OF_ORDER_BOOKING`. Both accounts are independent, so either reading produces identical balances, and `test/order-independence.e2e-spec.ts` proves it. Reordering silently would hide a data quality problem behind a correct answer.

## Its dependencies on other modules

All of them. That is what makes it the only place a change to the sequence of the day has to be made.
