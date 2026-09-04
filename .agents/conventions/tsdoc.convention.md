# TSDoc convention

"TSDoc" and "JSDoc" mean the same thing here: the doc comment block above a declaration. The linter that checks it is `eslint-plugin-tsdoc`.

Enforced, not merely expected. `tsdoc/syntax` is an eslint error, so a malformed or unknown tag fails the build rather than review.

## What gets a block

Everything exported, and every method: functions, classes, interfaces, type aliases, and exported constants. A short declaration still has a reason to exist that its body does not state.

## The block goes above the declaration

Never inside it. One block per declaration, describing its members with `@property`.

Wrong:

```ts
export interface ILedgerEntry {
  /** The day this entry changes the balance. */
  valueDate: Day;
}
```

Right:

```ts
/**
 * One balance-affecting posting.
 *
 * @property valueDate - The day this entry changes the balance, which is not
 *   always the day the entry arrived.
 */
export interface ILedgerEntry {
  readonly valueDate: Day;
}
```

A member list stays scannable when it is not tripled in height by interleaved comments, and one block moves as a unit when the declaration moves.

## Tags

Standard TSDoc: `@remarks`, `@param`, `@returns`, `@throws`, `@typeParam`, `@example`, `@see`, `@deprecated`, and the inline `{@link}`.

Two custom block tags are declared in `tsdoc.json`, which is the only place a new tag may be introduced:

| Tag | Use |
|---|---|
| `@property` | One per member of an interface, a type alias, or a const object. Repeatable. |
| `@steps` | The ordered steps a function takes, where the sequence is the thing worth knowing. |

Using a tag that is neither standard nor declared in `tsdoc.json` is a lint error.

## Content

- Say what the declaration does and why it exists. Describe behaviour, not implementation. A caller reads the block to decide whether to call.
- Document every parameter with `@param`, the result with `@returns`, and every exception a caller can expect with `@throws`.
- Put the non-obvious reasoning in `@remarks`: why the order matters, why the tempting simpler approach is wrong, which acceptance criterion the code answers.
- Update the block in the same edit as the code. A stale block is worse than none, because it is trusted.
