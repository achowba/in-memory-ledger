# Error handling convention

## Rejection is not an exception

Two different things go wrong, and they are handled differently.

| Kind                | Example                                                                                                                | Handling                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A domain refusal    | A settlement names an authorization that does not exist. An authorization would take the available balance below zero. | Append a rejected record to the event log, with a code and a reason. Continue the replay. |
| A programming fault | A currency has no registered exponent. An amount carries more precision than its currency allows.                      | Throw. The replay stops.                                                                  |

A domain refusal is an expected outcome of a correct system, and the brief requires it to be printed. A domain refusal must never be thrown away, and must never be silently swallowed.

A programming fault means the model has been given something it was not designed for. Failing loudly is correct, because a guessed answer would be worse than no answer.

## Codes

Every refusal and every fault carries a stable code from `src/common/errors/error-codes.ts`. A code is what a reader branches on and what a test asserts. A message is for a human and may change.

A code names the situation, not the message text: `SETTLEMENT_WITHOUT_AUTHORIZATION`, not `AUTH_NOT_FOUND_ERROR_MESSAGE`.

## What the log records

The event log records the refusal, the code, the reason, and the input that caused it. The refusal is part of what happened, so the append-only rule covers it. See [ledger domain](ledger-domain.convention.md).

Never log a refusal and then also throw for the same cause. Pick one, and pick it from the table above.
