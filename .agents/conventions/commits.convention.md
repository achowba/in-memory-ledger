# Commits convention

## Format

```
type(scope): subject
```

A scope is required. Never omit it. The template in `.gitmessage` is wired up with `git config commit.template .gitmessage`.

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`, `revert`.

**Scopes for this repository:** `money`, `events`, `ledger`, `auth`, `fees`, `interest`, `replay`, `report`. For cross-cutting work: `repo`, `deps`, `docs`, `config`.

**Subject:** imperative mood, lowercase, no trailing period. Keep the header under 100 characters.

**Body:** optional. Leave a blank line, then explain what changed and why. Wrap at 100.

## History

The history is not squashed and not rewritten. A reader must be able to follow the order in which the work was done and the order in which the decisions were made.

A commit that reverses an earlier decision says so in its body, and names the decision it reverses. The abandoned approach is also recorded in `REJECTED.md`, because a commit body is not where a reviewer looks for it.
