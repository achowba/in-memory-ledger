# Artifacts convention

Every workflow output goes under `artifacts/`. Never the system temp directory, which is volatile, hidden from search, and gone on reboot.

## Naming

```
artifacts/<category>/<descriptor>_<YYYYMMDDHHMMSS>.<type>.md
```

- `<descriptor>` is short and `snake_case`.
- `<YYYYMMDDHHMMSS>` is the creation time, from `date "+%Y%m%d%H%M%S"`.
- `<type>` matches the kind of output: `plan`, `notes`, `ref`, `handoff`.
- Print the path after writing the file, so the file can be found again.

## Categories

| Path | Holds |
|---|---|
| `artifacts/plans/` | Implementation plans, written before the code they describe. |
| `artifacts/notes/` | Research and working write ups, including the task analysis. |
| `artifacts/refs/` | Lookup documents reused across sessions. |

## Not committed

`artifacts/` is in `.gitignore`. These files are working output, not deliverables.

The distinction matters for this repository. `artifacts/notes/` holds the working analysis of the brief. `AMBIGUITIES.md` and `REJECTED.md` hold the conclusions that the reader is meant to see. Analysis is not a deliverable. A conclusion is.
